/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of ChargyCore <https://github.com/OpenChargingCloud/ChargyCore.TS>
 *
 * Licensed under the Affero GPL license, Version 3.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.gnu.org/licenses/agpl.html
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Signatures over a whole JSON document, as a charge transparency live link
// carries them: every entry of the "signatures" array names the key that signed
// by its id, which properties were covered, and how the covered properties were
// turned into bytes.
//
// Nothing here throws at the caller. A document that is unsigned, signed by an
// unknown key, or signed badly is reported as such and stays usable - whether
// that is worth a warning or worse is the caller's decision, not this module's.

import { sha256, sha384, sha512 }        from '@noble/hashes/sha2.js'
import * as chargyLib                    from './interfaces/chargyLib'
import { canonicalJSONBytes }            from './interfaces/CryptoUtils'
import { getSignatureSuite }             from './SignatureCrypto'
import type { NobleSignatureAlgorithm }  from './SignatureCrypto'


//#region Types

/** How one signature over a whole document came out. */
export type DocumentSignatureStatus =

    /** The key is known and the signature matches the signed data. */
    "validSignature"       |

    /** Everything resolved, but the signature does not match the signed data. */
    "invalidSignature"     |

    /** No public key of the document carries the key id the signature names. */
    "unknownPublicKey"     |

    /** The algorithm or one of the encodings is not supported here. */
    "unsupportedAlgorithm" |

    /** The entry is not a well-formed signature at all. */
    "malformed";


/** The outcome of one entry of the "signatures" array. */
export interface IDocumentSignatureResult {

    /** Position within the "signatures" array. */
    index:       number;

    /** The key id the signature names, when it names one. */
    keyId?:      string;

    /** The algorithm the signature names, when it names one. */
    algorithm?:  string;

    status:      DocumentSignatureStatus;

    /** Technical detail for developers; never localized, never shown as-is. */
    details?:    string;

}


/** How a document as a whole came out. */
export type DocumentSignaturesStatus =

    /** No "signatures" array, or an empty one: nothing to verify. */
    "unsigned"   |

    /** Every signature verified. */
    "allValid"   |

    /** At least one verified and at least one did not. */
    "someValid"  |

    /** Signatures are present, but not one of them verified. */
    "noneValid";


export interface IDocumentSignaturesResult {
    status:      DocumentSignaturesStatus;
    signatures:  Array<IDocumentSignatureResult>;
    validCount:  number;
}


/** A public key as a document lists it. */
export interface IDocumentPublicKey {
    algorithm:  string;
    encodings:  Array<string>;
    value:      string;
    keyUsage:   Array<string>;
}

//#endregion


//#region Constants

// How a key id is derived when a document does not say: the SHA-256 over the
// canonical SubjectPublicKeyInfo form, hexadecimal.
const defaultKeyIdGeneration:     Array<string> = [ "SubjectPublicKeyInfo", "DER", "SHA-256", "hex" ];

// What the signatures cover when a document does not say.
const defaultExcludedProperties:  Array<string> = [ "signatures" ];

// The only way of turning covered properties into bytes understood here:
// canonicalize the remaining JSON per RFC 8785 and read it as UTF-8.
const canonicalJSONEncodings:     Array<string> = [ "JSON", "JCS", "UTF-8" ];

// The SubjectPublicKeyInfo header of a key that is stored as bare key material.
// A key id is defined over the canonical SubjectPublicKeyInfo form, so a key
// stored raw - as Ed25519 keys usually are - has to be wrapped before it can be
// hashed: hashing the raw bytes would yield a different id for the same key.
const subjectPublicKeyInfoHeaders: Readonly<Record<string, string>> = {
    "EdDSA-Ed25519":   "302A300506032B6570032100",
    "EdDSA-Ed448":     "3043300506032B6571033A00",
    "ECDSA-secp256r1": "3059301306072A8648CE3D020106082A8648CE3D030107034200",
    "ECDSA-secp384r1": "3076301006072A8648CE3D020106052B81040022036200",
    "ECDSA-secp521r1": "30819B301006072A8648CE3D020106052B8104002303818600"
};

