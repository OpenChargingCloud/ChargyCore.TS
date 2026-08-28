//
// Generates the OCMF-Test-01 fixture:
//
//   A 22 kW AC charging session of 3 minutes with a new signed meter reading
//   every 10 seconds. The OCMF documents of the session are:
//
//       - the start value        (RD: B)     signed with the energyMeter key
//       - 17 intermediate values (RD: C)     signed with the
//                                            cpo_signEnergyMeterValues key
//       - the end value          (RD: B, E)  signed with the energyMeter key
//
//   The end document carries the start AND the end reading, which is the
//   classic OCMF transaction document understood by existing solutions.
//
//   Those documents and the public keys are filled into the placeholders of
//   OCMF-Test-01__TEMPLATE.json, and the result is signed as a whole by both
//   operator document keys, one ECDSA and one Ed25519.
//
//   The output is not a single file but a SERIES: OCMF-Test-01__0000.json has
//   no meter values yet, __0001.json has the first one, and so on up to the
//   end value. Each document states when it was last updated and references
//   the one it supersedes by the hash of that document, which chains the
//   series together cryptographically.
//
//   Usage:
//
//       node generateOCMFTest01.mjs [--individual|--incremental]
//                                   [--template <file>] [--output <basename>]
//
//   --individual  (default) every intermediate document contains just its own
//                 reading
//   --incremental every intermediate document contains all readings of the
//                 session so far, i.e. the start value and every intermediate
//                 value up to that point
//
//   The charging power is not constant: the first interval ramps up and the
//   last interval ramps down, the intervals in between fluctuate around the
//   nominal 22 kW. The fluctuation comes from a seeded PRNG, so the readings
//   are identical on every run. (The ECDSA signatures are not: they are
//   randomized by design and therefore differ on every run.)
//

import { generateKeyPairSync, createPrivateKey, createPublicKey, createHash,
         sign as ecdsaSign, verify as ecdsaVerify } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync,
         readFileSync, writeFileSync }                       from "node:fs";
import { join }                                              from "node:path";

const outputDirectory  = import.meta.dirname;

const sessionDuration  = 180;                               // seconds
const readingInterval  = 10;                                // seconds
const startMeterValue  = 1234;                              // kWh
const startTimestamp   = Date.UTC(2026, 7, 28, 12, 0, 0);   // 2026-08-28T14:00:00+02:00
const timeZoneOffset   = 120;                               // minutes (+0200, CEST)

const nominalPower     = 22;                                // kW
const rampUpPower      = 12.4;                              // kW, mean power of the first interval
const rampDownPower    =  9.6;                              // kW, mean power of the last interval
const powerNoise       =  1.0;                              // kW, peak deviation while charging
const powerNoiseSeed   = 20260828;


//#region Command line parameters

const cliArguments  = process.argv.slice(2);

let   writeMode     = "individual";
let   templateFile  = join(outputDirectory, "OCMF-Test-01__TEMPLATE.json");
let   outputFile    = join(outputDirectory, "OCMF-Test-01.json");

// The live link fixture next to this directory is by definition the final
// document of the series, the one carrying the end meter value. It is only
// written for the default output, so that test runs into other directories
// cannot clobber it.
let   liveLinkFile  = join(outputDirectory, "..", "ChargeTransparencyLiveLink_1.json");

for (let i = 0; i < cliArguments.length; i++)
{
    switch (cliArguments[i])
    {

        case "--individual":
            writeMode     = "individual";
            break;

        case "--incremental":
            writeMode     = "incremental";
            break;

        case "--template":
            templateFile  = cliArguments[++i] ?? templateFile;
            break;

        case "--output":
            outputFile    = cliArguments[++i] ?? outputFile;
            liveLinkFile  = null;
            break;

        case "--no-live-link":
            liveLinkFile  = null;
            break;

        default:
            console.error("Unknown parameter: " + cliArguments[i]);
            console.error("Usage: node generateOCMFTest01.mjs [--individual|--incremental] " +
                          "[--template <file>] [--output <basename>] [--no-live-link]");
            process.exit(1);

    }
}

//#endregion


mkdirSync(outputDirectory, { recursive: true });


//#region Key management

