import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { IsAChargeTransparencyRecord, verifyOCMFSessionWithMeterKey, ocmfSessionMaterial, verifyHistoricalOCMFSession, readOCMFSessionPriceContext, compareOCMFPriceRates, verifyOCMFPriceStart } from '../src/index';
import { verifyChargeData } from './testHelper';
import { createTestChargy } from './chargyTestRuntime';
import { Chargy } from '../src/index';
import Decimal from 'decimal.js';
import type { IMeterKeyBinding, IChargingSession, IOCMFMeasurementValue } from '../src/index';

const text = readFileSync(new URL('./fixtures/POISession/completed-session-with-evse-proof.chargy', import.meta.url), 'utf8');
const raw = JSON.parse(text) as { publicKey: string };
const metadata = JSON.parse(readFileSync(new URL('./fixtures/POISession/provenance.json', import.meta.url), 'utf8')) as {
    generatedAt: string; attestationsValidUntil: string; evseId: string; meterSerial: string; meterKeyId: string;
};
const at = Date.parse(metadata.generatedAt);
const binding: IMeterKeyBinding = { evseId: metadata.evseId, meterId: 'DE*POI*M1', meterSerialNumber: metadata.meterSerial,
    chargingStationId: 'DE*POI*S1', key: { id: metadata.meterKeyId, canonicalId: 'provided-by-authorized-caller',
        idScheme: 'sha256-spki', value: raw.publicKey, encodings: ['SubjectPublicKeyInfo', 'DER', 'base64'], algorithm: 'ECDSA-secp256r1' },
    evidence: { verifiedAt: at, validUntil: Date.parse(metadata.attestationsValidUntil), association: 'current-snapshot',
        roamingNetworkId: 'CHARGY-POI-DEMO', roamingNetworkOperatorId: 'CHARGY-DEMO-RNO', commitId: 'demo', revision: 1,
        treeRoot: 'demo', keyStatementDigest: 'demo' } };

async function session(input: string = text): Promise<IChargingSession> {
    const result = await verifyChargeData('completed-session-with-evse-proof.chargy', input);
    if (!IsAChargeTransparencyRecord(result) || result.chargingSessions?.[0] === undefined) throw new Error('Missing fixture session');
    return result.chargingSessions[0];
}

