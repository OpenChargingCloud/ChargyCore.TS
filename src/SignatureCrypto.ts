/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of ChargyCore <https://github.com/OpenChargingCloud/ChargyCore.TS>
 *
 * Licensed under the Affero GPL license, Version 3.0.
 */

import { ed25519, ed25519ctx, ed25519ph } from "@noble/curves/ed25519.js";
import { ed448, ed448ph }                 from "@noble/curves/ed448.js";
import { p256, p384, p521 }               from "@noble/curves/nist.js";
import { secp256k1 }                      from "@noble/curves/secp256k1.js";
import type { EdDSA }                     from "@noble/curves/abstract/edwards.js";
import type { ECDSA,
              ECDSASignOpts }             from "@noble/curves/abstract/weierstrass.js";
import { ml_dsa44, ml_dsa65, ml_dsa87 }  from "@noble/post-quantum/ml-dsa.js";
import type { DSA }                       from "@noble/post-quantum/ml-dsa.js";

export type NobleECDSAAlgorithm =
    "ECDSA-secp256k1" |
    "ECDSA-P256"      |
    "ECDSA-P384"      |
    "ECDSA-P521";

export type NobleEdDSAAlgorithm =
    "Ed25519"    |
    "Ed25519ctx" |
    "Ed25519ph"  |
    "Ed448"      |
    "Ed448ph";

export type MLDSAAlgorithm = "ML-DSA-44" | "ML-DSA-65" | "ML-DSA-87";

export type NobleSignatureAlgorithm = NobleECDSAAlgorithm | NobleEdDSAAlgorithm | MLDSAAlgorithm;

export type SignatureAlgorithm = NobleSignatureAlgorithm;

export type SignatureEncoding = "compact" | "der" | "raw";

export interface SignatureOperationOptions {
    context?:   Uint8Array;
    extraEntropy?: Uint8Array | false;
    prehashed?: boolean;
    lowS?:      boolean;
    encoding?:  SignatureEncoding;
}

export interface SignatureKeyPair {
    algorithm:  NobleSignatureAlgorithm;
    privateKey: Uint8Array;
    publicKey?: Uint8Array;
}

export interface SignatureSuite {
    readonly algorithm:         NobleSignatureAlgorithm;
    readonly signatureEncoding: SignatureEncoding;
    generateKeyPair(): SignatureKeyPair;
    getPublicKey(privateKey: Uint8Array): Uint8Array;
    isValidPrivateKey(privateKey: Uint8Array): boolean;
    isValidPublicKey(publicKey: Uint8Array): boolean;
    sign(message: Uint8Array, privateKey: Uint8Array, options?: SignatureOperationOptions): Uint8Array;
    verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array, options?: SignatureOperationOptions): boolean;
}

export interface CompatiblePublicKey {
    verify(hash: string | Uint8Array, signature: unknown): boolean;
    validate(): { result: boolean; reason?: string | null };
}

export interface CompatibleCurve {
    keyFromPublic(publicKey: string | { x: string; y: string }, encoding: string): CompatiblePublicKey;
}

type LegacyEllipticCurve = CompatibleCurve;

export interface LegacyEllipticModule {
    ec: new (curve: string) => LegacyEllipticCurve;
}

class NobleECDSASuite implements SignatureSuite {

    public readonly signatureEncoding: SignatureEncoding = "der";

    public constructor(public readonly algorithm: NobleECDSAAlgorithm,
                       private readonly curve: ECDSA) { }

    public generateKeyPair(): SignatureKeyPair {
        const keyPair = this.curve.keygen();
        return {
            algorithm:  this.algorithm,
            privateKey: keyPair.secretKey,
            publicKey:  this.curve.getPublicKey(keyPair.secretKey, false)
        };
    }

    public getPublicKey(privateKey: Uint8Array): Uint8Array {
        return this.curve.getPublicKey(privateKey, false);
    }

    public isValidPrivateKey(privateKey: Uint8Array): boolean {
        return this.curve.utils.isValidSecretKey(privateKey);
    }

    public isValidPublicKey(publicKey: Uint8Array): boolean {
        return this.curve.utils.isValidPublicKey(publicKey);
    }

