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

// A public key as a charge transparency live link lists it: a value, and the
// "encodings" pipeline that says how it was put into text, innermost first -
// [ "SubjectPublicKeyInfo", "DER", "hex" ], [ "raw", "hex" ],
// [ "COSE_Key", "CBOR", "base64url" ] and so on.
//
// The verifiers take a key in one of two shapes only: an elliptic curve key as
// a DER SubjectPublicKeyInfo, which names its curve by object identifier, and
// an EdDSA or ML-DSA key as its raw octets. This turns whatever the document
// chose into that shape, or says why it cannot.
//
// Saying why is the point. A key that cannot be read is a different statement
// from a signature that does not match, and a key that is quietly left out
// turns the one into the other: the readings it signed then fail against the
// remaining keys, and an EV driver is told their session does not verify when
// nobody actually looked.
//
// A COSE key can only name its curve through the IANA "COSE Elliptic Curves"
// registry, and secp192r1, secp192k1 and secp224k1 - the curves of the EMH,
// GDF, Alfen and legacy ChargePoint meters and of the OCMF secp192 algorithms -
// are not in it. Such a key has no COSE form; it travels as a
// SubjectPublicKeyInfo, where the curve is an object identifier and every
// curve has one.

import { contentsOf,
         CoseKey,
         derBitString,
         derObjectIdentifier,
         DerReader,
         isEddsaCurve,
         isOnCurve,
         KEY_TYPE_AKP,
         KEY_TYPE_EC2,
         KEY_TYPE_OKP,
         oidOfCurve,
         Tag }                   from '@vanaheimr/cose'
import * as chargyInterfaces    from './interfaces/chargyInterfaces'
import * as chargyLib           from './interfaces/chargyLib'


//#region Types

/** A public key of a live link, and whether and how it can be used. */
export interface ILiveLinkPublicKey {

    /** The value, as the document lists it. */
    value:       string;

    /** How the value was encoded, innermost first. */
    encodings:   Array<string>;

    /** The key type the document states, e.g. "ECDSA-secp256r1". */
    algorithm?:  string;

    /**
     * The key as the verifiers take it, hexadecimal: a DER SubjectPublicKeyInfo
     * for an elliptic curve key, the raw octets for an EdDSA or ML-DSA key.
     * Absent when the key cannot be used.
     */
    keyHex?:     string;

    /**
     * What a reading that only this key could have verified comes to:
     * UnknownPublicKeyFormat or InvalidPublicKey. Absent when the key can be used.
     */
    status?:     chargyInterfaces.VerificationResult;

    /** The i18n key of the reason the key cannot be used. */
    reasonKey?:  string;

    /** A technical detail of the reason, deliberately not localized. */
    details?:    string;

}

/** The bytes of a public key, and the structure they are in. */
export interface IPublicKeyStructure {

    /** "SubjectPublicKeyInfo", "raw", or whatever else the document named. */
    structure?:  string;

    bytes:       Uint8Array;

}

type Decoded =
    { readonly usable: true,  readonly structure: string | undefined, readonly bytes: Uint8Array, readonly verbatim: boolean } |
    { readonly usable: false, readonly status: chargyInterfaces.VerificationResult, readonly reasonKey: string, readonly details: string };

//#endregion


//#region Constants

/**
 * Why a COSE key cannot be used: its curve has no identifier in the IANA
 * "COSE Elliptic Curves" registry, so it names none, or one that only its
 * author can interpret.
 */
export const COSECurveNotExpressible = "Verification_COSEKeyCurveNotExpressible";

/** Why a key cannot be used: its encodings pipeline is not one this library reads. */
export const UnsupportedPublicKeyEncoding = "UnknownOrInvalidPublicKeyFormat";

/** Why a key cannot be used: its pipeline is understood, but the value does not decode under it. */
export const PublicKeyDecodingFailed = "Verification_PublicKeyDecodingFailed";

// The lowest identifier of the IANA "COSE Elliptic Curves" registry that is not
// private use. Below it, a curve means whatever its author decided, which no
// one else can know.
const lowestNonPrivateUseCurve  = -65536;

const idECPublicKey             = "1.2.840.10045.2.1";