//#endregion


//#region ASN.1 DER

/** The DER length field starting at the given offset. */
function readDERLength(bytes:  Uint8Array,
                       offset: number): { length: number, size: number }
{

    const first = bytes[offset];

    if (first === undefined)
        throw new Error("Truncated ASN.1 length!");

    if (first < 0x80)
        return { length: first, size: 1 };

    const count = first & 0x7f;

    // A length of more than four bytes would exceed anything a public key can
    // plausibly be, and an indefinite length (0) is not valid DER.
    if (count === 0 || count > 4)
        throw new Error("Unsupported ASN.1 length!");

    let length = 0;

    for (let index = 1; index <= count; index++)
    {

        const byte = bytes[offset + index];

        if (byte === undefined)
            throw new Error("Truncated ASN.1 length!");

        length = (length * 256) + byte;

    }

    return { length, size: count + 1 };

}

// SubjectPublicKeyInfo ::= SEQUENCE { AlgorithmIdentifier, BIT STRING }
// The BIT STRING payload is the bare key material: the SEC1 point of an EC key,
// the 32 bytes of an Ed25519 key - which is also what the signature suites want.
function subjectPublicKeyInfoKeyMaterial(spki: Uint8Array): Uint8Array
{

    if (spki[0] !== 0x30)
        throw new Error("A SubjectPublicKeyInfo must start with a SEQUENCE!");

    let index = 1 + readDERLength(spki, 1).size;

    if (spki[index] !== 0x30)
        throw new Error("The SubjectPublicKeyInfo does not start with an AlgorithmIdentifier!");

    const algorithmLength = readDERLength(spki, index + 1);
    index += 1 + algorithmLength.size + algorithmLength.length;

    if (spki[index] !== 0x03)
        throw new Error("The SubjectPublicKeyInfo does not contain a BIT STRING!");

    const keyLength = readDERLength(spki, index + 1);
    const start     = index + 1 + keyLength.size;

    if (spki[start] !== 0x00)
        throw new Error("The SubjectPublicKeyInfo BIT STRING has unused bits!");

    const keyMaterial = spki.subarray(start + 1, start + keyLength.length);

    if (keyMaterial.length === 0)
        throw new Error("The SubjectPublicKeyInfo contains no key material!");

    return keyMaterial;

}

function wrapInSubjectPublicKeyInfo(keyMaterial: Uint8Array,
                                    algorithm:   string): Uint8Array
{

    const header = subjectPublicKeyInfoHeaders[algorithm];

    if (header === undefined)
        throw new Error("Cannot wrap a raw " + algorithm + " key into a SubjectPublicKeyInfo!");

    const headerBytes = chargyLib.hexToBytes(header);
    const spki        = new Uint8Array(headerBytes.length + keyMaterial.length);

    spki.set(headerBytes, 0);
    spki.set(keyMaterial, headerBytes.length);

    return spki;

}

//#endregion


//#region Encodings

function decodeText(value:    string,
                    encoding: string | undefined): Uint8Array
{

    switch (encoding)
    {

        case "hex":     return chargyLib.hexToBytes   (value);
        case "base64":  return chargyLib.base64ToBytes(value);

        default:
            throw new Error("Unsupported text encoding: " + String(encoding));

    }

}

function encodeText(bytes:    Uint8Array,
                    encoding: string): string | null
{

    switch (encoding)
    {

        case "hex":     return chargyLib.bytesToHex   (bytes).toUpperCase();
        case "base64":  return chargyLib.bytesToBase64(bytes);

        default:        return null;

    }

}

