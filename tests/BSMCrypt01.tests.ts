import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import {
    IsAChargeTransparencyRecord,
    SessionVerificationResult,
    VerificationResult
} from "@open-charging-cloud/chargy-core";
import type { ISessionCryptoResult, IBSMMeasurementValue, IBSMCrypt01Result } from "@open-charging-cloud/chargy-core";
import { verifyChargeData } from "./testHelper";

interface NumericValue {
    scale?: unknown;
    unitEncoded?: unknown;
    unit?: unknown;
    value?: unknown;
}

interface Snapshot {
    meterInfo: { publicKey: string };
    signature: string;
    value: { measuredValue: NumericValue };
    additionalValues: Array<{
        measurand: { name: string };
        measuredValue: NumericValue;
    }>;
}

interface BSMFixture {
    signedMeterValues: Snapshot[];
}

const numericFields = [
    "Typ", "RCR", "TotWhImp", "W", "RCnt", "OS", "Epoch", "TZO",
    "EpochSetCnt", "EpochSetOS", "DI", "DO", "Evt"
];

function fixture(): BSMFixture {
    return JSON.parse(readFileSync(new URL("fixtures/chargeIT/bsm/bsm-ws36a-good.json", import.meta.url), "utf8")) as BSMFixture;
}

function numericValue(snapshot: Snapshot, name: string): NumericValue {
    const result = snapshot.additionalValues.find(value => value.measurand.name === name);
    if (result === undefined)
        throw new Error(`Missing test field ${name}`);
    return result.measuredValue;
}

async function expectInvalidNumericInput(input: BSMFixture): Promise<void> {
    const result = await verifyChargeData("bsm.json", JSON.stringify(input));
    expect(result).toMatchObject({ status: SessionVerificationResult.InvalidSessionFormat });
    expect(IsAChargeTransparencyRecord(result)).toBe(false);
    const error = (result as ISessionCryptoResult).errors?.[0];
    expect(error?.message["en"]).toContain("BSM field");
}

// Independent encoder following bsm-python's abstract representation. Signing
// here with Node crypto exercises the production verifier without its writer.
function resign(input: BSMFixture): void {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const order = [
        "Typ", "RCR", "TotWhImp", "W", "MA1", "RCnt", "OS", "Epoch", "TZO",
        "EpochSetCnt", "EpochSetOS", "DI", "DO", "Meta1", "Meta2", "Meta3", "Evt"
    ];
    for (const snapshot of input.signedMeterValues) {
        snapshot.meterInfo.publicKey = keys.publicKey.export({ type: "spki", format: "der" }).toString("hex");
        const chunks = order.map(name => {
            const field = numericValue(snapshot, name);
            if (typeof field.value === "string") {
                const text = Buffer.from(field.value, "utf8");
                const size = Buffer.alloc(4);
                size.writeUInt32BE(text.length);
                return Buffer.concat([size, text]);
            }
            if (typeof field.value !== "number" || typeof field.scale !== "number" || typeof field.unitEncoded !== "number")
                throw new Error(`Incomplete test field ${name}`);
            const data = Buffer.alloc(6);
            if (name === "W" || name === "TZO")
                data.writeInt32BE(field.value);
            else
                data.writeUInt32BE(field.value);
            data.writeInt8(field.scale, 4);
            data.writeUInt8(field.unitEncoded, 5);
            return data;
        });
        snapshot.signature = sign("sha256", Buffer.concat(chunks), keys.privateKey).toString("hex");
    }
}