    public sign(message: Uint8Array,
                privateKey: Uint8Array,
                options: SignatureOperationOptions = {}): Uint8Array {

        const encoding = options.encoding ?? this.signatureEncoding;
        if (encoding === "raw")
            throw new TypeError("ECDSA signatures must use compact or DER encoding.");

        const signOptions: ECDSASignOpts = {
            prehash: options.prehashed !== true,
            lowS:    options.lowS ?? true,
            format:  encoding
        };
        if (options.extraEntropy != null)
            signOptions.extraEntropy = options.extraEntropy;
        return this.curve.sign(message, privateKey, signOptions);

    }

    public verify(message: Uint8Array,
                  signature: Uint8Array,
                  publicKey: Uint8Array,
                  options: SignatureOperationOptions = {}): boolean {

        const encoding = options.encoding ?? detectECDSAEncoding(signature);
        if (encoding === "raw")
            return false;

        return this.curve.verify(signature, message, publicKey, {
            prehash: options.prehashed !== true,
            lowS:    options.lowS ?? false,
            format:  encoding
        });

    }

}

class NobleEdDSASuite implements SignatureSuite {

    public readonly signatureEncoding: SignatureEncoding = "raw";

    public constructor(public readonly algorithm: NobleEdDSAAlgorithm,
                       private readonly curve: EdDSA) { }

    public generateKeyPair(): SignatureKeyPair {
        const keyPair = this.curve.keygen();
        return {
            algorithm:  this.algorithm,
            privateKey: keyPair.secretKey,
            publicKey:  keyPair.publicKey
        };
    }

    public getPublicKey(privateKey: Uint8Array): Uint8Array {
        return this.curve.getPublicKey(privateKey);
    }

    public isValidPrivateKey(privateKey: Uint8Array): boolean {
        return this.curve.utils.isValidSecretKey(privateKey);
    }

    public isValidPublicKey(publicKey: Uint8Array): boolean {
        return this.curve.utils.isValidPublicKey(publicKey, false);
    }

    public sign(message: Uint8Array,
                privateKey: Uint8Array,
                options: SignatureOperationOptions = {}): Uint8Array {

        assertRawEdDSAOptions(options);
        return options.context == null
                   ? this.curve.sign(message, privateKey)
                   : this.curve.sign(message, privateKey, { context: options.context });

    }

    public verify(message: Uint8Array,
                  signature: Uint8Array,
                  publicKey: Uint8Array,
                  options: SignatureOperationOptions = {}): boolean {

        assertRawEdDSAOptions(options);
        return options.context == null
                   ? this.curve.verify(signature, message, publicKey, { zip215: false })
                   : this.curve.verify(signature, message, publicKey, {
                         context: options.context,
                         zip215:  false
                     });

    }

}

class NobleMLDSASuite implements SignatureSuite {

    public readonly signatureEncoding: SignatureEncoding = "raw";

    public constructor(public readonly algorithm: MLDSAAlgorithm,
                       private readonly signer: DSA) { }

    public generateKeyPair(): SignatureKeyPair {
        const keyPair = this.signer.keygen();
        return {
            algorithm:  this.algorithm,
            privateKey: keyPair.secretKey,
            publicKey:  keyPair.publicKey
        };
    }

    public getPublicKey(privateKey: Uint8Array): Uint8Array {
        return this.signer.getPublicKey(privateKey);
    }

    public isValidPrivateKey(privateKey: Uint8Array): boolean {
        return this.signer.lengths.secretKey != null &&
               privateKey.length === this.signer.lengths.secretKey;
    }

    public isValidPublicKey(publicKey: Uint8Array): boolean {
        return this.signer.lengths.publicKey != null &&
               publicKey.length === this.signer.lengths.publicKey;
    }

    public sign(message: Uint8Array,
                privateKey: Uint8Array,
                options: SignatureOperationOptions = {}): Uint8Array {

        assertRawPostQuantumOptions(options);
        const signOptions: { context?: Uint8Array; extraEntropy?: Uint8Array | false } = {};
        if (options.context != null)
            signOptions.context = options.context;
        if (options.extraEntropy != null)
            signOptions.extraEntropy = options.extraEntropy;
        return this.signer.sign(message, privateKey, signOptions);
    }