function loadOrCreateKeyPair(name, algorithm)
{

    const privateKeyPath = join(outputDirectory, "privateKey_" + name + ".pem");

    if (existsSync(privateKeyPath))
    {
        const privateKey = createPrivateKey(readFileSync(privateKeyPath, "utf8"));
        return { name, algorithm, privateKey, publicKey: createPublicKey(privateKey) };
    }

    const { privateKey, publicKey } = algorithm === "EdDSA-Ed25519"
                                          ? generateKeyPairSync("ed25519")
                                          : generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    return { name, algorithm, privateKey, publicKey };

}

function writeKeyPair(keyPair)
{

    writeFileSync(join(outputDirectory, "privateKey_" + keyPair.name + ".pem"),
                  keyPair.privateKey.export({ type: "pkcs8", format: "pem" }),
                  "utf8");

    writeFileSync(join(outputDirectory, "publicKey_"  + keyPair.name + ".pem"),
                  keyPair.publicKey.export({ type: "spki", format: "pem" }),
                  "utf8");

}

function signBytes(keyPair, data)
{

    // Ed25519 hashes internally, so it takes no separate digest algorithm.
    return keyPair.algorithm === "EdDSA-Ed25519"
               ? ecdsaSign(null,     data, keyPair.privateKey)
               : ecdsaSign("sha256", data, keyPair.privateKey);

}

function verifyBytes(keyPair, data, signature)
{

    return keyPair.algorithm === "EdDSA-Ed25519"
               ? ecdsaVerify(null,     data, keyPair.publicKey, signature)
               : ecdsaVerify("sha256", data, keyPair.publicKey, signature);

}

//#endregion


//#region Applying an encodings pipeline to a public key

function derLengthSize(bytes, index)
{
    return bytes[index] < 0x80 ? 1 : 1 + (bytes[index] & 0x7F);
}

function derLength(bytes, index)
{

    if (bytes[index] < 0x80)
        return bytes[index];

    let length = 0;

    for (let i = 1; i <= (bytes[index] & 0x7F); i++)
        length = length * 256 + bytes[index + i];

    return length;

}

// The byte form of a public key for the given structure.
function publicKeyBytes(publicKey, structure)
{

    const spki = publicKey.export({ type: "spki", format: "der" });

    if (structure === "SubjectPublicKeyInfo")
        return spki;

    // The BIT STRING payload of the SPKI, i.e. the bare key material without
    // its ASN.1 wrapper. This is what EdDSA and ML-DSA keys usually travel as.
    if (structure === "raw")
    {

        // SubjectPublicKeyInfo ::= SEQUENCE { AlgorithmIdentifier, BIT STRING }
        let index = 1 + derLengthSize(spki, 1);

        if (spki[index] !== 0x30)
            throw new Error("The SPKI does not start with an AlgorithmIdentifier!");

        index += 1 + derLengthSize(spki, index + 1) + derLength(spki, index + 1);

        if (spki[index] !== 0x03)
            throw new Error("The SPKI does not contain a BIT STRING!");

        const length = derLength(spki, index + 1);
        const start  = index + 1 + derLengthSize(spki, index + 1);

        if (spki[start] !== 0x00)
            throw new Error("The SPKI BIT STRING has unused bits!");

        return spki.subarray(start + 1, start + length);

    }

    throw new Error("Unsupported public key structure: " + String(structure));

}

// Applies an encodings pipeline such as [ "SubjectPublicKeyInfo", "DER", "hex" ]
// or [ "raw", "hex" ] or [ "SubjectPublicKeyInfo", "DER", "SHA-256", "hex" ]
// to a public key.
function encodePublicKey(publicKey, pipeline)
{

    let index      = 0;
    const structure = pipeline[index++];

    if (structure === "SubjectPublicKeyInfo" && pipeline[index++] !== "DER")
        throw new Error('A "SubjectPublicKeyInfo" must be serialized as "DER"!');

    let bytes = publicKeyBytes(publicKey, structure);

    for (; index < pipeline.length; index++)
    {
        switch (pipeline[index])
        {

            case "SHA-256":    bytes = createHash("sha256").update(bytes).digest();  break;
            case "SHA-384":    bytes = createHash("sha384").update(bytes).digest();  break;
            case "SHA-512":    bytes = createHash("sha512").update(bytes).digest();  break;

            case "hex":        return bytes.toString("hex").toUpperCase();
            case "base64":     return bytes.toString("base64");
            case "base64url":  return bytes.toString("base64url");

            default:
                throw new Error("Unsupported encodings step: " + String(pipeline[index]));

        }
    }

    throw new Error("An encodings pipeline must end with a text encoding!");

}