describe('Explicit authorized meter-key handoff to Core', () => {
    test('rechecks original signatures with supplied provenance, including the first reading', async () => {
        const original = await session();
        const result = await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), original, binding, { now: () => at });
        expect(result.status, result.detail).toBe('verified');
        expect(result.signaturesValid).toBe(true);
        expect(result.signatureCount).toBe(2);
        expect(result.readingPhase).toBe('complete');
        expect(result.measurementCount).toBe(2);
        expect(result.historicalAssociation).toBe('not-proven');
        expect(result.record?.chargingSessions?.[0]?.measurements?.[0]?.values[0]?.method).toBeDefined();
        expect(ocmfSessionMaterial(original).meterSerialNumber).toBe(metadata.meterSerial);
    });
    test('never needs a key from the container to verify the original measurements', async () => {
        const original = await session();
        for (const measurement of original.measurements ?? []) for (const value of measurement.values) {
            const document = (value as IOCMFMeasurementValue).ocmfDocument;
            if (document !== undefined) { delete document.publicKey; delete document.publicKeyEncoding; }
        }
        const result = await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), original, binding, { now: () => at });
        expect(result.status, result.detail).toBe('verified');
    });
    test('detects a conflicting container key but still reports the actual signature check with the authorized key', async () => {
        const foreign = readFileSync(new URL('./fixtures/ChargeTransparencyLive/OCMF-Test-01/publicKey_cpo_signCTRs.pem', import.meta.url), 'utf8')
            .replace(/-----[^-]+-----|\s/g, '');
        const result = await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), await session(text.replace(raw.publicKey, foreign)), binding, { now: () => at });
        expect(result.status, result.detail).toBe('key-conflict');
        expect(result.signaturesValid).toBe(true);
    });
    test('compares equivalent supported encodings and reports compressed encodings as unsupported, not as foreign keys', async () => {
        const original = await session();
        const spki = Buffer.from(raw.publicKey, 'base64');
        const documents = (original.measurements ?? []).flatMap(measurement => measurement.values)
            .map(value => (value as IOCMFMeasurementValue).ocmfDocument);
        for (const document of documents) if (document !== undefined) {
            document.publicKey = spki.toString('hex'); document.publicKeyEncoding = 'hex';
        }
        expect((await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), original, binding, { now: () => at })).status).toBe('verified');
        const compressed = '3039301306072a8648ce3d020106082a8648ce3d030107032200' +
            ((spki[spki.length - 1] ?? 0) % 2 === 0 ? '02' : '03') + spki.subarray(27, 59).toString('hex');
        for (const document of documents) if (document !== undefined) document.publicKey = compressed;
        expect((await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), original, binding, { now: () => at })).status).toBe('unsupported');
    });
    test('a tampered reading cannot inherit cached valid validationStatus fields', async () => {
        const result = await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), await session(text.replace('1011', '1012')), binding, { now: () => at });
        expect(result.status, result.detail).toBe('invalid-signature');
        expect(result.signaturesValid).toBe(false);
    });
    test('binds both the signed identity and the displayed measurement data', async () => {
        const original = await session();
        const foreign = await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), original, { ...binding, evseId: 'FOREIGN' }, { now: () => at });
        expect(foreign.status).toBe('identity-conflict');
        const value = original.measurements?.[0]?.values[0];
        if (value === undefined) throw new Error('Missing first value');
        value.value = new Decimal(99);
        const mismatch = await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), original, binding, { now: () => at });
        expect(mismatch.status).toBe('record-conflict');
    });
    test('expired observation, unsupported algorithms and cancellation never produce a trusted success', async () => {
        expect((await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), await session(), binding, { now: () => at + 25 * 3600000 })).status).toBe('evidence-expired');
        expect((await verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), await session(), { ...binding, key: { ...binding.key, algorithm: 'Ed25519' } }, { now: () => at })).status).toBe('unsupported');
        const controller = new AbortController(); controller.abort();
        await expect(verifyOCMFSessionWithMeterKey(createTestChargy(Chargy), await session(), binding, { now: () => at, signal: controller.signal })).rejects.toThrow();
    });
});


describe('Historical original-document handoff', () => {
    const archiveText = readFileSync(new URL('./fixtures/POISession/historical-session.chargy', import.meta.url), 'utf8');
    const dates = [Date.parse('2026-06-01T10:00:00Z'),Date.parse('2026-06-01T10:30:00Z')];
    const historical = dates.map(time => ({ ...binding,evidence:{ ...binding.evidence,association:'historical-attestation' as const,measurementTimes:[time] } }));
    test('checks expired historical documents with today-authorized bindings at exact original reading times', async () => {
        const result = await verifyHistoricalOCMFSession(createTestChargy(Chargy),await session(archiveText),historical,{now:()=>at});
        expect(result.status).toBe('verified'); expect(result.signatureCount).toBe(2);
        expect(result.checks.every(check=>check.historicalAssociation==='rno-attested-at-reading-times')).toBe(true);
    });
    test('coverage cannot be supplied by an unchecked timestamp or duplicate competing bindings', async () => {
        await expect(verifyHistoricalOCMFSession(createTestChargy(Chargy),await session(archiveText),historical.slice(0,1),{now:()=>at})).rejects.toThrow(/exactly one/);
        await expect(verifyHistoricalOCMFSession(createTestChargy(Chargy),await session(archiveText),[...historical,...historical.slice(0,1)],{now:()=>at})).rejects.toThrow(/exactly one/);
    });
    test('an invalid original signature never produces a successful historical association result', async () => {
        const result = await verifyHistoricalOCMFSession(createTestChargy(Chargy),await session(archiveText.replace('1011','1012')),historical,{now:()=>at});
        expect(result.signaturesValid).toBe(false);
        expect(result.checks.some(check=>check.historicalAssociation==='not-proven')).toBe(true);
    });
});