    public verify(message: Uint8Array,
                  signature: Uint8Array,
                  publicKey: Uint8Array,
                  options: SignatureOperationOptions = {}): boolean {

        assertRawPostQuantumOptions(options);
        return options.context == null
                   ? this.signer.verify(signature, message, publicKey)
                   : this.signer.verify(signature, message, publicKey, { context: options.context });
    }

}

class NobleCompatiblePublicKey implements CompatiblePublicKey {

    public constructor(private readonly suite: SignatureSuite,
                       private readonly publicKey: Uint8Array,
                       private readonly scalarLength: number) { }

    public verify(hash: string | Uint8Array, signature: unknown): boolean {
        const signatureBytes = normalizeECDSASignature(signature, this.scalarLength);
        return this.suite.verify(toBytes(hash), signatureBytes, this.publicKey, {
            prehashed: true,
            lowS:      false,
            encoding:  detectECDSAEncoding(signatureBytes)
        });
    }

    public validate(): { result: boolean; reason?: string | null } {
        try
        {
            return this.suite.isValidPublicKey(this.publicKey)
                       ? { result: true }
                       : { result: false, reason: "Public key is not a valid point on the selected curve." };
        }
        catch (exception)
        {
            return {
                result: false,
                reason: exception instanceof Error ? exception.message : "Public key is invalid."
            };
        }
    }

}

class NobleCompatibleCurve implements CompatibleCurve {

    public constructor(private readonly suite: SignatureSuite,
                       private readonly coordinateLength: number) { }

    public keyFromPublic(publicKey: string | { x: string; y: string }, encoding: string): CompatiblePublicKey {
        if (encoding.toLowerCase() !== "hex")
            throw new TypeError("Only hexadecimal public keys are supported by the compatibility API.");

        const publicKeyBytes = normalizeSEC1PublicKey(publicKey, this.coordinateLength);
        if (!this.suite.isValidPublicKey(publicKeyBytes))
            throw new TypeError("Public key is not a valid point on the selected curve.");

        return new NobleCompatiblePublicKey(this.suite, publicKeyBytes, this.coordinateLength);
    }

}

const suites: Readonly<Record<NobleSignatureAlgorithm, SignatureSuite>> = {
    "ECDSA-secp256k1": new NobleECDSASuite("ECDSA-secp256k1", secp256k1),
    "ECDSA-P256":      new NobleECDSASuite("ECDSA-P256",      p256),
    "ECDSA-P384":      new NobleECDSASuite("ECDSA-P384",      p384),
    "ECDSA-P521":      new NobleECDSASuite("ECDSA-P521",      p521),
    "Ed25519":         new NobleEdDSASuite("Ed25519",         ed25519),
    "Ed25519ctx":      new NobleEdDSASuite("Ed25519ctx",      ed25519ctx),
    "Ed25519ph":       new NobleEdDSASuite("Ed25519ph",       ed25519ph),
    "Ed448":           new NobleEdDSASuite("Ed448",           ed448),
    "Ed448ph":         new NobleEdDSASuite("Ed448ph",         ed448ph),
    "ML-DSA-44":       new NobleMLDSASuite("ML-DSA-44",       ml_dsa44),
    "ML-DSA-65":       new NobleMLDSASuite("ML-DSA-65",       ml_dsa65),
    "ML-DSA-87":       new NobleMLDSASuite("ML-DSA-87",       ml_dsa87)
};

export function getSignatureSuite(algorithm: NobleSignatureAlgorithm): SignatureSuite {
    return suites[algorithm];
}

export function createCompatibleCurve(curve: "secp256k1" | "p256" | "secp256r1" | "p384" | "p521"): CompatibleCurve {
    switch (curve)
    {
        case "secp256k1":
            return new NobleCompatibleCurve(getSignatureSuite("ECDSA-secp256k1"), 32);
        case "p256":
        case "secp256r1":
            return new NobleCompatibleCurve(getSignatureSuite("ECDSA-P256"), 32);
        case "p384":
            return new NobleCompatibleCurve(getSignatureSuite("ECDSA-P384"), 48);
        case "p521":
            return new NobleCompatibleCurve(getSignatureSuite("ECDSA-P521"), 66);
    }
}

export function createLegacyP192Curve(elliptic: LegacyEllipticModule): CompatibleCurve {
    return new elliptic.ec("p192");
}

export function generateSignatureKeyPair(algorithm: NobleSignatureAlgorithm): SignatureKeyPair {
    return getSignatureSuite(algorithm).generateKeyPair();
}