// The key id is always computed over the CANONICAL form named by
// "keyIdGeneration", no matter how the key itself is stored in the document.
// Hashing the raw key material of an Ed25519 key would yield a different id
// than hashing its SubjectPublicKeyInfo, so the two must not be mixed.
function keyIdOf(publicKey, keyIdGeneration)
{
    return encodePublicKey(publicKey, keyIdGeneration);
}

// The energy meter signs the start and the end value, the charge point
// operator signs the intermediate values and the whole document. The operator
// holds two keys for signing documents, an ECDSA and an Ed25519 one, and both
// sign: heterogeneous keys and more than one key per key usage are the normal
// case, not an edge case.
const keyPairs = [
    loadOrCreateKeyPair("energyMeter",               "ECDSA-secp256r1"),
    loadOrCreateKeyPair("cpo_signEnergyMeterValues", "ECDSA-secp256r1"),
    loadOrCreateKeyPair("cpo_signCTRs",              "ECDSA-secp256r1"),
    loadOrCreateKeyPair("cpo_signCTRs_Ed25519",      "EdDSA-Ed25519")
];

for (const keyPair of keyPairs)
    writeKeyPair(keyPair);

const keyPairsByName = new Map(keyPairs.map(keyPair => [ keyPair.name, keyPair ]));

const [ energyMeterKeyPair, cpoSignEnergyMeterValuesKeyPair,
        cpoSignCTRsKeyPair, cpoSignCTRsEd25519KeyPair ] = keyPairs;

//#endregion


//#region Meter readings

function formatOCMFTimestamp(offsetSeconds)
{

    const localTime  = new Date(startTimestamp + offsetSeconds * 1000 + timeZoneOffset * 60 * 1000);
    const pad        = (value, length = 2) => String(value).padStart(length, "0");

    const sign       = timeZoneOffset < 0 ? "-" : "+";
    const offset     = Math.abs(timeZoneOffset);

    return pad(localTime.getUTCFullYear(), 4) + "-" +
           pad(localTime.getUTCMonth() + 1)   + "-" +
           pad(localTime.getUTCDate())        + "T" +
           pad(localTime.getUTCHours())       + ":" +
           pad(localTime.getUTCMinutes())     + ":" +
           pad(localTime.getUTCSeconds())     + "," +
           pad(localTime.getUTCMilliseconds(), 3)   +
           sign + pad(Math.floor(offset / 60)) + pad(offset % 60) +
           " S";

}

