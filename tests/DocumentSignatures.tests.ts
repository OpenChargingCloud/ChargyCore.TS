import { readFileSync } from "node:fs";
import { join }         from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
    collectDocumentPublicKeys,
    verifyDocumentSignatures
} from "../src/DocumentSignatures";
import type { JSONObject } from "../src/interfaces/chargyLib";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

function readDocument(fileName: string): JSONObject {
    return JSON.parse(readFileSync(join(currentDirectory, "fixtures", fileName), "utf8")) as JSONObject;
}

const signedLiveLink = "ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json";

describe("Signatures over a whole document", () => {

    test("verifies every signature of a signed live link", () => {

        const result = verifyDocumentSignatures(readDocument(signedLiveLink));

        expect(result.status).toBe("allValid");
        expect(result.signatures).toHaveLength(2);
        expect(result.validCount).toBe(2);

        // The document is signed by both operator keys: one ECDSA over a
        // SubjectPublicKeyInfo key, one Ed25519 over a key stored raw. The
        // second only resolves if the raw key is wrapped before its id is
        // computed, which is where an implementation quietly goes wrong.
        expect(result.signatures.map(signature => signature.algorithm)).toEqual([
            "ECDSA-secp256r1-SHA256",
            "EdDSA-Ed25519"
        ]);

        for (const signature of result.signatures)
            expect(signature.status).toBe("validSignature");

    });

    test("finds the public keys of the operator and of the energy meter", () => {

        const publicKeys = collectDocumentPublicKeys(readDocument(signedLiveLink));

        expect(publicKeys).toHaveLength(4);
        expect(publicKeys.map(publicKey => publicKey.algorithm)).toContain("EdDSA-Ed25519");
        expect(publicKeys.some(publicKey => publicKey.keyUsage.includes("signMeterValues"))).toBe(true);

    });

    test("reports a document without signatures as unsigned", () => {

        const { signatures, ...unsigned } = readDocument(signedLiveLink);

        expect(signatures).toBeDefined();
        expect(verifyDocumentSignatures(unsigned).status).toBe("unsigned");
        expect(verifyDocumentSignatures({ ...unsigned, signatures: [] }).status).toBe("unsigned");

    });

    test("notices when the signed content was changed", () => {

        // Any covered property will do; the description is the one a reader
        // would actually be shown.
        const tampered = { ...readDocument(signedLiveLink), description: { en: "Something else" } };
        const result   = verifyDocumentSignatures(tampered);

        expect(result.status).toBe("noneValid");
        expect(result.validCount).toBe(0);

        for (const signature of result.signatures)
            expect(signature.status).toBe("invalidSignature");

    });

    test("ignores what the signatures do not cover", () => {

        // "signatures" is excluded from the signed data, so re-ordering the
        // array changes no bytes - both entries still verify.
        const document  = readDocument(signedLiveLink);
        const reordered = { ...document, signatures: [ ...(document["signatures"] as Array<unknown>) ].reverse() };

        expect(verifyDocumentSignatures(reordered).status).toBe("allValid");

    });

    test("reports a signature whose key the document does not carry", () => {

        const document   = readDocument(signedLiveLink);
        const signatures = (document["signatures"] as Array<JSONObject>).map(
                               signature => ({ ...signature, keyId: "00".repeat(32) })
                           );

        const result = verifyDocumentSignatures({ ...document, signatures });

        expect(result.status).toBe("noneValid");

        for (const signature of result.signatures)
            expect(signature.status).toBe("unknownPublicKey");

    });

    test("reports an algorithm it does not know, rather than guessing", () => {

        const document   = readDocument(signedLiveLink);
        const signatures = (document["signatures"] as Array<JSONObject>).map(
                               signature => ({ ...signature, algorithm: "ECDSA-brainpoolP256r1-SHA256" })
                           );

        const result = verifyDocumentSignatures({ ...document, signatures });

        for (const signature of result.signatures)
            expect(signature.status).toBe("unsupportedAlgorithm");

    });

    test("reports malformed entries instead of throwing", () => {

        const document = readDocument(signedLiveLink);

        expect(verifyDocumentSignatures({ ...document, signatures: [ 42 ] }).signatures[0]?.status).toBe("malformed");
        expect(verifyDocumentSignatures({ ...document, signatures: [ {} ] }).signatures[0]?.status).toBe("malformed");
        expect(verifyDocumentSignatures({ ...document, signatures: "nope" }).status).toBe("unsigned");

    });

    test("mixes outcomes when only one signature is broken", () => {

        const document   = readDocument(signedLiveLink);
        const signatures = (document["signatures"] as Array<JSONObject>).map(
                               (signature, index) => index === 0
                                                         ? { ...signature, value: "00".repeat(64) }
                                                         : signature
                           );

        const result = verifyDocumentSignatures({ ...document, signatures });

        expect(result.status).toBe("someValid");
        expect(result.validCount).toBe(1);

    });

});
