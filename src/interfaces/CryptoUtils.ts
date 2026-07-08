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

import { getSignatureSuite } from '../SignatureCrypto'
import type { NobleSignatureAlgorithm,
              SignatureEncoding,
              SignatureKeyPair,
              SignatureOperationOptions } from '../SignatureCrypto'
import * as chargyLib        from './chargyLib'

export type JSONSigningKeyPair = SignatureKeyPair;


export interface JSONSignature {
    algorithm?:         NobleSignatureAlgorithm;
    publicKeyEncoding?: "sec1" | "raw";
    signatureEncoding?: SignatureEncoding;
    context?:             string;
    contextHEX?:          string;
    publicKey:           string;
    publicKeyHEX:        string;
    signature:           string;
    signatureHEX:        string;
}

export interface SignedJSONMessage extends chargyLib.JSONObject {
    signatures?: JSONSignature[];
}

export enum JSONSignatureVerificationStatus {
    True                      = "True",
    False                     = "False",
    InvalidJSON               = "InvalidJSON",
    MissingSignatures         = "MissingSignatures",
    InvalidSignaturesArray    = "InvalidSignaturesArray",
    InvalidSignatureStructure = "InvalidSignatureStructure",
    InvalidSignatureEncoding  = "InvalidSignatureEncoding",
    InvalidPublicKey          = "InvalidPublicKey",
    InvalidSignature          = "InvalidSignature",
    InvalidCanonicalJSON      = "InvalidCanonicalJSON"
}

export interface JSONSignatureVerificationResult {
    status:       JSONSignatureVerificationStatus;
    description?: string;
}

export interface JSONMessageSignaturesVerificationResult {
    status:       JSONSignatureVerificationStatus;
    description?: string;
    signatures:   Record<string, JSONSignatureVerificationResult>;
}

export interface SignJSONMessageOptions {
    algorithm?:         NobleSignatureAlgorithm;
    context?:           Uint8Array;
    extraEntropy?:      Uint8Array | false;
    curve?:             string;
    canonical?:         boolean;
    signatureFormat?:   "DER";
    signatureEncoding?: SignatureEncoding;
}

const defaultSignOptions: {
    algorithm:         NobleSignatureAlgorithm;
    canonical:         boolean;
    signatureEncoding: SignatureEncoding;
} = {
    algorithm:         "ECDSA-P256",
    canonical:         true,
    signatureEncoding: "der"
};

export async function signMessage(JSONMessage: SignedJSONMessage,
                                  ...KeyPairs: JSONSigningKeyPair[]): Promise<boolean> {

    return signJSONMessage(JSONMessage, KeyPairs);

}

export async function SignMessage(JSONMessage: SignedJSONMessage,
                                  ...KeyPairs: JSONSigningKeyPair[]): Promise<boolean> {

    return signJSONMessage(JSONMessage, KeyPairs);

}

export async function signJSONMessage(JSONMessage:  SignedJSONMessage | null | undefined,
                                      KeyPairs:     Array<JSONSigningKeyPair | null | undefined> | null | undefined,
                                      options?:     SignJSONMessageOptions): Promise<boolean> {

    if (JSONMessage == null || KeyPairs == null || KeyPairs.length === 0)
        return false;

    if (JSONMessage.signatures != null && !Array.isArray(JSONMessage.signatures))
        return false;

    for (const KeyPair of KeyPairs)
    {

        if (KeyPair == null || !isNobleSignatureKeyPair(KeyPair))
            continue;

        const messageJSON     = cloneMessageWithoutSignatures(JSONMessage);
        const plainText       = await Promise.resolve(canonicalJSONBytes(messageJSON));

        const algorithm          = KeyPair.algorithm;
        const suite              = getSignatureSuite(algorithm);
        const privateKeyIsValid: boolean = suite.isValidPrivateKey(KeyPair.privateKey);
        if (!privateKeyIsValid)
            continue;

        const publicKeyEncoding  = isRawSignatureAlgorithm(algorithm) ? "raw" : "sec1";
        const signatureEncoding  = options?.signatureEncoding ?? suite.signatureEncoding;
        const publicKeyBytes     = KeyPair.publicKey ?? suite.getPublicKey(KeyPair.privateKey);
        const signatureBytes     = suite.sign(plainText, KeyPair.privateKey,
                                              signatureOptions(options, signatureEncoding));

        const signatureJSON: JSONSignature = {
            algorithm,
            publicKeyEncoding,
            signatureEncoding,
            publicKey:          chargyLib.bytesToBase64(publicKeyBytes),
            publicKeyHEX:       chargyLib.bytesToHex(publicKeyBytes),
            signature:          chargyLib.bytesToBase64(signatureBytes),
            signatureHEX:       chargyLib.bytesToHex(signatureBytes)
        };
        if (options?.context != null)
        {
            signatureJSON.context    = chargyLib.bytesToBase64(options.context);
            signatureJSON.contextHEX = chargyLib.bytesToHex(options.context);
        }

        JSONMessage.signatures ??= [];
        JSONMessage.signatures.push(signatureJSON);

        const signatureIsValid: boolean = suite.verify(plainText,
                                                       signatureBytes,
                                                       publicKeyBytes,
                                                       signatureOptions(options, signatureEncoding));
        if (!signatureIsValid)
            return false;

    }

    return true;

}