// The key material of a public key in the requested structure, converting
// between the stored form and the requested one where that is possible.
function publicKeyBytes(publicKey: IDocumentPublicKey,
                        structure: string): Uint8Array
{

    const storedStructure = publicKey.encodings[0];
    const storedBytes     = decodeText(publicKey.value, publicKey.encodings[publicKey.encodings.length - 1]);

    if (storedStructure === structure)
        return storedBytes;

    if (storedStructure === "SubjectPublicKeyInfo" && structure === "raw")
        return subjectPublicKeyInfoKeyMaterial(storedBytes);

    if (storedStructure === "raw" && structure === "SubjectPublicKeyInfo")
        return wrapInSubjectPublicKeyInfo(storedBytes, publicKey.algorithm);

    throw new Error("Cannot represent a " + String(storedStructure) + " key as " + structure + "!");

}

// The id of a public key, following the document's "keyIdGeneration" pipeline,
// e.g. [ "SubjectPublicKeyInfo", "DER", "SHA-256", "hex" ].
function computeKeyId(publicKey:        IDocumentPublicKey,
                      keyIdGeneration:  Array<string>): string | null
{

    let index = 0;

    const structure = keyIdGeneration[index++];

    if (structure === undefined)
        return null;

    // A SubjectPublicKeyInfo is only ever serialized as DER; the step is part
    // of the notation rather than a choice.
    if (structure === "SubjectPublicKeyInfo" && keyIdGeneration[index] === "DER")
        index++;

    let bytes: Uint8Array;

    try
    {
        bytes = publicKeyBytes(publicKey, structure);
    }
    catch
    {
        return null;
    }

    for (; index < keyIdGeneration.length; index++)
    {

        const step = keyIdGeneration[index];

        if (step === undefined)
            return null;

        switch (step)
        {

            case "SHA-256":  bytes = sha256(bytes);  break;
            case "SHA-384":  bytes = sha384(bytes);  break;
            case "SHA-512":  bytes = sha512(bytes);  break;

            // A pipeline ends with the text encoding of the id.
            default:         return encodeText(bytes, step);

        }

    }

    return null;

}

//#endregion


//#region Algorithms

// The signature algorithms of a document, mapped onto the suites available
// here. The key entries and the signature entries spell these differently: a
// key says "ECDSA-secp256r1", the signature that used it names the digest as
// well, "ECDSA-secp256r1-SHA256".
function nobleSignatureAlgorithm(algorithm: string): NobleSignatureAlgorithm | null
{

    switch (algorithm)
    {

        case "ECDSA-secp256r1-SHA256":  return "ECDSA-P256";
        case "ECDSA-secp384r1-SHA384":  return "ECDSA-P384";
        case "ECDSA-secp521r1-SHA512":  return "ECDSA-P521";
        case "EdDSA-Ed25519":           return "Ed25519";
        case "EdDSA-Ed448":             return "Ed448";
        case "ML-DSA-44":               return "ML-DSA-44";
        case "ML-DSA-65":               return "ML-DSA-65";
        case "ML-DSA-87":               return "ML-DSA-87";

        default:                        return null;

    }

}

//#endregion


//#region Reading the document

function asStringArray(value: unknown): Array<string> | undefined
{

    return Array.isArray(value) && value.every(entry => typeof entry === "string")
               ? value
               : undefined;

}

/**
 * Every public key a document lists, in the order they appear.
 *
 * The keys of a charge transparency live link live in three places: those of
 * the charging station operator, the one of the energy meter of the EVSE, and
 * those of the grid operator, which signs the power constraints it sends rather
 * than the document carrying them. A key that does not carry the three things
 * needed to use it - an algorithm, an encodings pipeline and a value - is
 * skipped rather than guessed at.
 */
