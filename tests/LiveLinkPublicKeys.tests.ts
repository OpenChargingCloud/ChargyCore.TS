import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test, vi } from "vitest";
import { ALL_CURVES,
         contentsOf,
         CoseCurves,
         CoseKey,
         derBitString,
         derObjectIdentifier,
         DerReader,
         KEY_TYPE_EC2,
         oidOfCurve,
         Tag } from "@vanaheimr/cose";

import { Chargy } from "../src/chargy";
import { verifyDocumentSignatures } from "../src/DocumentSignatures";
import { canonicalJSONBytes } from "../src/interfaces/CryptoUtils";
import type { IChargeTransparencyRecord } from "../src/interfaces/IChargeTransparencyRecord";
import { IsAChargeTransparencyLiveLink } from "../src/interfaces/IChargeTransparencyLiveLink";
import { VerificationResult, type ICryptoResult } from "../src/interfaces/chargyInterfaces";
import type { JSONObject } from "../src/interfaces/chargyLib";
import { COSECurveNotExpressible,
         PublicKeyDecodingFailed,
         readPublicKey,
         UnsupportedPublicKeyEncoding } from "../src/LiveLinkPublicKeys";
import { getSignatureSuite } from "../src/SignatureCrypto";
import { createTestChargy, parseI18NDictionary } from "./chargyTestRuntime";

vi.mock("pdfjs-dist", () => ({
    GlobalWorkerOptions: {}
}));

vi.stubGlobal("window", {
    navigator: {
        language: "en"
    }
});

// The public keys of a charge transparency live link that are not a hexadecimal
// SubjectPublicKeyInfo: COSE keys, base64, bare points, and encodings nobody
// reads.
//
// The fixtures are shared with ChargyCore.NET byte for byte, so no new file is
// added for any of this. The live link fixture is read and changed in memory,
// and where a curve has no fixture at all, its meter values are signed here.

const currentDirectory  = fileURLToPath(new URL(".",  import.meta.url));
const projectRoot       = fileURLToPath(new URL("..", import.meta.url));
const coreI18n          = parseI18NDictionary(readFileSync(join(projectRoot, "i18n.json"), "utf8"));

// The last document of the OCMF-Test-01 series: the meter signs the start and
// the end value, the operator the readings in between, all on secp256r1.
const completedSession  = "ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json";

const p256Header        = "3059301306072A8648CE3D020106082A8648CE3D030107034200";
const ed25519Header     = "302A300506032B6570032100";


//#region Helpers

function liveLink(): JSONObject {
    return JSON.parse(readFileSync(join(currentDirectory, "fixtures", completedSession), "utf8")) as JSONObject;
}

function energyMeterOf(document: JSONObject): JSONObject {

    const chargingStation = document["chargingStation"] as JSONObject;
    const evse            = chargingStation["EVSE"] as JSONObject;

    return evse["energyMeter"] as JSONObject;

}

function meterKeysOf(document: JSONObject): Array<JSONObject> {
    return energyMeterOf(document)["publicKeys"] as Array<JSONObject>;
}

function meterKeyOf(document: JSONObject): JSONObject {

    const meterKey = meterKeysOf(document)[0];

    if (meterKey === undefined)
        throw new Error("The fixture lists no meter key!");

    return meterKey;

}

// Every key of the document that signs meter values: the meter's, and the
// operator's one for the readings in between.
function meterValueKeys(document: JSONObject): Array<JSONObject> {

    const operatorKeys = (document["chargingStationOperator"] as JSONObject)["publicKeys"] as Array<JSONObject>;

    return [
        ...operatorKeys.filter(key => (key["keyUsage"] as Array<string>).includes("signEnergyMeterValues")),
        meterKeyOf(document)
    ];

}

function meterKey(algorithm: string,
                  encodings: Array<string>,
                  value:     string): JSONObject {

    return {
        keyUsage:  [ "signMeterValues" ],
        algorithm,
        encodings,
        value
    };

}

function hexOf(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex").toUpperCase();
}

function base64url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64url");
}

// The uncompressed point at the end of a P-256 SubjectPublicKeyInfo.
function p256Point(subjectPublicKeyInfoHex: string): Uint8Array {
    return Uint8Array.from(Buffer.from(subjectPublicKeyInfoHex, "hex")).subarray(-65);
}

function p256COSEKey(subjectPublicKeyInfoHex: string): Uint8Array {

    const point = p256Point(subjectPublicKeyInfoHex);

    return CoseKey.fromCoordinates(CoseCurves.P256, point.subarray(1, 33), point.subarray(33)).toBytes();

}