export async function verifyJSONSignature(JSONMessage:  SignedJSONMessage,
                                          signature:    JSONSignature,
                                          options?:     SignJSONMessageOptions): Promise<boolean> {

    return isVerificationTrue(await verifyJSONSignatureResult(JSONMessage, signature, options));

}

export async function verifyJSONSignatureResult(JSONMessage:  SignedJSONMessage | null | undefined,
                                                signature:    unknown,
                                                options?:     SignJSONMessageOptions): Promise<JSONSignatureVerificationResult> {

    if (JSONMessage == null)
        return verificationResult(JSONSignatureVerificationStatus.InvalidJSON,
                                  "JSON message is missing.");

    if (!isJSONSignature(signature))
        return verificationResult(JSONSignatureVerificationStatus.InvalidSignatureStructure,
                                  "Signature object must contain publicKey, publicKeyHEX, signature, and signatureHEX strings.");

    if (!signatureEncodingsMatch(signature))
        return verificationResult(JSONSignatureVerificationStatus.InvalidSignatureEncoding,
                                  "Base64 and hexadecimal encodings of the public key or signature do not match.");

    let plainText: Uint8Array;

    try
    {
        const messageJSON = cloneMessageWithoutSignatures(JSONMessage);
        plainText         = await Promise.resolve(canonicalJSONBytes(messageJSON));
    }
    catch (exception)
    {
        return verificationResult(JSONSignatureVerificationStatus.InvalidCanonicalJSON,
                                  exception instanceof Error ? exception.message : "JSON message can not be canonicalized.");
    }

    const resolvedOptions  = resolveSignOptions(options);
    const algorithm        = signature.algorithm ?? resolvedOptions.algorithm;
    const suite            = getSignatureSuite(algorithm);
    const publicKeyBytes   = chargyLib.hexToBytes(signature.publicKeyHEX);
    const signatureBytes   = chargyLib.hexToBytes(signature.signatureHEX);
    const signatureEncoding = signature.signatureEncoding ??
                              (isRawSignatureAlgorithm(algorithm) ? "raw" : "der");

    try
    {
        const publicKeyIsValid: boolean = suite.isValidPublicKey(publicKeyBytes);
        if (!publicKeyIsValid)
            return verificationResult(JSONSignatureVerificationStatus.InvalidPublicKey,
                                      "Public key is not valid for the selected signature algorithm.");
    }
    catch (exception)
    {
        return verificationResult(JSONSignatureVerificationStatus.InvalidPublicKey,
                                  exception instanceof Error ? exception.message : "Public key can not be decoded.");
    }

    try
    {
        const signatureIsValid: boolean = suite.verify(
            plainText,
            signatureBytes,
            publicKeyBytes,
            signatureVerificationOptions(signature, options, signatureEncoding)
        );

        return signatureIsValid
                   ? verificationResult(JSONSignatureVerificationStatus.True)
                   : verificationResult(JSONSignatureVerificationStatus.False,
                                        "Signature does not match the canonical JSON message.");
    }
    catch (exception)
    {
        return verificationResult(JSONSignatureVerificationStatus.InvalidSignature,
                                  exception instanceof Error ? exception.message : "Signature can not be decoded.");
    }

}