export function collectDocumentPublicKeys(Document: chargyLib.JSONObject): Array<IDocumentPublicKey>
{

    const publicKeys  = new Array<IDocumentPublicKey>();

    const collectFrom = (candidates: unknown): void => {

        if (!Array.isArray(candidates))
            return;

        for (const candidate of candidates)
        {

            const entry      = chargyLib.asJSONObject(candidate);

            if (entry === undefined)
                continue;

            const algorithm  = chargyLib.asString(entry["algorithm"]);
            const value      = chargyLib.asString(entry["value"]);
            const encodings  = asStringArray(entry["encodings"]);
            const keyUsage   = asStringArray(entry["keyUsage"]) ?? [];

            if (algorithm === undefined || algorithm === "" ||
                value     === undefined || value     === "" ||
                encodings === undefined || encodings.length === 0)
            {
                continue;
            }

            publicKeys.push({ algorithm, encodings, value, keyUsage });

        }

    };

    const chargingStation = chargyLib.asJSONObject(Document["chargingStation"]);
    const evse            = chargyLib.asJSONObject(chargingStation?.["EVSE"]);

    collectFrom(chargyLib.asJSONObject(Document["chargingStationOperator"])?.["publicKeys"]);
    collectFrom(chargyLib.asJSONObject(evse?.["energyMeter"])?.["publicKeys"]);
    collectFrom(chargyLib.asJSONObject(Document["gridOperator"])?.["publicKeys"]);

    return publicKeys;

}

//#endregion


//#region Verifying

function verifyDocumentSignature(Document:         chargyLib.JSONObject,
                                 Signature:        unknown,
                                 Index:            number,
                                 PublicKeys:       Array<IDocumentPublicKey>,
                                 KeyIdGeneration:  Array<string>): IDocumentSignatureResult
{

    const entry = chargyLib.asJSONObject(Signature);

    if (entry === undefined)
        return { index: Index, status: "malformed", details: "The signature is not a JSON object." };

    const keyId      = chargyLib.asString(entry["keyId"]);
    const algorithm  = chargyLib.asString(entry["algorithm"]);
    const value      = chargyLib.asString(entry["value"]);
    const encodings  = asStringArray(entry["encodings"]);
    const signedData = chargyLib.asJSONObject(entry["signedData"]);

    // Everything the result can say about this entry, whatever happens below.
    const described  = (status:   DocumentSignatureStatus,
                        details?: string): IDocumentSignatureResult => ({
        index: Index,
        ...(keyId     !== undefined ? { keyId }     : {}),
        ...(algorithm !== undefined ? { algorithm } : {}),
        status,
        ...(details   !== undefined ? { details }   : {})
    });

    if (keyId     === undefined || keyId     === "" ||
        algorithm === undefined || algorithm === "" ||
        value     === undefined || value     === "" ||
        encodings === undefined || encodings.length === 0)
    {
        return described("malformed", "A signature needs a keyId, an algorithm, encodings and a value.");
    }

    //#region What was signed

    const signedEncodings = asStringArray(signedData?.["encodings"]) ?? canonicalJSONEncodings;

    if (signedEncodings.length !== canonicalJSONEncodings.length ||
        !signedEncodings.every((step, position) => step === canonicalJSONEncodings[position]))
    {
        return described("unsupportedAlgorithm",
                         "Only [ " + canonicalJSONEncodings.join(", ") + " ] signed data is understood here.");
    }

    const excludedProperties = asStringArray(signedData?.["excludedProperties"]) ?? defaultExcludedProperties;

    // The signature can never cover itself, so a document that forgets to say so
    // is still read the only way it could have been signed.
    if (!excludedProperties.includes("signatures"))
        excludedProperties.push("signatures");

    let signedBytes: Uint8Array;

    try
    {
        signedBytes = canonicalJSONBytes(
                          Object.fromEntries(
                              Object.entries(Document).
                                  filter(([ property ]) => !excludedProperties.includes(property))
                          )
                      );
    }
    catch (exception)
    {
        return described("malformed",
                         "The signed properties could not be canonicalized: " +
                         (exception instanceof Error ? exception.message : String(exception)));
    }

    //#endregion

    //#region With which key

    const suiteAlgorithm = nobleSignatureAlgorithm(algorithm);

    if (suiteAlgorithm === null)
        return described("unsupportedAlgorithm", "Unsupported signature algorithm: " + algorithm);

    // Which key signed follows from the id alone. Comparing case-insensitively
    // costs nothing and spares every writer of a document the question whether
    // hexadecimal ids are upper or lower case.
    const wantedKeyId = keyId.toUpperCase();
    const publicKey   = PublicKeys.find(candidate => computeKeyId(candidate, KeyIdGeneration)?.toUpperCase() === wantedKeyId);

    if (publicKey === undefined)
        return described("unknownPublicKey", "No public key of this document has the key id " + keyId + ".");

    //#endregion

    //#region Does it match?

    try
    {

        const suite            = getSignatureSuite(suiteAlgorithm);
        const publicKeyBytes_  = publicKeyBytes(publicKey, "raw");
        const signatureBytes   = decodeText(value, encodings[encodings.length - 1]);

        if (!suite.isValidPublicKey(publicKeyBytes_))
            return described("malformed", "The public key is not valid for " + algorithm + ".");

        // The suite hashes the canonical bytes itself, with the digest the
        // algorithm names; the DER or compact shape of the signature is
        // detected rather than assumed.
        return described(suite.verify(signedBytes, signatureBytes, publicKeyBytes_)
                             ? "validSignature"
                             : "invalidSignature");

    }
    catch (exception)
    {
        return described("malformed",
                         exception instanceof Error ? exception.message : String(exception));
    }

    //#endregion

}