// Seeded PRNG (mulberry32), so that the meter readings are reproducible.
function createRandom(seed)
{

    let state = seed >>> 0;

    return () => {
        state  = (state + 0x6D2B79F5) >>> 0;
        let t  = Math.imul(state ^ (state >>> 15), state | 1);
        t     ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

}

const random        = createRandom(powerNoiseSeed);
const readingCount  = sessionDuration / readingInterval + 1;
const readings      = [];

// The meter is counted in units of 0.1 Wh (1e-4 kWh) to keep the differences
// between two readings exact and free of floating point artefacts.
let   meterValueE4  = Math.round(startMeterValue * 10000);

for (let i = 0; i < readingCount; i++)
{

    if (i > 0)
    {

        const meanPower  = i === 1                 ? rampUpPower
                         : i === readingCount - 1  ? rampDownPower
                         :                           nominalPower;

        const power      = meanPower + (2 * random() - 1) * powerNoise;

        meterValueE4    += Math.round(power * readingInterval / 3600 * 10000);

    }

    readings.push({
        "TM":  formatOCMFTimestamp(i * readingInterval),
        "TX":  i === 0                 ? "B"
             : i === readingCount - 1  ? "E"
             :                           "C",
        "RV":  "@@" + (meterValueE4 / 10000).toFixed(4) + "@@",
        "RI":  "1-0:1.8.0*255",
        "RU":  "kWh",
        "RT":  "AC",
        "EF":  "",
        "ST":  "G"
    });

}

function readingValue(reading)
{
    return Number(reading.RV.replaceAll("@", ""));
}

// Mean power of the interval ending at reading i, derived from the readings.
function intervalPower(i)
{

    return i === 0
               ? null
               : (readingValue(readings[i]) - readingValue(readings[i - 1])) * 3600 / readingInterval;

}

//#endregion


//#region OCMF document creation

function createOCMFDocument(paginationId, includedReadings, keyPair)
{

    const payload = {
        "FV":  "1.4",
        "GI":  "GraphDefined Charging Station",
        "GS":  "CS-OCMF-TEST-01",
        "GV":  "1.0.0",
        "PG":  "T" + paginationId,
        "MV":  "GraphDefined",
        "MM":  "GD-OCMF-AC22",
        "MS":  "GD-METER-OCMF-TEST-01",
        "MF":  "1.0.0",
        "IS":  true,
        "IL":  "TRUSTED",
        "IF":  [ "RFID_PLAIN" ],
        "IT":  "ISO14443",
        "ID":  "04A9B7C21E5D80",
        "CT":  "EVSEID",
        "CI":  "DE*GEF*E12345678*1",
        "CF":  "1.0.0",
        "RD":  includedReadings
    };

    // OCMF reading values are JSON numbers, but the meter emits them with a
    // fixed resolution of 4 decimals, which JSON.stringify() would truncate.
    const rawPayload  = JSON.stringify(payload).replace(/"@@([0-9.]+)@@"/g, "$1");

    const signature   = ecdsaSign("sha256", Buffer.from(rawPayload, "utf8"), keyPair.privateKey);

    if (!ecdsaVerify("sha256", Buffer.from(rawPayload, "utf8"), keyPair.publicKey, signature))
        throw new Error("Signature of OCMF document " + paginationId + " does not verify!");

    return "OCMF|" + rawPayload + "|" + JSON.stringify({
        "SA":  "ECDSA-secp256r1-SHA256",
        "SE":  "hex",
        "SM":  "application/x-der",
        "SD":  signature.toString("hex").toUpperCase()
    });

}

//#endregion


//#region The OCMF documents of the charging session

const documents = [];

// The start value, signed with the energy meter key.
documents.push({
    "role":      "start",
    "readings":  [ readings[0] ],
    "keyPair":   energyMeterKeyPair
});

// The intermediate values, signed with the CPO meter value key.
for (let i = 1; i < readingCount - 1; i++)
    documents.push({
        "role":      "intermediate",
        "readings":  writeMode === "incremental"
                         ? readings.slice(0, i + 1)
                         : [ readings[i] ],
        "keyPair":   cpoSignEnergyMeterValuesKeyPair
    });

// The end value, signed with the energy meter key. It carries the start AND
// the end reading, which is the classic OCMF transaction document understood
// by existing solutions.
documents.push({
    "role":      "end",
    "readings":  [ readings[0], readings.at(-1) ],
    "keyPair":   energyMeterKeyPair
});

// The encodings are a property of the series, not of a single meter value,
// therefore they are stated once for all of them: every value is an OCMF
// document in its plain textual form, not encoded any further.
const signedMeterValuesEncodings = [ "OCMF", "plain" ];

const signedMeterValueDocuments  = documents.map((document, index) =>
                                       createOCMFDocument(index + 1,
                                                          document.readings,
                                                          document.keyPair));

//#endregion


//#region JSON helpers

// These arrays are short enough to stay on one line, which JSON.stringify()
// would not do.
const inlineArrayProperties = [ "encodings", "keyUsage", "excludedProperties" ];

function renderJSON(value)
{

    let text = JSON.stringify(value, null, 4);

    for (const property of inlineArrayProperties)
        text = text.replace(new RegExp('"' + property + '": \\[[^\\]]*\\]', "g"),
                            match => '"' + property + '": [ ' +
                                     JSON.parse(match.slice(match.indexOf("[")))
                                         .map(entry => JSON.stringify(entry))
                                         .join(", ") + " ]");

    return text;

}

function indentationOf(text, index)
{
    return text.slice(text.lastIndexOf("\n", index) + 1).match(/^[ \t]*/)[0];
}

function indentContinuationLines(text, indentation)
{
    return text.split("\n").map((line, index) => index === 0 ? line : indentation + line).join("\n");
}

// Replaces "{{name}}" by the given JSON text, keeping the layout of the
// template intact.
function fillPlaceholder(text, name, replacement)
{

    const placeholder  = '"{{' + name + '}}"';
    const index        = text.indexOf(placeholder);

    if (index === -1)
        throw new Error("The template does not contain the placeholder " + placeholder + "!");

    if (text.indexOf(placeholder, index + 1) !== -1)
        throw new Error("The template contains the placeholder " + placeholder + " more than once!");

    return text.slice(0, index) +
           indentContinuationLines(replacement, indentationOf(text, index)) +
           text.slice(index + placeholder.length);

}

// Replaces the empty array of the given property by the given JSON text.
function fillEmptyArray(text, property, replacement)
{

    const match = new RegExp('("' + property + '"\\s*:\\s*)\\[\\s*\\]').exec(text);

    if (match === null)
        throw new Error('The template does not contain an empty "' + property + '" array!');

    return text.slice(0, match.index) +
           match[1] +
           indentContinuationLines(replacement, indentationOf(text, match.index)) +
           text.slice(match.index + match[0].length);

}

// RFC 8785 (JCS): no whitespace, object keys sorted by UTF-16 code unit,
// RFC 8259 string escaping, ECMAScript number serialization.
function canonicalJSON(value)
{

    if (value === null)              return "null";
    if (typeof value === "boolean")  return value ? "true" : "false";
    if (typeof value === "string")   return JSON.stringify(value);

    if (typeof value === "number")
    {
        if (!Number.isFinite(value))
            throw new Error("Non-finite numbers are not valid JSON!");
        return JSON.stringify(value);
    }

    if (Array.isArray(value))
        return "[" + value.map(canonicalJSON).join(",") + "]";

    if (typeof value === "object")
        return "{" + Object.keys(value)
                           .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
                           .map(key => JSON.stringify(key) + ":" + canonicalJSON(value[key]))
                           .join(",") + "}";

    throw new Error("Unsupported JSON value of type " + typeof value + "!");

}

//#endregion


//#region Filling the template

const templateText = readFileSync(templateFile, "utf8");
const templateJSON = JSON.parse(templateText);

if (!Array.isArray(templateJSON.keyIdGeneration))
    throw new Error('The template must contain a "keyIdGeneration" pipeline!');

if (!Array.isArray(templateJSON.docRefIdGeneration))
    throw new Error('The template must contain a "docRefIdGeneration" pipeline!');

if (typeof templateJSON.created !== "string")
    throw new Error('The template must contain a "created" timestamp!');

// Every public key entry states its own "encodings", and the generator honours
// them instead of assuming one representation: an Ed25519 key may well travel
// as raw bytes next to an EC key in SubjectPublicKeyInfo form.
function collectPublicKeyPlaceholders(value, found = [])
{

    if (Array.isArray(value))
        for (const entry of value)
            collectPublicKeyPlaceholders(entry, found);

    else if (value !== null && typeof value === "object")
    {

        const placeholder = /^\{\{publicKey:(.+)\}\}$/.exec(
                                typeof value["value"] === "string" ? value["value"] : ""
                            );

        if (placeholder !== null)
        {

            if (!Array.isArray(value["encodings"]))
                throw new Error("The public key entry " + placeholder[0] + " has no encodings!");

            found.push({ name: placeholder[1], encodings: value["encodings"], algorithm: value["algorithm"] });

        }

        for (const entry of Object.values(value))
            collectPublicKeyPlaceholders(entry, found);

    }

    return found;

}

let baseText     = templateText;
const publicKeys = new Map();

for (const { name, encodings, algorithm } of collectPublicKeyPlaceholders(templateJSON))
{

    const keyPair = keyPairsByName.get(name);

    if (keyPair === undefined)
        throw new Error("The template references an unknown key: " + name);

    if (algorithm !== keyPair.algorithm)
        throw new Error("The template states " + String(algorithm) + " for " + name +
                        ", but that key pair is " + keyPair.algorithm + "!");

    const encoded = encodePublicKey(keyPair.publicKey, encodings);

    publicKeys.set(name, { encodings, value: encoded });
    baseText = fillPlaceholder(baseText, "publicKey:" + name, JSON.stringify(encoded));

}

// Removes the line carrying the given property, for the properties a document
// does not have yet.
function removeLine(text, needle)
{

    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const lines   = text.split(newline);
    const index   = lines.findIndex(line => line.includes(needle));

    if (index === -1)
        throw new Error("The template has no line containing " + needle + "!");

    lines.splice(index, 1);

    return lines.join(newline);

}

//#endregion


//#region Document references

// Applies a pipeline such as [ "SHA-256", "hex" ] to a byte string.
function applyBytePipeline(bytes, pipeline)
{

    for (const step of pipeline)
    {
        switch (step)
        {

            case "SHA-256":    bytes = createHash("sha256").update(bytes).digest();  break;
            case "SHA-384":    bytes = createHash("sha384").update(bytes).digest();  break;
            case "SHA-512":    bytes = createHash("sha512").update(bytes).digest();  break;

            case "hex":        return bytes.toString("hex").toUpperCase();
            case "base64":     return bytes.toString("base64");
            case "base64url":  return bytes.toString("base64url");

            default:
                throw new Error("Unsupported pipeline step: " + String(step));

        }
    }

    throw new Error("A pipeline must end with a text encoding!");

}

// The reference to a document is computed over the document AS A WHOLE, its
// signatures included, because it has to identify exactly this published
// version. That is deliberately not the same input as the one the signatures
// cover, which excludes "signatures".
function docRefIdOf(documentJSON)
{
    return applyBytePipeline(Buffer.from(canonicalJSON(documentJSON), "utf8"),
                             templateJSON.docRefIdGeneration);
}

function utcTimestamp(offsetSeconds)
{
    return new Date(startTimestamp + offsetSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

//#endregion


//#region Writing the series

const keyIds = new Map(keyPairs.map(keyPair =>
                   [ keyPair.name, keyIdOf(keyPair.publicKey, templateJSON.keyIdGeneration) ]));

// The operator signs with both of its document keys. The signature encodings
// differ because the algorithms do: ECDSA produces an ASN.1 Ecdsa-Sig-Value,
// Ed25519 produces 64 raw bytes with no ASN.1 layer at all.
const documentSigners = [
    { keyPair: cpoSignCTRsKeyPair,         encodings: [ "Ecdsa-Sig-Value", "DER", "hex" ] },
    { keyPair: cpoSignCTRsEd25519KeyPair,  encodings: [ "raw", "hex" ] }
];

const outputBase       = outputFile.replace(/\.json$/i, "");
const writtenDocuments = [];

let previousDocRefId = null;

for (let n = 0; n <= signedMeterValueDocuments.length; n++)
{

    let text = baseText;

    // The moment the newest meter value entered the document. Before the first
    // one there is nothing to update, so the document still carries its own
    // creation time.
    const lastUpdated = n === 0
                            ? templateJSON.created
                            : utcTimestamp((n - 1) * readingInterval);

    text = fillPlaceholder(text, "lastUpdated", JSON.stringify(lastUpdated));

    // The document this one supersedes, referenced by its hash. The first
    // document of a series supersedes nothing.
    text = n === 0
               ? removeLine(text, '"updates"')
               : fillPlaceholder(text, "updates", JSON.stringify(previousDocRefId));

    // The meter values known so far. Before the first one there are none, and
    // the whole property is absent rather than present and empty: there is
    // nothing yet whose encoding could be described.
    text = n === 0
               ? removeLine(text, '"signedMeterValues"')
               : fillPlaceholder(text, "signedMeterValues", renderJSON({
                     "encodings":  signedMeterValuesEncodings,
                     "values":     signedMeterValueDocuments.slice(0, n)
                 }));

    const unresolvedPlaceholder = /\{\{[^}]*\}\}/.exec(text);

    if (unresolvedPlaceholder !== null)
        throw new Error("Unresolved placeholder " + unresolvedPlaceholder[0] + " in " + templateFile + "!");

    // The signatures cover everything but the "signatures" array itself. The
    // property is removed, not emptied, and the remainder is canonicalized
    // before hashing, so that the signature does not depend on the layout.
    const { signatures, ...signedProperties } = JSON.parse(text);

    if (!Array.isArray(signatures) || signatures.length !== 0)
        throw new Error('The template must contain an empty "signatures" array!');

    const canonicalDocument = Buffer.from(canonicalJSON(signedProperties), "utf8");

    const entries = documentSigners.map(signer => {

        const signature = signBytes(signer.keyPair, canonicalDocument);

        if (!verifyBytes(signer.keyPair, canonicalDocument, signature))
            throw new Error("The document signature of " + signer.keyPair.name + " does not verify!");

        // The key is referenced by its id only: who signed follows from where
        // that key is listed, and which key usage is required follows from
        // what is signed.
        return {
            "keyId":       keyIds.get(signer.keyPair.name),
            "algorithm":   signer.keyPair.algorithm === "EdDSA-Ed25519"
                               ? "EdDSA-Ed25519"
                               : "ECDSA-secp256r1-SHA256",
            "signedData":  {
                               "excludedProperties":  [ "signatures" ],
                               "encodings":           [ "JSON", "JCS", "UTF-8" ]
                           },
            "encodings":   signer.encodings,
            "value":       signature.toString("hex").toUpperCase()
        };

    });

    text = fillEmptyArray(text, "signatures", renderJSON(entries));

    const fileName = outputBase + "__" + String(n).padStart(4, "0") + ".json";

    writeFileSync(fileName, text, "utf8");

    const docRefId = docRefIdOf(JSON.parse(text));

    writtenDocuments.push({ n, fileName, lastUpdated, docRefId,
                            updates: previousDocRefId, values: n,
                            bytes: Buffer.byteLength(text, "utf8") });

    previousDocRefId = docRefId;

}

// The last document of the series IS the live link fixture.
if (liveLinkFile !== null)
    copyFileSync(writtenDocuments.at(-1).fileName, liveLinkFile);

//#endregion


for (const keyPair of keyPairs)
    console.log(keyPair.name.padEnd(28) + keyPair.algorithm.padEnd(18) +
                "keyId " + keyIds.get(keyPair.name) +
                (publicKeys.has(keyPair.name)
                     ? "   in document as " + JSON.stringify(publicKeys.get(keyPair.name).encodings)
                     : "   not in the document"));

console.log("");
console.log("write mode:  " + writeMode);
console.log("template:    " + templateFile);
console.log("output:      " + outputBase + "__0000.json ... __" +
            String(signedMeterValueDocuments.length).padStart(4, "0") + ".json");
console.log("");

for (const document of writtenDocuments)
    console.log(document.fileName.split(/[\\/]/).pop().padEnd(26) +
                String(document.values).padStart(2) + " meter value(s)  " +
                "lastUpdated " + document.lastUpdated + "  " +
                String(document.bytes).padStart(6) + " bytes  " +
                "docRefId " + document.docRefId.slice(0, 16) + "..." +
                (document.updates === null
                     ? "  updates nothing"
                     : "  updates " + document.updates.slice(0, 16) + "..."));

const totalEnergy = readingValue(readings.at(-1)) - readingValue(readings[0]);

console.log("");
console.log("documents:     " + writtenDocuments.length +
            "   meter values: 0 .. " + signedMeterValueDocuments.length);
console.log("total energy:  " + totalEnergy.toFixed(4) + " kWh  (mean " +
            (totalEnergy * 3600 / sessionDuration).toFixed(2) + " kW)");

// The three numbers the README quotes for the power profile.
const intervalPowers = readings.map((_, index) => intervalPower(index)).slice(1);
const whileCharging  = intervalPowers.slice(1, -1);

console.log("power profile: ramp up " + intervalPowers[0].toFixed(2) + " kW, " +
            "charging " + Math.min(...whileCharging).toFixed(2) + " .. " +
            Math.max(...whileCharging).toFixed(2) + " kW, " +
            "ramp down " + intervalPowers.at(-1).toFixed(2) + " kW");

if (liveLinkFile !== null)
{
    console.log("live link:     " + liveLinkFile);
    console.log("               is a copy of " +
                writtenDocuments.at(-1).fileName.split(/[\\/]/).pop());
}