export async function verifyJSONMessageSignatures(JSONMessage: unknown,
                                                  options?:    SignJSONMessageOptions): Promise<boolean> {

    return isVerificationTrue((await verifyJSONMessageSignatureResults(JSONMessage, options)).status);

}

export async function verifyJSONMessageSignatureResults(JSONMessage: unknown,
                                                        options?:    SignJSONMessageOptions): Promise<JSONMessageSignaturesVerificationResult> {

    const parsedMessage = parseSignedJSONMessage(JSONMessage);

    if (parsedMessage.result != null)
        return {
            ...parsedMessage.result,
            signatures: {}
        };

    const signedMessage = parsedMessage.message;

    if (signedMessage == null)
        return {
            ...verificationResult(JSONSignatureVerificationStatus.InvalidJSON,
                                  "JSON message could not be parsed."),
            signatures: {}
        };

    if (signedMessage.signatures == null || signedMessage.signatures.length === 0)
        return {
            ...verificationResult(JSONSignatureVerificationStatus.MissingSignatures,
                                  "JSON message does not contain any signatures."),
            signatures: {}
        };

    const signatureResults: Record<string, JSONSignatureVerificationResult> = {};

    for (let index = 0; index < signedMessage.signatures.length; index++)
    {
        signatureResults[String(index)] = await verifyJSONSignatureResult(
            signedMessage,
            signedMessage.signatures[index],
            options
        );
    }

    const allSignaturesValid = Object.values(signatureResults).every(isVerificationTrue);

    return {
        ...verificationResult(
            allSignaturesValid
                ? JSONSignatureVerificationStatus.True
                : JSONSignatureVerificationStatus.False,
            allSignaturesValid
                ? undefined
                : "At least one signature is invalid."
        ),
        signatures: signatureResults
    };

}

export async function VerifyJSONMessageSignatures(JSONMessage: unknown,
                                                  options?:    SignJSONMessageOptions): Promise<boolean> {

    return verifyJSONMessageSignatures(JSONMessage, options);

}

export async function parseAndVerifyJSONSignatures(JSONMessage: string,
                                                   options?:    SignJSONMessageOptions): Promise<boolean> {

    return verifyJSONMessageSignatures(JSONMessage, options);

}

function cloneMessageWithoutSignatures(JSONMessage: SignedJSONMessage): chargyLib.JSONObject {

    const messageJSON = {
        ...JSONMessage
    };

    delete messageJSON.signatures;

    return messageJSON;

}

function parseSignedJSONMessage(JSONMessage: unknown): {
    message?: SignedJSONMessage;
    result?:  JSONSignatureVerificationResult;
} {

    let parsedMessage: unknown = JSONMessage;

    if (typeof JSONMessage === "string")
    {
        try
        {
            parsedMessage = JSON.parse(JSONMessage);
        }
        catch
        {
            return {
                result: verificationResult(JSONSignatureVerificationStatus.InvalidJSON,
                                           "JSON text can not be parsed.")
            };
        }
    }

    if (!chargyLib.isMandatoryJSONObject(parsedMessage))
        return {
            result: verificationResult(JSONSignatureVerificationStatus.InvalidJSON,
                                       "JSON message must be an object.")
        };

    if (parsedMessage["signatures"] != null && !Array.isArray(parsedMessage["signatures"]))
        return {
            result: verificationResult(JSONSignatureVerificationStatus.InvalidSignaturesArray,
                                       "The signatures property must be an array when present.")
        };

    return {
        message: parsedMessage
    };

}

function isJSONSignature(value: unknown): value is JSONSignature {

    return chargyLib.isMandatoryJSONObject(value)    &&
           typeof value["publicKey"]    === "string" &&
           typeof value["publicKeyHEX"] === "string" &&
           typeof value["signature"]    === "string" &&
           typeof value["signatureHEX"] === "string" &&
           (value["algorithm"] == null || isNobleSignatureAlgorithm(value["algorithm"])) &&
           ((value["context"] == null && value["contextHEX"] == null) ||
            (typeof value["context"] === "string" && typeof value["contextHEX"] === "string")) &&
           (value["signatureEncoding"] == null ||
            value["signatureEncoding"] === "compact" ||
            value["signatureEncoding"] === "der" ||
            value["signatureEncoding"] === "raw");

}