// The completed session with every reading signed anew by a fresh key of the
// given suite, and that key as the only one for meter values. The payloads say
// nothing about the key or the curve, so a valid OCMF session on any curve is
// one signature away.
function signedWith(suiteName:  "ECDSA-secp256k1" | "ECDSA-P256",
                    SA:         string,
                    keyEntry:   (publicKey: Uint8Array) => JSONObject): JSONObject {

    const suite     = getSignatureSuite(suiteName);
    const keyPair   = suite.generateKeyPair();
    const publicKey = keyPair.publicKey ?? suite.getPublicKey(keyPair.privateKey);
    const document  = liveLink();
    const signed    = document["signedMeterValues"] as JSONObject;

    signed["values"] = (signed["values"] as Array<string>).map(ocmf => {

        // Between the first and the last bar: a tariff text may carry bars of
        // its own.
        const payload   = ocmf.slice(ocmf.indexOf("|") + 1, ocmf.lastIndexOf("|"));
        const signature = hexOf(suite.sign(new TextEncoder().encode(payload), keyPair.privateKey));

        return "OCMF|" + payload + "|" + JSON.stringify({ SA, SE: "hex", SM: "application/x-der", SD: signature });

    });

    (document["chargingStationOperator"] as JSONObject)["publicKeys"]  = [];
    energyMeterOf(document)["publicKeys"]                              = [ keyEntry(publicKey) ];

    return document;

}

async function meterValues(document: JSONObject): Promise<IChargeTransparencyRecord> {

    if (!IsAChargeTransparencyLiveLink(document))
        throw new Error("Not a live link!");

    const ctr = await createTestChargy(Chargy, { i18n: coreI18n }).TryToParseLiveLinkMeterValues(document);

    if (ctr === undefined)
        throw new Error("No meter values!");

    return ctr;

}

function resultsOf(ctr: IChargeTransparencyRecord): Array<ICryptoResult | undefined> {

    return (ctr.chargingSessions ?? []).
               flatMap(session     => session.measurements ?? []).
               flatMap(measurement => measurement.values).
               map    (value       => value.result);

}

function statusesOf(ctr: IChargeTransparencyRecord): Array<string | undefined> {
    return resultsOf(ctr).map(result => result?.status);
}

function count(ctr: IChargeTransparencyRecord, status: string): number {
    return statusesOf(ctr).filter(each => each === status).length;
}

// Whether there are readings, and every one of them verified.
function allValid(ctr: IChargeTransparencyRecord): boolean {
    return statusesOf(ctr).length > 0 && count(ctr, "ValidSignature") === statusesOf(ctr).length;
}

// How many readings the session has, and how many the operator's key verifies
// on its own - the rest are the meter's. Counted rather than named, because
// the series is regenerated whenever its generator learns something new.
async function readingsSignedByTheOperator(): Promise<{ total: number, byOperator: number }> {

    const document = liveLink();

    energyMeterOf(document)["publicKeys"] = [];

    const ctr = await meterValues(document);

    return { total: statusesOf(ctr).length, byOperator: count(ctr, "ValidSignature") };

}

// The curve and the point of a DER SubjectPublicKeyInfo of an elliptic curve key.
function readECSubjectPublicKeyInfo(hex: string): { algorithm: string, curve: string, point: Uint8Array } {

    const info       = contentsOf(new DerReader(Uint8Array.from(Buffer.from(hex, "hex")), "SubjectPublicKeyInfo").read(Tag.sequence), "SubjectPublicKeyInfo");
    const identifier = contentsOf(info.read(Tag.sequence), "AlgorithmIdentifier");

    return {
        algorithm:  derObjectIdentifier(identifier.read(Tag.objectIdentifier), "algorithm"),
        curve:      derObjectIdentifier(identifier.read(Tag.objectIdentifier), "curve"),
        point:      derBitString(info.read(Tag.bitString), "subjectPublicKey")
    };

}

// A COSE key on P-256 coordinates, written by hand: CoseKey only writes curves
// it knows, and the point of these tests is a curve it does not.
function coseKeyWithCurve(curve: Array<number> | null, point: Uint8Array): Uint8Array {

    return Uint8Array.from([
        curve !== null ? 0xA4 : 0xA3,
        0x01, 0x02,                                   // kty: EC2
        ...(curve !== null ? [ 0x20, ...curve ] : []),  // crv
        0x21, 0x58, 0x20, ...point.subarray(1, 33),   // x
        0x22, 0x58, 0x20, ...point.subarray(33)       // y
    ]);

}

