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

import { ec as EC }        from "elliptic";
import * as chargyLib      from './chargyLib'


export interface JSONSignature {
    publicKey:     string;
    publicKeyHEX:  string;
    signature:     string;
    signatureHEX:  string;
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
    curve?:          string;
    canonical?:      boolean;
    signatureFormat?: "DER";
}

const defaultSignOptions: Required<SignJSONMessageOptions> = {
    curve:           "p256",
    canonical:       true,
    signatureFormat: "DER"
};

export async function signMessage(JSONMessage: SignedJSONMessage,
                                  ...KeyPairs: EC.KeyPair[]): Promise<boolean> {

    return signJSONMessage(JSONMessage, KeyPairs);

}

export async function SignMessage(JSONMessage: SignedJSONMessage,
                                  ...KeyPairs: EC.KeyPair[]): Promise<boolean> {

    return signJSONMessage(JSONMessage, KeyPairs);

}

export async function signJSONMessage(JSONMessage:  SignedJSONMessage | null | undefined,
                                      KeyPairs:     Array<EC.KeyPair  | null | undefined> | null | undefined,
                                      options?:     SignJSONMessageOptions): Promise<boolean> {

    if (JSONMessage == null || KeyPairs == null || KeyPairs.length === 0)
        return false;

    if (JSONMessage.signatures != null && !Array.isArray(JSONMessage.signatures))
        return false;

    const resolvedOptions = {
        ...defaultSignOptions,
        ...options
    };

    const curve = new EC(resolvedOptions.curve);

    for (const KeyPair of KeyPairs)
    {

        if (KeyPair == null || !hasPrivateAndPublicKey(KeyPair))
            continue;

        const messageJSON     = cloneMessageWithoutSignatures(JSONMessage);
        const plainText       = canonicalJSONBytes(messageJSON);
        const sha256Hash      = await chargyLib.sha256____(plainText);

        JSONMessage.signatures ??= [];

        const publicKeyBytes  = Uint8Array.from(KeyPair.getPublic(false, "array"));
        const signature       = KeyPair.sign(sha256Hash, {
            canonical: resolvedOptions.canonical
        });
        const signatureBytes  = Uint8Array.from(signature.toDER());

        const signatureJSON: JSONSignature = {
            publicKey:     chargyLib.bytesToBase64(publicKeyBytes),
            publicKeyHEX:  chargyLib.bytesToHex(publicKeyBytes),
            signature:     chargyLib.bytesToBase64(signatureBytes),
            signatureHEX:  chargyLib.bytesToHex(signatureBytes)
        };

        JSONMessage.signatures.push(signatureJSON);

        if (!curve.keyFromPublic(signatureJSON.publicKeyHEX, "hex").verify(sha256Hash, signature))
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

    const resolvedOptions = {
        ...defaultSignOptions,
        ...options
    };

    const curve = new EC(resolvedOptions.curve);

    let sha256Hash: Uint8Array;

    try
    {
        const messageJSON = cloneMessageWithoutSignatures(JSONMessage);
        const plainText   = canonicalJSONBytes(messageJSON);
        sha256Hash        = await chargyLib.sha256____(plainText);
    }
    catch (exception)
    {
        return verificationResult(JSONSignatureVerificationStatus.InvalidCanonicalJSON,
                                  exception instanceof Error ? exception.message : "JSON message can not be canonicalized.");
    }

    let publicKey: EC.KeyPair;

    try
    {
        publicKey = curve.keyFromPublic(signature.publicKeyHEX, "hex");

        if (!publicKey.validate().result)
            return verificationResult(JSONSignatureVerificationStatus.InvalidPublicKey,
                                      publicKey.validate().reason || "Public key is not valid on the selected curve.");
    }
    catch (exception)
    {
        return verificationResult(JSONSignatureVerificationStatus.InvalidPublicKey,
                                  exception instanceof Error ? exception.message : "Public key can not be decoded.");
    }

    try
    {
        return curve.verify(sha256Hash,
                            signature.signatureHEX,
                            publicKey)
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
           typeof value["signatureHEX"] === "string";

}

function signatureEncodingsMatch(signature: JSONSignature): boolean {

    try
    {
        return chargyLib.bytesToHex(chargyLib.base64ToBytes(signature.publicKey)).toLowerCase()  === signature.publicKeyHEX.toLowerCase() &&
               chargyLib.bytesToHex(chargyLib.base64ToBytes(signature.signature)).toLowerCase()  === signature.signatureHEX.toLowerCase();
    }
    catch
    {
        return false;
    }

}

function hasPrivateAndPublicKey(KeyPair: EC.KeyPair): boolean {

    try
    {
        KeyPair.getPrivate("hex");
        KeyPair.getPublic(false, "hex");
        return KeyPair.validate().result;
    }
    catch
    {
        return false;
    }

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
