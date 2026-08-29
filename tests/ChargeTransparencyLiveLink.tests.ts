import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";

import type {
    IFileInfo
} from "../src/interfaces/chargyInterfaces";
import { Chargy } from "../src/chargy";
import { IsAChargeTransparencyRecord } from "../src/interfaces/IChargeTransparencyRecord";
import {
    IsAChargeTransparencyLiveLink,
    type IChargeTransparencyLiveLink
} from "../src/interfaces/IChargeTransparencyLiveLink";
import {
    createTestChargy,
    parseI18NDictionary,
    parseJSONRecord
} from "./chargyTestRuntime";

vi.mock("pdfjs-dist", () => ({
    GlobalWorkerOptions: {}
}));

vi.stubGlobal("window", {
    navigator: {
        language: "en"
    }
});

const currentDirectory = fileURLToPath(new URL(".",  import.meta.url));
const projectRoot      = fileURLToPath(new URL("..", import.meta.url));
const coreI18n         = parseI18NDictionary(readFileSync(join(projectRoot, "i18n.json"), "utf8"));

type DetectionResult = ReturnType<Chargy["DetectAndConvertContentFormat"]>;

function readFixture(fileName: string): string {
    return readFileSync(join(currentDirectory, "fixtures", fileName), "utf8").trim();
}

function readLiveLink(fileName: string): IChargeTransparencyLiveLink {

    const liveLink = parseJSONRecord(readFixture(fileName));

    if (!IsAChargeTransparencyLiveLink(liveLink))
        throw new Error("'" + fileName + "' is not a charge transparency live link!");

    return liveLink;

}

async function verifyChargeTransparencyLiveLink(fileName: string): DetectionResult {

    const fileInfo: IFileInfo = {
        name: fileName,
        type: "application/json",
        data: new TextEncoder().encode(readFixture(fileName))
    };

    return createTestChargy(Chargy, { i18n: coreI18n }).DetectAndConvertContentFormat([ fileInfo ]);

}

describe("Charge Transparency LiveLink", () => {

    test("recognizes live links by their JSON-LD context", () => {

        const liveLink = parseJSONRecord(readFixture("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json"));

        expect(IsAChargeTransparencyLiveLink(liveLink)).toBe(true);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, "@context": "https://example.com/other" })).toBe(false);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, liveTransports: [ { type: "ftp", url: "https://example.com" } ] })).toBe(false);
        expect(IsAChargeTransparencyLiveLink(undefined)).toBe(false);

    });

    test("stays a live link, whether it carries meter values or not", async () => {

        // A live link describes a charging session that is still running, a
        // charge transparency record a collection of finished ones. Carrying
        // meter values does not turn the one into the other.
        const withMeterValues    = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json");

        expect(IsAChargeTransparencyLiveLink(withMeterValues)).toBe(true);
        expect(IsAChargeTransparencyRecord  (withMeterValues)).toBe(false);

        const withoutMeterValues = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0000.json");

        expect(IsAChargeTransparencyLiveLink(withoutMeterValues)).toBe(true);

        if (IsAChargeTransparencyLiveLink(withoutMeterValues))
        {
            expect(withoutMeterValues.created).toBe("2026-08-28T11:59:59Z");
            expect(withoutMeterValues.liveTransports).toHaveLength(3);
        }

    });

    test("parses the signed meter values of a live link into a verified CTR", async () => {

        const liveLink = readLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json");
        const chargy   = createTestChargy(Chargy, { i18n: coreI18n });
        const ctr      = await chargy.TryToParseLiveLinkMeterValues(liveLink);

        expect(IsAChargeTransparencyRecord(ctr)).toBe(true);

        expect(ctr?.chargingSessions).toHaveLength(1);

        const chargingSession = ctr?.chargingSessions?.[0];

        expect(chargingSession?.EVSEId).toBe("DE*GEF*E12345678*1");
        expect(chargingSession?.measurements).toHaveLength(1);

        const measurement = chargingSession?.measurements?.[0];

        // 19 OCMF documents, but the end document repeats the start value.
        expect(measurement?.name).toBe("ENERGY_TOTAL");
        expect(measurement?.values).toHaveLength(20);

        // The live link carries the public keys, so unlike a bare OCMF file
        // every meter value can actually be verified here.
        for (const measurementValue of measurement?.values ?? [])
            expect(measurementValue.result?.status).toBe("ValidSignature");

    });

    test("reports no meter values for a live link that has none yet", async () => {

        const liveLink = readLiveLink("ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0000.json");
        const chargy   = createTestChargy(Chargy, { i18n: coreI18n });

        expect(await chargy.TryToParseLiveLinkMeterValues(liveLink)).toBeUndefined();

    });

    test("adds the current UTC timestamp when a live link has none", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-13T10:11:12.000Z"));

        try
        {
            const report = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_2.json");

            expect(IsAChargeTransparencyLiveLink(report)).toBe(true);

            if (IsAChargeTransparencyLiveLink(report))
                expect(report.created).toBe("2026-06-13T10:11:12.000Z");
        }
        finally
        {
            vi.useRealTimers();
        }
    });

});