describe("BSM numeric units and scale factors", () => {
    test("keeps both original meter signatures valid", async () => {
        const result = await verifyChargeData("bsm.json", JSON.stringify(fixture()));
        expect(IsAChargeTransparencyRecord(result)).toBe(true);
        if (!IsAChargeTransparencyRecord(result))
            throw new Error("Expected a BSM record");
        expect(result.chargingSessions?.[0]?.measurements?.[0]?.values.map(value => value.result?.status)).toEqual([
            VerificationResult.ValidSignature,
            VerificationResult.ValidSignature
        ]);
    });

    test.each(numericFields)("rejects an altered unit code for %s", async name => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues) {
            numericValue(snapshot, name).unitEncoded = 31;
            if (name === "RCR")
                snapshot.value.measuredValue.unitEncoded = 31;
        }
        await expectInvalidNumericInput(input);
    });

    test("verifies independently signed negative scales and negative power for each snapshot", async () => {
        const input = fixture();
        for (const [index, snapshot] of input.signedMeterValues.entries()) {
            numericValue(snapshot, "RCR").scale = -1;
            snapshot.value.measuredValue.scale = -1;
            numericValue(snapshot, "TotWhImp").scale = -1;
            numericValue(snapshot, "W").scale = -2 - index;
            numericValue(snapshot, "W").value = -17 * (index + 1);
        }
        resign(input);
        const result = await verifyChargeData("bsm.json", JSON.stringify(input));
        if (!IsAChargeTransparencyRecord(result))
            throw new Error("Expected a signed BSM record");
        const values = result.chargingSessions?.[0]?.measurements?.[0]?.values as IBSMMeasurementValue[];
        expect(values.map(value => value.result?.status)).toEqual([
            VerificationResult.ValidSignature,
            VerificationResult.ValidSignature
        ]);
        expect(values.map(value => (value.result as IBSMCrypt01Result).W)).toEqual([
            "ffffffef·fe·1b", "ffffffde·fd·1b"
        ]);
        expect(values.map(value => value.RCR_SF)).toEqual([-1, -1]);
    });

    test.each(["RCR", "TotWhImp", "W"])("rejects a changed in-range %s scale without a matching signature", async name => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues) {
            numericValue(snapshot, name).scale = 2;
            if (name === "RCR")
                snapshot.value.measuredValue.scale = 2;
        }
        const result = await verifyChargeData("bsm.json", JSON.stringify(input));
        if (!IsAChargeTransparencyRecord(result))
            throw new Error("Expected a structurally valid BSM record");
        expect(result.chargingSessions?.[0]?.measurements?.[0]?.values.map(value => value.result?.status)).toEqual([
            VerificationResult.InvalidSignature,
            VerificationResult.InvalidSignature
        ]);
    });

    test.each(numericFields.filter(name => !["RCR", "TotWhImp", "W"].includes(name)))(
        "rejects a nonzero scale on the unscaled %s field", async name => {
            const input = fixture();
            for (const snapshot of input.signedMeterValues)
                numericValue(snapshot, name).scale = 1;
            await expectInvalidNumericInput(input);
        }
    );

    test.each([undefined, null, "0", 0.5, -129, 128, 256])("rejects an invalid energy scale %s", async scale => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues) {
            numericValue(snapshot, "RCR").scale = scale;
            snapshot.value.measuredValue.scale = scale;
        }
        await expectInvalidNumericInput(input);
    });

    test.each([undefined, null, "27", 27.5, -229, 283])("rejects an invalid power unit code %s", async unitCode => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues)
            numericValue(snapshot, "W").unitEncoded = unitCode;
        await expectInvalidNumericInput(input);
    });

    test.each([null, "0", 0.5, 256])("rejects a malformed counter scale %s", async scale => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues)
            numericValue(snapshot, "RCnt").scale = scale;
        await expectInvalidNumericInput(input);
    });

    test.each([undefined, null, "1", 1.5, -1, 4294967296])("rejects a non-uint32 energy value %s", async value => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues)
            numericValue(snapshot, "TotWhImp").value = value;
        await expectInvalidNumericInput(input);
    });

    test("rejects a unit label contradicting its numeric code", async () => {
        const input = fixture();
        for (const snapshot of input.signedMeterValues)
            numericValue(snapshot, "W").unit = "WATT_HOUR";
        await expectInvalidNumericInput(input);
    });

    test("does not reuse a numeric field from the preceding snapshot", async () => {
        const input = fixture();
        const snapshot = input.signedMeterValues[1];
        if (snapshot === undefined)
            throw new Error("Missing second snapshot");
        snapshot.additionalValues = snapshot.additionalValues.filter(value => value.measurand.name !== "TotWhImp");
        await expectInvalidNumericInput(input);
    });

    test("rejects duplicate numeric fields", async () => {
        const input = fixture();
        const snapshot = input.signedMeterValues[0];
        const field = snapshot?.additionalValues.find(value => value.measurand.name === "W");
        if (snapshot === undefined || field === undefined)
            throw new Error("Missing power field");
        snapshot.additionalValues.push(structuredClone(field));
        await expectInvalidNumericInput(input);
    });
});
