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
    isCustomHeaderValue,
    isCustomHeaders,
    isTransport,
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
        expect(IsAChargeTransparencyLiveLink(undefined)).toBe(false);

        // A malformed optional field does not un-recognise a live link: the
        // context identifies it, and a broken transport is dropped where the
        // transports are read, not by turning the whole document into an
        // "unknown format".
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, liveTransports: [ { type: "ftp", url: "https://example.com" } ] })).toBe(true);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, liveTransports: "not an array" })).toBe(true);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, connector: 42 })).toBe(true);

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

    test("verifies the signatures over the whole document", async () => {

        const report = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json");

        expect(IsAChargeTransparencyLiveLink(report)).toBe(true);

        if (IsAChargeTransparencyLiveLink(report))
        {
            expect(report.signatureVerification?.status).toBe("allValid");
            expect(report.signatureVerification?.validCount).toBe(2);

            // Everything verified, so there is nothing to warn about.
            expect(report.warnings ?? []).toHaveLength(0);
        }

    });

    test("warns about a broken document signature, but still reads the document", async () => {

        // A live link whose content was changed after signing: the transports,
        // the meter values and the station data are all still there and still
        // usable - only the signature no longer matches, which is worth saying
        // but not worth refusing the document over.
        const tampered = JSON.parse(readFixture("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json")) as Record<string, unknown>;
        tampered["description"] = { "en": "Something else entirely" };

        const fileInfo: IFileInfo = {
            name: "tampered.json",
            type: "application/json",
            data: new TextEncoder().encode(JSON.stringify(tampered))
        };

        const report = await createTestChargy(Chargy, { i18n: coreI18n }).DetectAndConvertContentFormat([ fileInfo ]);

        expect(IsAChargeTransparencyLiveLink(report)).toBe(true);

        if (IsAChargeTransparencyLiveLink(report))
        {
            expect(report.signatureVerification?.status).toBe("noneValid");
            expect(report.liveTransports).toHaveLength(3);

            const warnings = report.warnings ?? [];

            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings.some(warning => warning.message["en"]?.includes("does not match its content") === true)).toBe(true);

            // Both signatures fail the same way, which is one thing worth
            // saying, not two. Deduplication has to compare the message keys:
            // the messages themselves are freshly built objects and would
            // never compare equal.
            expect(warnings).toHaveLength(1);
        }

    });

    test("warns about an unsigned document, but still reads it", async () => {

        // The signatures are optional: a live link without any is read exactly
        // as before, it just cannot be verified as a whole.
        const unsigned = JSON.parse(readFixture("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json")) as Record<string, unknown>;
        delete unsigned["signatures"];

        const fileInfo: IFileInfo = {
            name: "unsigned.json",
            type: "application/json",
            data: new TextEncoder().encode(JSON.stringify(unsigned))
        };

        const report = await createTestChargy(Chargy, { i18n: coreI18n }).DetectAndConvertContentFormat([ fileInfo ]);

        expect(IsAChargeTransparencyLiveLink(report)).toBe(true);

        if (IsAChargeTransparencyLiveLink(report))
        {
            expect(report.signatureVerification?.status).toBe("unsigned");
            expect(report.liveTransports).toHaveLength(3);
            expect((report.warnings ?? []).some(warning => warning.message["en"]?.includes("not signed") === true)).toBe(true);
        }

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

    test("reads the custom headers of an https transport", () => {

        // A literal value and a value computed per request are the two shapes
        // a header value may have.
        expect(isTransport({
            type:           "https",
            url:            "https://api.example.com/live",
            refresh:         10,
            customHeaders:  {
                                "X-Key1": "headerValue1",
                                "X-TOTP": {
                                              valueProvider: "TOTP",
                                              parameters:    { sharedSecret: "abcdefghijklmnopqrstuvwxyz1234567890" }
                                          }
                            }
        })).toBe(true);

        expect(isCustomHeaderValue("headerValue1")).toBe(true);
        expect(isCustomHeaderValue({ valueProvider: "TOTP" })).toBe(true);
        expect(isCustomHeaderValue({ parameters: { sharedSecret: "s" } })).toBe(false);
        expect(isCustomHeaderValue(42)).toBe(false);

        // The header names are not the format's business, the shape of what
        // they carry is.
        expect(isCustomHeaders({})).toBe(true);
        expect(isCustomHeaders({ "X-Key1": [ "headerValue1" ] })).toBe(false);
        expect(isCustomHeaders([ "X-Key1" ])).toBe(false);
        expect(isCustomHeaders("X-Key1: headerValue1")).toBe(false);

    });

    test("validates the custom headers on https alone", () => {

        // Malformed where they are declared: not a transport.
        expect(isTransport({ type: "https", url: "https://api.example.com/live", customHeaders: "X-Key1: v" })).toBe(false);
        expect(isTransport({ type: "https", url: "https://api.example.com/live", customHeaders: { "X-Key1": 42 } })).toBe(false);

        // Absent: still a transport, exactly as before.
        expect(isTransport({ type: "https", url: "https://api.example.com/live" })).toBe(true);

        // And on the other two transports customHeaders is an unknown property
        // like any other - neither type-checked nor rejected.
        expect(isTransport({ type: "websocket", url: "wss://api.example.com/live", customHeaders: "nonsense" })).toBe(true);
        expect(isTransport({ type: "httpSSE",   url: "https://api.example.com/live", customHeaders: 42 })).toBe(true);

    });

});