function signatureEncodingsMatch(signature: JSONSignature): boolean {

    try
    {
        return chargyLib.bytesToHex(chargyLib.base64ToBytes(signature.publicKey)).toLowerCase()  === signature.publicKeyHEX.toLowerCase() &&
               chargyLib.bytesToHex(chargyLib.base64ToBytes(signature.signature)).toLowerCase()  === signature.signatureHEX.toLowerCase() &&
               (signature.context == null ||
                chargyLib.bytesToHex(chargyLib.base64ToBytes(signature.context)).toLowerCase() === signature.contextHEX?.toLowerCase());
    }
    catch
    {
        return false;
    }

}

function isNobleSignatureKeyPair(keyPair: JSONSigningKeyPair): keyPair is SignatureKeyPair {
    return "algorithm" in keyPair   &&
           "privateKey" in keyPair  &&
           isNobleSignatureAlgorithm(keyPair.algorithm) &&
           keyPair.privateKey instanceof Uint8Array;
}

function isNobleSignatureAlgorithm(value: unknown): value is NobleSignatureAlgorithm {
    return value === "ECDSA-secp256k1" ||
           value === "ECDSA-P256"      ||
           value === "ECDSA-P384"      ||
           value === "ECDSA-P521"      ||
           value === "Ed25519"         ||
           value === "Ed25519ctx"      ||
           value === "Ed25519ph"       ||
           value === "Ed448"           ||
           value === "Ed448ph"         ||
           value === "ML-DSA-44"       ||
           value === "ML-DSA-65"       ||
           value === "ML-DSA-87";
}

function isRawSignatureAlgorithm(algorithm: NobleSignatureAlgorithm): boolean {
    return algorithm.startsWith("Ed") || algorithm.startsWith("ML-DSA-");
}

function resolveSignOptions(options?: SignJSONMessageOptions): {
    algorithm:         NobleSignatureAlgorithm;
    canonical:         boolean;
    signatureEncoding: SignatureEncoding;
} {
    return {
        algorithm:         options?.algorithm ?? algorithmFromLegacyCurve(options?.curve) ?? defaultSignOptions.algorithm,
        canonical:         options?.canonical ?? defaultSignOptions.canonical,
        signatureEncoding: options?.signatureEncoding ??
                           (options?.signatureFormat === "DER" ? "der" : defaultSignOptions.signatureEncoding)
    };
}

function algorithmFromLegacyCurve(curve?: string): NobleSignatureAlgorithm | undefined {
    switch (curve?.toLowerCase())
    {
        case "secp256k1":
            return "ECDSA-secp256k1";
        case "p256":
        case "secp256r1":
        case undefined:
            return undefined;
        case "p384":
        case "secp384r1":
            return "ECDSA-P384";
        case "p521":
        case "secp521r1":
            return "ECDSA-P521";
        default:
            throw new TypeError(`Unsupported signature curve '${curve}'.`);
    }
}

function signatureOptions(options: SignJSONMessageOptions | undefined,
                          encoding: SignatureEncoding): SignatureOperationOptions {
    const result: SignatureOperationOptions = { encoding };
    if (options?.context != null)
        result.context = options.context;
    if (options?.extraEntropy != null)
        result.extraEntropy = options.extraEntropy;
    return result;
}

function signatureVerificationOptions(signature: JSONSignature,
                                      options: SignJSONMessageOptions | undefined,
                                      encoding: SignatureEncoding): SignatureOperationOptions {
    const result = signatureOptions(options, encoding);
    if (result.context == null && signature.contextHEX != null)
        result.context = chargyLib.hexToBytes(signature.contextHEX);
    return result;
}

function verificationResult(status:       JSONSignatureVerificationStatus,
                            description?: string): JSONSignatureVerificationResult {

    return description == null
               ? { status }
               : { status, description };

}

function isVerificationTrue(result: JSONSignatureVerificationResult | JSONSignatureVerificationStatus): boolean {

    return (typeof result === "string" ? result : result.status) === JSONSignatureVerificationStatus.True;

}