// The curves a bare ECPoint can be given on, by the name its algorithm uses.
// OCMF writes "brainpool256r1" where RFC 5639 writes "brainpoolP256r1", and a
// missing letter must not decide whether a key is readable.
const namedCurveOIDs: Readonly<Record<string, string>> = {
    "secp192r1":        "1.2.840.10045.3.1.1",
    "p-192":            "1.2.840.10045.3.1.1",
    "prime192v1":       "1.2.840.10045.3.1.1",
    "secp192k1":        "1.3.132.0.31",
    "secp224k1":        "1.3.132.0.32",
    "secp256k1":        "1.3.132.0.10",
    "secp256r1":        "1.2.840.10045.3.1.7",
    "p-256":            "1.2.840.10045.3.1.7",
    "prime256v1":       "1.2.840.10045.3.1.7",
    "secp384r1":        "1.3.132.0.34",
    "p-384":            "1.3.132.0.34",
    "secp521r1":        "1.3.132.0.35",
    "p-521":            "1.3.132.0.35",
    "brainpool256r1":   "1.3.36.3.3.2.8.1.1.7",
    "brainpoolp256r1":  "1.3.36.3.3.2.8.1.1.7",
    "brainpool384r1":   "1.3.36.3.3.2.8.1.1.11",
    "brainpoolp384r1":  "1.3.36.3.3.2.8.1.1.11"
};

//#endregion


//#region ASN.1 DER

function derLength(length: number): Array<number>
{

    if (length < 0x80)
        return [ length ];

    const bytes = new Array<number>();

    for (let rest = length; rest > 0; rest = Math.floor(rest / 256))
        bytes.unshift(rest % 256);

    return [ 0x80 | bytes.length, ...bytes ];

}

function der(tag:      number,
             contents: Uint8Array): Uint8Array
{
    return Uint8Array.from([ tag, ...derLength(contents.length), ...contents ]);
}

function derOID(dotted: string): Uint8Array
{

    const arcs  = dotted.split(".").map(arc => Number.parseInt(arc, 10));
    const first = arcs[0] ?? 0;
    const bytes = new Array<number>();

    // The first two arcs share one number, every arc is base 128 with the high
    // bit marking "more to come".
    for (const arc of [ first * 40 + (arcs[1] ?? 0), ...arcs.slice(2) ])
    {

        const base128 = [ arc % 128 ];

        for (let rest = Math.floor(arc / 128); rest > 0; rest = Math.floor(rest / 128))
            base128.unshift(0x80 | (rest % 128));

        bytes.push(...base128);

    }

    return der(Tag.objectIdentifier, Uint8Array.from(bytes));

}

function concat(...parts: Array<Uint8Array>): Uint8Array
{

    const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let   offset = 0;

    for (const part of parts)
    {
        result.set(part, offset);
        offset += part.length;
    }

    return result;

}

// An elliptic curve point wrapped into the DER SubjectPublicKeyInfo the
// verifiers take, with the curve named by its object identifier. Named, not
// spelled out: a SubjectPublicKeyInfo carrying the curve parameters inline is
// valid ASN.1, but not what any energy meter emits.
function ecSubjectPublicKeyInfo(curveOID: string,
                                point:    Uint8Array): Uint8Array
{

    return der(Tag.sequence, concat(
               der(Tag.sequence, concat(derOID(idECPublicKey), derOID(curveOID))),
               der(Tag.bitString, concat(Uint8Array.of(0x00), point))
           ));

}

// The key material of a SubjectPublicKeyInfo that is not an elliptic curve
// key - an EdDSA or ML-DSA key, which the verifiers take as its raw octets -
// or null for an elliptic curve key and for anything that does not parse.
function nonECKeyMaterial(spki: Uint8Array): Uint8Array | null
{

    try
    {

        const info       = contentsOf(new DerReader(spki, "SubjectPublicKeyInfo").read(Tag.sequence), "SubjectPublicKeyInfo");
        const algorithm  = contentsOf(info.read(Tag.sequence), "AlgorithmIdentifier");

        return derObjectIdentifier(algorithm.read(Tag.objectIdentifier), "algorithm") === idECPublicKey
                   ? null
                   : derBitString(info.read(Tag.bitString), "subjectPublicKey");

    }
    catch
    {
        return null;
    }

}

//#endregion


//#region Text

function strictBase64(value: string,
                      url:   boolean): Uint8Array
{

    const text = value.replace(/\s+/gu, "");

    if (!(url ? /^[A-Za-z0-9_-]*={0,2}$/u : /^[A-Za-z0-9+/]*={0,2}$/u).test(text))
        throw new Error("Invalid " + (url ? "base64url" : "base64") + " string!");

    const base64 = url
                       ? text.replaceAll("-", "+").replaceAll("_", "/")
                       : text;

    return chargyLib.base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));

}

// The bytes inside PEM armor [RFC 7468].
function fromPEM(pem: string): Uint8Array
{

    return strictBase64(
               pem.split("\n").
                   map   (line => line.trim()).
                   filter(line => !line.startsWith("-----")).
                   join  (""),
               false
           );

}