//#endregion


describe("Live link public keys", () => {

    test("a P-256 key as a COSE key verifies what its SubjectPublicKeyInfo twin verifies", async () => {

        const asSubjectPublicKeyInfo = await meterValues(liveLink());

        const document = liveLink();

        for (const entry of meterValueKeys(document))
        {
            entry["value"]     = base64url(p256COSEKey(entry["value"] as string));
            entry["encodings"] = [ "COSE_Key", "CBOR", "base64url" ];
        }

        const asCOSEKey = await meterValues(document);

        expect(statusesOf(asSubjectPublicKeyInfo).every(status => status === "ValidSignature")).toBe(true);
        expect(statusesOf(asCOSEKey)).toEqual(statusesOf(asSubjectPublicKeyInfo));
        expect(asCOSEKey.chargingSessions?.[0]?.verificationResult?.status).toBe("ValidSignature");
        expect(asCOSEKey.errors ?? []).toHaveLength(0);

    });

    test("secp256k1 is registered, so a meter on it can publish a COSE key", async () => {

        const ctr = await meterValues(
                        signedWith("ECDSA-secp256k1", "ECDSA-secp256k1-SHA256", publicKey =>
                            meterKey("ECDSA-secp256k1",
                                     [ "COSE_Key", "CBOR", "base64url" ],
                                     base64url(CoseKey.fromCoordinates(CoseCurves.secp256k1, publicKey.subarray(1, 33), publicKey.subarray(33)).toBytes())))
                    );

        // Every reading of the session, each signed anew on secp256k1.
        expect(statusesOf(ctr)).toHaveLength(statusesOf(await meterValues(liveLink())).length);
        expect(allValid(ctr)).toBe(true);
        expect(ctr.chargingSessions?.[0]?.verificationResult?.status).toBe("ValidSignature");

    });

    test.each([
        { name: "a private-use crv",   curve: [ 0x3A, 0x00, 0x01, 0x00, 0x00 ] },   // -65537
        { name: "an unregistered crv", curve: [ 0x09 ] },
        { name: "no crv at all",       curve: null }
    ])("a COSE key with $name says that its curve cannot be expressed", async ({ curve }) => {

        const document = liveLink();
        const point    = p256Point(meterKeyOf(document)["value"] as string);

        meterKeyOf(document)["value"]     = base64url(coseKeyWithCurve(curve, point));
        meterKeyOf(document)["encodings"] = [ "COSE_Key", "CBOR", "base64url" ];

        const ctr      = await meterValues(document);
        const results  = resultsOf(ctr);
        const readings = await readingsSignedByTheOperator();

        // The operator's readings are untouched by the meter's key; the
        // meter's say why they could not be checked, rather than that their
        // signature does not match.
        expect(readings.total - readings.byOperator).toBeGreaterThan(0);
        expect(count(ctr, "ValidSignature")).toBe(readings.byOperator);
        expect(count(ctr, "UnknownPublicKeyFormat")).toBe(readings.total - readings.byOperator);
        expect(count(ctr, "InvalidSignature")).toBe(0);

        for (const result of results.filter(each => each?.status === VerificationResult.UnknownPublicKeyFormat))
            expect(result?.errors?.map(error => error.code)).toContain(COSECurveNotExpressible);

        expect(ctr.errors?.map(error => error.code)).toEqual([ COSECurveNotExpressible ]);
        expect(ctr.chargingSessions?.[0]?.verificationResult?.status).toBe("UnknownPublicKeyFormat");

    });

    test("the curves of the EMH, GDF, Alfen and legacy ChargePoint meters are not in the registry", () => {

        // Which is why their keys can never be COSE keys: there is no
        // identifier for them to write.
        const registered = ALL_CURVES.map(curve => curve.name);

        for (const name of [ "secp192r1", "secp192k1", "secp224k1" ])
            expect(registered).not.toContain(name);

        expect(registered).toContain("secp256k1");
        expect(registered).toContain("brainpoolP256r1");

    });

    test("every registered elliptic curve becomes the SubjectPublicKeyInfo of that curve", () => {

        // The rule behind the COSE key support, stated over the whole registry
        // rather than for the curves a test happened to pick. The generator
        // times seven is a valid point on every curve.
        const curves = ALL_CURVES.filter(curve => curve.keyType === KEY_TYPE_EC2);

        expect(curves.length).toBeGreaterThanOrEqual(8);

        for (const curve of curves)
        {

            const scalar   = new Uint8Array(curve.orderSize ?? 32);
            scalar[scalar.length - 1] = 7;

            const coseKey  = CoseKey.fromPrivateScalar(curve, scalar).publicKey();
            const read     = readPublicKey(base64url(coseKey.toBytes()), [ "COSE_Key", "CBOR", "base64url" ]);

            expect(read.keyHex, curve.name).toBeDefined();

            const spki     = readECSubjectPublicKeyInfo(read.keyHex ?? "");

            expect(spki.algorithm,         curve.name).toBe("1.2.840.10045.2.1");
            expect(spki.curve,             curve.name).toBe(oidOfCurve(curve));
            expect(hexOf(spki.point),      curve.name).toBe(hexOf(coseKey.publicKeyBytes()));

        }

    });

    test("a secp192r1 key travels as a SubjectPublicKeyInfo, or as a point its algorithm names", () => {

        // ChargyCore.TS cannot verify secp192r1 itself; what is pinned here is
        // that both forms reach the verifier as the key they are.
        const subjectPublicKeyInfo = "3049301306072A8648CE3D020106082A8648CE3D030101033200" + "04" + "AB".repeat(48);
        const point                = Uint8Array.from(Buffer.from("04" + "AB".repeat(48), "hex"));

        expect(readPublicKey(subjectPublicKeyInfo, [ "SubjectPublicKeyInfo", "DER", "hex" ]).keyHex).toBe(subjectPublicKeyInfo);

        const asPoint = readPublicKey(hexOf(point), [ "ECPoint", "hex" ], "ECDSA-secp192r1");

        expect(asPoint.keyHex).toBe(subjectPublicKeyInfo);

    });

    test("a bare point next to the algorithm that names its curve verifies", async () => {

        const document = liveLink();

        for (const entry of meterValueKeys(document))
        {
            entry["value"]     = hexOf(p256Point(entry["value"] as string));
            entry["encodings"] = [ "ECPoint", "hex" ];
        }

        expect(allValid(await meterValues(document))).toBe(true);

    });

    test.each([ "base64", "base64url", "PEM" ])("a SubjectPublicKeyInfo may travel as %s", async text => {

        // hex is a convention of the fixtures, not a rule of the format.
        const document = liveLink();

        for (const entry of meterValueKeys(document))
        {

            const der = Buffer.from(entry["value"] as string, "hex");

            entry["value"]     = text === "base64url" ? der.toString("base64url")
                               : text === "PEM"       ? "-----BEGIN PUBLIC KEY-----\n" + (der.toString("base64").match(/.{1,64}/gu) ?? []).join("\n") + "\n-----END PUBLIC KEY-----\n"
                               :                        der.toString("base64");

            entry["encodings"] = text === "PEM"
                                     ? [ "SubjectPublicKeyInfo", "DER", "base64", "PEM" ]
                                     : [ "SubjectPublicKeyInfo", "DER", text ];

        }

        expect(allValid(await meterValues(document))).toBe(true);

    });

    test("a key in an encoding nobody reads is reported, not dropped", async () => {

        // It used to be left out without a word, and the meter's readings then
        // failed against the operator's key as if their signatures did not
        // match.
        const document = liveLink();

        meterKeyOf(document)["encodings"] = [ "SubjectPublicKeyInfo", "DER", "base85" ];

        const ctr      = await meterValues(document);
        const readings = await readingsSignedByTheOperator();

        expect(readings.total - readings.byOperator).toBeGreaterThan(0);
        expect(count(ctr, "ValidSignature")).toBe(readings.byOperator);
        expect(count(ctr, "UnknownPublicKeyFormat")).toBe(readings.total - readings.byOperator);
        expect(count(ctr, "InvalidSignature")).toBe(0);
        expect(count(ctr, "PublicKeyNotFound")).toBe(0);

        expect(ctr.errors?.map(error => error.code)).toEqual([ UnsupportedPublicKeyEncoding ]);
        expect(ctr.errors?.[0]?.details).toContain("base85");

    });

    test("an unreadable key is reported even where it did not matter", async () => {

        const document = liveLink();

        meterKeysOf(document).push(meterKey("ECDSA-secp256r1", [ "JWK" ], "{\"kty\":\"EC\"}"));

        const ctr = await meterValues(document);

        expect(allValid(ctr)).toBe(true);
        expect(ctr.errors?.map(error => error.code)).toEqual([ UnsupportedPublicKeyEncoding ]);

    });

    test("an EdDSA key becomes the raw key its verifier takes", () => {

        const suite     = getSignatureSuite("Ed25519");
        const keyPair   = suite.generateKeyPair();
        const publicKey = keyPair.publicKey ?? suite.getPublicKey(keyPair.privateKey);

        const asCOSEKey = readPublicKey(base64url(CoseKey.fromOkpPublicKey(CoseCurves.Ed25519, publicKey).toBytes()),
                                        [ "COSE_Key", "CBOR", "base64url" ]);

        const asSPKI    = readPublicKey(ed25519Header + hexOf(publicKey),
                                        [ "SubjectPublicKeyInfo", "DER", "hex" ]);

        expect(asCOSEKey.keyHex).toBe(hexOf(publicKey));
        expect(asSPKI.keyHex).toBe(hexOf(publicKey));

    });

    test("a hexadecimal key is passed on untouched", () => {

        // What the fixtures carry has to reach the verifiers byte for byte as
        // before, letter case included.
        const value = meterKeyOf(liveLink())["value"] as string;

        expect(readPublicKey(value, [ "SubjectPublicKeyInfo", "DER", "hex" ]).keyHex).toBe(value);
        expect(readPublicKey(value).keyHex).toBe(value);
        expect(readPublicKey(value.toLowerCase(), [ "raw", "hex" ]).keyHex).toBe(value.toLowerCase());

    });

    test("a value that does not decode is an invalid key, not an unknown format", () => {

        const notHex  = readPublicKey("not hexadecimal", [ "SubjectPublicKeyInfo", "DER", "hex" ]);
        const notCOSE = readPublicKey("AAEC",            [ "COSE_Key", "CBOR", "base64url" ]);

        expect(notHex.status).toBe("InvalidPublicKey");
        expect(notHex.reasonKey).toBe(PublicKeyDecodingFailed);

        expect(notCOSE.status).toBe("InvalidPublicKey");
        expect(notCOSE.reasonKey).toBe(PublicKeyDecodingFailed);

    });

    test("a COSE key signs a document like any other key, because it has a key id", () => {

        // The key id is the hash of the SubjectPublicKeyInfo whatever form the
        // key is stored in, so a COSE key has one on every registered curve.
        for (const [ algorithm, suiteName, keyAlgorithm ] of [
                 [ "ECDSA-secp256r1-SHA256", "ECDSA-P256", "ECDSA-secp256r1" ],
                 [ "EdDSA-Ed25519",          "Ed25519",    "EdDSA-Ed25519"   ]
             ] as const)
        {

            const suite     = getSignatureSuite(suiteName);
            const keyPair   = suite.generateKeyPair();
            const publicKey = keyPair.publicKey ?? suite.getPublicKey(keyPair.privateKey);

            const coseKey   = suiteName === "Ed25519"
                                  ? CoseKey.fromOkpPublicKey(CoseCurves.Ed25519, publicKey)
                                  : CoseKey.fromCoordinates (CoseCurves.P256,    publicKey.subarray(1, 33), publicKey.subarray(33));

            const spki      = (suiteName === "Ed25519" ? ed25519Header : p256Header) + hexOf(publicKey);

            const document: JSONObject = {
                "@context":                "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0",
                keyIdGeneration:           [ "SubjectPublicKeyInfo", "DER", "SHA-256", "hex" ],
                chargingStationOperator:   {
                                               publicKeys: [{
                                                   keyUsage:   [ "signCTRs" ],
                                                   algorithm:  keyAlgorithm,
                                                   encodings:  [ "COSE_Key", "CBOR", "base64url" ],
                                                   value:      base64url(coseKey.toBytes())
                                               }]
                                           }
            };

            const signature = suite.sign(canonicalJSONBytes(document), keyPair.privateKey);

            const result    = verifyDocumentSignatures({
                                  ...document,
                                  signatures: [{
                                      keyId:       hexOf(sha256(Uint8Array.from(Buffer.from(spki, "hex")))),
                                      algorithm,
                                      signedData:  { excludedProperties: [ "signatures" ], encodings: [ "JSON", "JCS", "UTF-8" ] },
                                      encodings:   suiteName === "Ed25519" ? [ "raw", "hex" ] : [ "Ecdsa-Sig-Value", "DER", "hex" ],
                                      value:       hexOf(signature)
                                  }]
                              });

            expect(result.status, algorithm).toBe("allValid");

        }

    });

});