export class CanonicalJSONError extends TypeError {

    public constructor(message: string) {
        super(message);
        this.name = "CanonicalJSONError";
    }

}

export function canonicalJSONStringify(value: unknown): string {
    return serializeJSONValue(value, "$", new WeakSet());
}

export function canonicalJSONBytes(value: unknown): Uint8Array {
    return new TextEncoder().encode(canonicalJSONStringify(value));
}

function serializeJSONValue(value: unknown,
                            path:  string,
                            seen:  WeakSet<object>): string {

    switch (typeof value)
    {

        case "string":
            return JSON.stringify(value);

        case "number":
            if (!Number.isFinite(value))
                throw new CanonicalJSONError(`Non-finite number at ${path} is not valid JSON.`);

            return JSON.stringify(value);

        case "boolean":
            return value ? "true" : "false";

        case "object":
            if (value === null)
                return "null";

            return Array.isArray(value)
                       ? serializeJSONArray(value, path, seen)
                       : serializeJSONObject(value, path, seen);

        case "bigint":
            throw new CanonicalJSONError(`BigInt at ${path} is not valid JSON.`);

        case "undefined":
            throw new CanonicalJSONError(`Undefined value at ${path} is not valid JSON.`);

        case "function":
            throw new CanonicalJSONError(`Function at ${path} is not valid JSON.`);

        case "symbol":
            throw new CanonicalJSONError(`Symbol at ${path} is not valid JSON.`);

    }

}

function serializeJSONArray(value: unknown[],
                            path:  string,
                            seen:  WeakSet<object>): string {

    if (seen.has(value))
        throw new CanonicalJSONError(`Circular reference at ${path} is not valid JSON.`);

    seen.add(value);

    const indexedKeys = new Set<string>();

    for (let i = 0; i < value.length; i++)
    {
        if (!Object.prototype.hasOwnProperty.call(value, i))
            throw new CanonicalJSONError(`Sparse array slot at ${path}[${String(i)}] is not valid JSON.`);

        indexedKeys.add(String(i));
    }

    for (const key of Object.keys(value))
    {
        if (!indexedKeys.has(key))
            throw new CanonicalJSONError(`Non-index array property ${formatPathProperty(key)} at ${path} is not valid JSON.`);
    }

    rejectEnumerableSymbolProperties(value, path);

    const serializedItems = value.map((item, index) =>
        serializeJSONValue(item, `${path}[${String(index)}]`, seen)
    );

    seen.delete(value);

    return `[${serializedItems.join(",")}]`;

}

function serializeJSONObject(value: object,
                             path:  string,
                             seen:  WeakSet<object>): string {

    if (Object.prototype.toString.call(value) !== "[object Object]")
        throw new CanonicalJSONError(`Unsupported object at ${path} is not valid JSON.`);

    if (seen.has(value))
        throw new CanonicalJSONError(`Circular reference at ${path} is not valid JSON.`);

    seen.add(value);
    rejectEnumerableSymbolProperties(value, path);

    const serializedProperties = Object.keys(value)
                                       .sort(compareOrdinal)
                                       .map(key => {
                                           const serializedKey   = JSON.stringify(key);
                                           const serializedValue = serializeJSONValue(
                                               (value as Record<string, unknown>)[key],
                                               `${path}${formatPathProperty(key)}`,
                                               seen
                                           );

                                           return `${serializedKey}:${serializedValue}`;
                                       });

    seen.delete(value);

    return `{${serializedProperties.join(",")}}`;

}

function rejectEnumerableSymbolProperties(value: object,
                                          path:  string): void {

    for (const symbol of Object.getOwnPropertySymbols(value))
    {
        if (Object.prototype.propertyIsEnumerable.call(value, symbol))
            throw new CanonicalJSONError(`Symbol property at ${path} is not valid JSON.`);
    }

}

function compareOrdinal(left:  string,
                        right: string): number {

    return left < right ? -1 : left > right ? 1 : 0;

}

function formatPathProperty(propertyName: string): string {

    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(propertyName)
               ? `.${propertyName}`
               : `[${JSON.stringify(propertyName)}]`;

}