// The bytes a value stands for, or null when its text encoding is not one
// this library reads. Throws when the value is not what its encoding says.
function decodeText(value: string,
                    text:  string): Uint8Array | null
{

    switch (text)
    {

        case "hex":        return chargyLib.hexToBytes(value);
        case "base64":     return strictBase64(value, false);
        case "base64url":  return strictBase64(value, true);
        case "PEM":        return fromPEM(value);

        default:           return null;

    }

}

function message(exception: unknown): string
{
    return exception instanceof Error ? exception.message : String(exception);
}

//#endregion


//#region Structures

function unusable(status:     chargyInterfaces.VerificationResult,
                  reasonKey:  string,
                  details:    string): Decoded
{
    return { usable: false, status, reasonKey, details };
}

// A COSE key [RFC 9052, Section 7], in the shape the verifiers take.
//
// Only a curve of the IANA registry can be named here, which is exactly the
// limitation of the type: a missing, unregistered or private-use "crv" is a key
// whose curve this form cannot express, not a broken key, and it is reported
// as such.
function fromCOSEKey(cbor: Uint8Array): Decoded
{

    let key: CoseKey;

    try
    {
        key = CoseKey.parse(cbor);
    }
    catch (exception)
    {
        return unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed, message(exception));
    }

    if (key.keyType === KEY_TYPE_AKP)
    {
        try
        {
            return { usable: true, structure: "raw", bytes: key.publicKeyBytes(), verbatim: false };
        }
        catch (exception)
        {
            return unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed, message(exception));
        }
    }

    if (key.keyType !== KEY_TYPE_EC2 && key.keyType !== KEY_TYPE_OKP)
        return unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, UnsupportedPublicKeyEncoding,
                        "A COSE key of key type " + String(key.keyType) + " is not a signature key this library verifies with.");

    //#region A curve key has to name a curve the registry knows

    if (key.curveId === null)
        return unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, COSECurveNotExpressible,
                        "The COSE key names no curve (crv). Give the key as a SubjectPublicKeyInfo, which names every curve by its object identifier.");

    if (key.curveId < lowestNonPrivateUseCurve)
        return unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, COSECurveNotExpressible,
                        "crv " + String(key.curveId) + " is a private-use value of the IANA \"COSE Elliptic Curves\" registry, which only its author can interpret. Give the key as a SubjectPublicKeyInfo.");

    const curve = key.curve;

    if (curve === null)
        return unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, COSECurveNotExpressible,
                        "crv " + String(key.curveId) + " is not registered in the IANA \"COSE Elliptic Curves\" registry. Give the key as a SubjectPublicKeyInfo.");

    if (curve.keyType !== key.keyType)
        return unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed,
                        "The curve '" + curve.name + "' does not belong to a COSE key of key type " + String(key.keyType) + ".");

    //#endregion

    let publicKey: Uint8Array;

    try
    {
        publicKey = key.publicKeyBytes();
    }
    catch (exception)
    {
        return unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed, message(exception));
    }

    if (key.keyType === KEY_TYPE_OKP)
        return isEddsaCurve(curve)
                   ? { usable: true, structure: "raw", bytes: publicKey, verbatim: false }
                   : unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed,
                              "The curve '" + curve.name + "' is not an EdDSA signature curve.");

    try
    {
        if (!isOnCurve(curve, publicKey))
            return unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed,
                            "The public point of the COSE key does not lie on the curve '" + curve.name + "'.");
    }
    catch
    {
        // A curve this library cannot compute with is left to the verifier,
        // which says so itself.
    }

    const curveOID = oidOfCurve(curve);

    return curveOID !== null
               ? { usable: true, structure: "SubjectPublicKeyInfo", bytes: ecSubjectPublicKeyInfo(curveOID, publicKey), verbatim: false }
               : unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, UnsupportedPublicKeyEncoding,
                          "The curve '" + curve.name + "' has no object identifier this library knows.");

}

// A bare elliptic curve point [SEC 1, Section 2.3.3]. It carries no curve of
// its own, so the stated algorithm has to name one.
function fromECPoint(point:      Uint8Array,
                     algorithm:  string | undefined): Decoded
{

    const curveOID = namedCurveOIDs[(algorithm ?? "").replace(/^ECDSA-/iu, "").toLowerCase()];

    return curveOID !== undefined
               ? { usable: true, structure: "SubjectPublicKeyInfo", bytes: ecSubjectPublicKeyInfo(curveOID, point), verbatim: false }
               : unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, UnsupportedPublicKeyEncoding,
                          "An ECPoint does not name its curve, and the algorithm '" + (algorithm ?? "") + "' names none this library knows.");

}