/**
 * Verifies every signature a document carries over itself.
 *
 * A document without signatures is reported as "unsigned" rather than as a
 * failure: whether that is acceptable depends on the document, and saying so is
 * the caller's job. Nothing here throws.
 *
 * The document must be the one as it was read. Verification covers every
 * property except those the signatures exclude, so anything added to the object
 * beforehand - a default timestamp, a verification result - changes the bytes
 * that are verified and makes a good signature look bad.
 */
export function verifyDocumentSignatures(Document: chargyLib.JSONObject): IDocumentSignaturesResult
{

    const signatures = Document["signatures"];

    if (!Array.isArray(signatures) || signatures.length === 0)
        return { status: "unsigned", signatures: [], validCount: 0 };

    return verifySignaturesOf(Document,
                              signatures,
                              collectDocumentPublicKeys(Document),
                              asStringArray(Document["keyIdGeneration"]) ?? defaultKeyIdGeneration);

}


/**
 * The signatures an object *inside* a document carries over itself.
 *
 * A legally relevant log message is the case this exists for: the grid operator
 * signs the power constraint it sends, not the document it later travels in, so
 * the signatures sit on the message while the keys to check them and the rule
 * for computing key ids belong to the enclosing live link. Passing the two
 * objects separately is the whole difference to verifyDocumentSignatures().
 *
 * The embedded object is canonicalized on its own, exactly as a document is:
 * what a signature covers is stated by the signature, not by where the object
 * sits.
 */
export function verifyEmbeddedSignatures(Embedded:           chargyLib.JSONObject,
                                         EnclosingDocument:  chargyLib.JSONObject): IDocumentSignaturesResult
{

    const signatures = Embedded["signatures"];

    if (!Array.isArray(signatures) || signatures.length === 0)
        return { status: "unsigned", signatures: [], validCount: 0 };

    return verifySignaturesOf(Embedded,
                              signatures,
                              collectDocumentPublicKeys(EnclosingDocument),
                              asStringArray(EnclosingDocument["keyIdGeneration"]) ?? defaultKeyIdGeneration);

}


// What both of the above do once they know which object is signed, which keys
// may have signed it and how key ids are computed.
function verifySignaturesOf(SignedObject:     chargyLib.JSONObject,
                            Signatures:       Array<unknown>,
                            PublicKeys:       Array<IDocumentPublicKey>,
                            KeyIdGeneration:  Array<string>): IDocumentSignaturesResult
{

    const results    = Signatures.map((signature, index) =>
                           verifyDocumentSignature(SignedObject, signature, index, PublicKeys, KeyIdGeneration)
                       );

    const validCount = results.filter(result => result.status === "validSignature").length;

    return {
        status:      validCount === 0              ? "noneValid"
                   : validCount === results.length ? "allValid"
                   :                                 "someValid",
        signatures:  results,
        validCount
    };

}

//#endregion