describe('Original session price context and exact gross rates',()=>{
    const text=readFileSync(new URL('./fixtures/POISession/price-session.chargy',import.meta.url),'utf8');
    test('discovers a unique original start and binds its unchanged complete document bytes',async()=>{
        const original=await session(text),context=await readOCMFSessionPriceContext(createTestChargy(Chargy),original);
        const input=JSON.parse(text) as {ocmfBegin:string};
        expect(context.startDocumentSHA256).toBe(createHash('sha256').update(input.ocmfBegin).digest('hex'));
        expect(context.chargingStarted).toBe(Date.parse('2026-06-01T10:00:00Z'));expect(context.signatures).toBe('not-checked');
        const authorized={...binding,evidence:{...binding.evidence,association:'historical-attestation' as const,measurementTimes:[context.chargingStarted]}};
        const result=await verifyOCMFPriceStart(createTestChargy(Chargy),original,context,authorized,{now:()=>at});
        expect(result.status).toBe('verified');expect(result.measurementCount).toBe(1);
    });
    test('never trusts cached payloads or displayed timestamps when discovering original price context',async()=>{
        const original=await session(text),value=original.measurements?.[0]?.values[0];if(value===undefined)throw new Error('Missing reading');
        value.timestamp='2030-01-01T00:00:00Z';const document=(value as IOCMFMeasurementValue).ocmfDocument;
        if(document!==undefined)document.payload.TT='001;EUR;0;99;0;0';
        const context=await readOCMFSessionPriceContext(createTestChargy(Chargy),original);
        expect(context.chargingStarted).toBe(Date.parse('2026-06-01T10:00:00Z'));expect(context.tariffTexts).toEqual(['001;EUR;0;35;0;0']);
    });
    test('can verify the first start before an end reading exists',async()=>{
        const original=await session(text);
        for(const measurement of original.measurements??[])measurement.values=measurement.values.filter(value=>(value as IOCMFMeasurementValue).transaction==='B');
        const context=await readOCMFSessionPriceContext(createTestChargy(Chargy),original);
        const authorized={...binding,evidence:{...binding.evidence,association:'historical-attestation' as const,measurementTimes:[context.chargingStarted]}};
        expect((await verifyOCMFPriceStart(createTestChargy(Chargy),original,context,authorized,{now:()=>at})).status).toBe('verified');
    });
    test('a second competing start never acquires an implicit price subject',async()=>{
        const raw=JSON.parse(text) as {ocmfBegin:string;ocmfEnd:string};raw.ocmfEnd=raw.ocmfBegin.replace('1000','1001');
        await expect(readOCMFSessionPriceContext(createTestChargy(Chargy),await session(JSON.stringify(raw)))).rejects.toThrow();
    });
    test('compares exact raw cents without rounding and distinguishes unsupported conditions',async()=>{
        const context=await readOCMFSessionPriceContext(createTestChargy(Chargy),await session(text));
        expect(compareOCMFPriceRates(context,{currency:'EUR',energyPerKWh:'0.3500'}).status).toBe('rates-match');
        expect(compareOCMFPriceRates(context,{currency:'EUR',energyPerKWh:'0.350000000000000000001'}).status).toBe('conflict');
        expect(compareOCMFPriceRates(context,{currency:'USD',energyPerKWh:'0.35'}).status).toBe('conflict');
        expect(compareOCMFPriceRates({...context,tariffTexts:['001;EUR;0;35;5;10']},{currency:'EUR',energyPerKWh:'0.35'}).status).toBe('unsupported');
    });
});