function decode(value:      string,
                pipeline:   Array<string>,
                algorithm:  string | undefined): Decoded
{

    //#region The text the bytes were put into

    // PEM is base64 inside armor, and the pipeline says so by naming both.
    const textSteps = pipeline.length >= 2 && pipeline[pipeline.length - 1] === "PEM" && pipeline[pipeline.length - 2] === "base64" ? 2 : 1;
    const text      = pipeline[pipeline.length - 1] ?? "";

    let bytes: Uint8Array | null;

    try
    {
        bytes = decodeText(value, text);
    }
    catch (exception)
    {
        return unusable(chargyInterfaces.VerificationResult.InvalidPublicKey, PublicKeyDecodingFailed,
                        "The value is not valid " + text + ": " + message(exception));
    }

    if (bytes === null)
        return unusable(chargyInterfaces.VerificationResult.UnknownPublicKeyFormat, UnsupportedPublicKeyEncoding,
                        "The encodings [ " + pipeline.join(", ") + " ] end in a text encoding this library does not read.");

    //#endregion

    //#region The structure inside those bytes

    const structure = pipeline.slice(0, pipeline.length - textSteps);

    if (structure[0] === "COSE_Key" &&
        (structure.length === 1 || (structure.length === 2 && structure[1] === "CBOR")))
    {
        return fromCOSEKey(bytes);
    }

    if (structure.length === 1 && structure[0] === "ECPoint")
        return fromECPoint(bytes, algorithm);

    // A SubjectPublicKeyInfo, a raw key, or a structure nobody named: the
    // verifiers take these bytes as they are, and say themselves what they
    // make of them.
    return { usable: true, structure: structure[0], bytes, verbatim: text === "hex" };

    //#endregion

}

//#endregion


//#region Reading a key

/**
 * Read a public key given as a value and its encodings pipeline.
 *
 * A hexadecimal SubjectPublicKeyInfo or raw key - what the fixtures carry - is
 * passed on byte for byte, letter case included. A key without a pipeline is
 * passed on as it is too, and the verifiers work out its encoding as they do
 * for a key from any other source.
 */
export function readPublicKey(Value:       string,
                              Encodings?:  Array<string>,
                              Algorithm?:  string): ILiveLinkPublicKey
{

    const pipeline  = Encodings ?? [];
    const described = {
                          value:      Value,
                          encodings:  pipeline,
                          ...(Algorithm !== undefined ? { algorithm: Algorithm } : {})
                      };

    if (pipeline.length === 0)
        return { ...described, keyHex: Value };

    const decoded = decode(Value, pipeline, Algorithm);

    if (!decoded.usable)
        return {
            ...described,
            status:     decoded.status,
            reasonKey:  decoded.reasonKey,
            details:    decoded.details
        };

    // An EdDSA or ML-DSA key is verified as its raw octets, and its
    // SubjectPublicKeyInfo wraps exactly those.
    const keyMaterial = decoded.structure === "SubjectPublicKeyInfo"
                            ? nonECKeyMaterial(decoded.bytes)
                            : null;

    return {
        ...described,
        keyHex: keyMaterial !== null ? chargyLib.bytesToHex(keyMaterial).toUpperCase()
              : decoded.verbatim     ? Value
              :                        chargyLib.bytesToHex(decoded.bytes).toUpperCase()
    };

}

/**
 * Read one entry of a live link's "publicKeys", or undefined when it has no
 * value at all.
 */
export function readLiveLinkPublicKey(Entry: chargyLib.JSONObject): ILiveLinkPublicKey | undefined
{

    const value = chargyLib.asString(Entry["value"]);

    if (value === undefined || value === "")
        return undefined;

    // A non-list states no pipeline, exactly as a missing property does; a step
    // that is not a string is a step nobody reads.
    const encodings = Entry["encodings"];

    return readPublicKey(
               value,
               Array.isArray(encodings)
                   ? encodings.map(step => typeof step === "string" ? step : "")
                   : undefined,
               chargyLib.asString(Entry["algorithm"])
           );

}

/**
 * The bytes of a public key in the structure its pipeline produces: a
 * COSE_Key or an ECPoint already as the SubjectPublicKeyInfo or raw key it
 * stands for, everything else as stated.
 *
 * Throws, with the reason, when the key cannot be read.
 */
export function decodePublicKeyStructure(Value:       string,
                                         Encodings:   Array<string>,
                                         Algorithm?:  string): IPublicKeyStructure
{

    const decoded = decode(Value, Encodings, Algorithm);

    if (!decoded.usable)
        throw new Error(decoded.details);

    return decoded.structure !== undefined
               ? { structure: decoded.structure, bytes: decoded.bytes }
               : { bytes: decoded.bytes };

}

//#endregion