function normalizeSEC1PublicKey(publicKey: string | { x: string; y: string }, coordinateLength: number): Uint8Array {
    if (typeof publicKey !== "string")
    {
        const x = leftPad(hexToBytes(publicKey.x), coordinateLength);
        const y = leftPad(hexToBytes(publicKey.y), coordinateLength);
        return concatenateBytes(Uint8Array.of(4), x, y);
    }

    const bytes = hexToBytes(publicKey);
    return bytes.length === coordinateLength * 2
               ? concatenateBytes(Uint8Array.of(4), bytes)
               : bytes;
}

function normalizeECDSASignature(signature: unknown, scalarLength: number): Uint8Array {
    if (typeof signature === "string")
        return hexToBytes(signature);

    if (signature instanceof Uint8Array)
        return signature;

    if (Array.isArray(signature) && signature.every(value => typeof value === "number"))
        return Uint8Array.from(signature);

    if (isSignatureComponents(signature))
    {
        const r = leftPad(componentToBytes(signature.r), scalarLength);
        const s = leftPad(componentToBytes(signature.s), scalarLength);
        return concatenateBytes(r, s);
    }

    throw new TypeError("Unsupported ECDSA signature representation.");
}

function isSignatureComponents(value: unknown): value is { r: unknown; s: unknown } {
    return typeof value === "object" &&
           value !== null            &&
           "r" in value              &&
           "s" in value;
}

function componentToBytes(value: unknown): Uint8Array {
    if (typeof value === "string")
        return hexToBytes(value);
    if (typeof value === "bigint")
        return hexToBytes(value.toString(16));
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
        return hexToBytes(value.toString(16));
    if (value instanceof Uint8Array)
        return value;
    if (typeof value === "object" && value !== null && "toString" in value)
    {
        const text = (value as { toString(radix?: number): string }).toString(16);
        return hexToBytes(text);
    }
    throw new TypeError("Invalid ECDSA signature component.");
}

function detectECDSAEncoding(signature: Uint8Array): "compact" | "der" {
    const isKnownCompactLength = signature.length === 64 ||
                                 signature.length === 96 ||
                                 signature.length === 132;
    return signature[0] === 0x30 && !isKnownCompactLength ? "der" : "compact";
}

function assertRawEdDSAOptions(options: SignatureOperationOptions): void {
    if (options.prehashed != null)
        throw new TypeError("Select Ed25519ph or Ed448ph instead of using the prehashed option with EdDSA.");
    if (options.encoding != null && options.encoding !== "raw")
        throw new TypeError("EdDSA signatures use raw encoding.");
    if (options.extraEntropy != null)
        throw new TypeError("EdDSA does not accept the extraEntropy signing option.");
}

function assertRawPostQuantumOptions(options: SignatureOperationOptions): void {
    if (options.prehashed != null)
        throw new TypeError("ML-DSA pre-hash mode must be selected explicitly and is not exposed as a boolean option.");
    if (options.encoding != null && options.encoding !== "raw")
        throw new TypeError("ML-DSA signatures use raw encoding.");
}

function toBytes(value: string | Uint8Array): Uint8Array {
    return typeof value === "string" ? hexToBytes(value) : value;
}

function hexToBytes(hex: string): Uint8Array {
    const normalized = hex.trim();
    if (!/^[0-9a-f]*$/iu.test(normalized))
        throw new TypeError("Value is not valid hexadecimal data.");

    const evenHex = normalized.length % 2 === 0 ? normalized : `0${normalized}`;
    const result  = new Uint8Array(evenHex.length / 2);
    for (let index = 0; index < result.length; index++)
        result[index] = Number.parseInt(evenHex.slice(index * 2, index * 2 + 2), 16);
    return result;
}

function leftPad(value: Uint8Array, length: number): Uint8Array {
    if (value.length > length)
        throw new TypeError("Integer does not fit the selected curve.");
    if (value.length === length)
        return value;

    const result = new Uint8Array(length);
    result.set(value, length - value.length);
    return result;
}

function concatenateBytes(...values: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(values.reduce((length, value) => length + value.length, 0));
    let offset = 0;
    for (const value of values)
    {
        result.set(value, offset);
        offset += value.length;
    }
    return result;
}
