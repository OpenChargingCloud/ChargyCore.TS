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
import { OCMF, OCMFv1_x } from './OCMF';
import type { IOCMFMeasurementValue } from './OCMF';
import type { Chargy } from './chargy';
import type { IChargingSession, IChargeTransparencyRecord } from './interfaces/IChargeTransparencyRecord';
import { IsAChargeTransparencyRecord } from './interfaces/IChargeTransparencyRecord';
import { readPublicKey } from './LiveLinkPublicKeys';
import Decimal from 'decimal.js';
import { VerificationResult } from './interfaces/chargyInterfaces';

/** An authorized caller supplies this binding; importing JSON with these fields never grants trust. */
export interface IMeterKeyBinding {
    readonly evseId: string;
    readonly chargingStationId: string;
    readonly meterId: string;
    readonly meterSerialNumber: string;
    readonly key: {
        readonly id: string; readonly idScheme: string; readonly canonicalId: string;
        readonly value: string; readonly encodings: readonly string[]; readonly algorithm: string;
    };
    readonly evidence: {
        readonly verifiedAt: number; readonly validUntil: number; readonly association: 'current-snapshot' | 'historical-attestation';
        readonly measurementTimes?: readonly number[];
        readonly roamingNetworkId: string; readonly roamingNetworkOperatorId: string;
        readonly commitId: string; readonly revision: number; readonly treeRoot: string; readonly keyStatementDigest: string;
    };
}
export type MeterKeyVerificationStatus = 'verified' | 'key-conflict' | 'identity-conflict' | 'record-conflict' |
    'invalid-signature' | 'unsupported' | 'evidence-expired';
export interface IBoundOCMFResult {
    readonly status: MeterKeyVerificationStatus;
    readonly signaturesValid: boolean;
    readonly signatureCount: number;
    readonly measurementCount: number;
    readonly association: 'current-snapshot' | 'historical-attestation';
        readonly measurementTimes?: readonly number[];
    readonly historicalAssociation: 'not-proven' | 'rno-attested-at-reading-times';
    readonly readingPhase: 'start-only' | 'complete' | 'partial';
    readonly binding: IMeterKeyBinding;
    readonly detail: string;
    readonly record?: IChargeTransparencyRecord;
}
export interface IOCMFSessionMaterial {
    readonly documents: readonly string[];
    readonly meterSerialNumber: string;
    readonly containerKeys: readonly { readonly value: string; readonly encodings: readonly string[] }[];
}

/** Extract originals, never cached validationStatus fields. Multiple meters/formats are not silently merged. */
export function ocmfSessionMaterial(session: IChargingSession): IOCMFSessionMaterial {
    const documents = new Set<string>();
    const meterIds = new Set<string>();
    const containerKeys: { value: string; encodings: readonly string[] }[] = [];
    for (const measurement of session.measurements ?? []) {
        meterIds.add(measurement.energyMeterId);
        for (const value of measurement.values) {
            const document = (value as IOCMFMeasurementValue).ocmfDocument;
            if (document?.raw === undefined) throw new Error('Original OCMF documents are required for proven-key verification');
            documents.add(document.raw);
            if (document.publicKey !== undefined) {
                const value = typeof document.publicKey === 'string' ? document.publicKey : document.publicKey.value;
                const encoding = typeof document.publicKey === 'string' ? document.publicKeyEncoding : document.publicKey.encoding;
                if (typeof value !== 'string') throw new Error('The P-256 pilot needs an explicitly encoded container key');
                if (encoding !== 'hex' && encoding !== 'base64') throw new Error('An explicit hex/base64 SPKI container key is required');
                containerKeys.push({ value, encodings: ['SubjectPublicKeyInfo', 'DER', encoding] });
            }
        }
    }
    if (documents.size === 0 || meterIds.size !== 1) throw new Error('Exactly one meter and original signed OCMF data are required');
    return { documents: [...documents], meterSerialNumber: [...meterIds][0] ?? '', containerKeys };
}

function valuesOf(session: IChargingSession): string {
    return JSON.stringify((session.measurements ?? []).flatMap(measurement => measurement.values.map(value => ({
        meter: measurement.energyMeterId, timestamp: new Date(value.timestamp).toISOString(),
        value: new Decimal(value.value).toString(), unit: measurement.unit, scale: measurement.scale, obis: measurement.obis
    }))));
}

/** Reparse and verify every original OCMF document using only the caller-authorized key. Never patches signed input. */
export async function verifyOCMFSessionWithMeterKey(chargy: Chargy, session: IChargingSession,
    binding: IMeterKeyBinding, options: { readonly now?: () => number; readonly signal?: AbortSignal } = {}): Promise<IBoundOCMFResult> {
    let readingPhase: IBoundOCMFResult['readingPhase'] = 'partial';
    const finish = (status: MeterKeyVerificationStatus, detail: string, signatureCount = 0, measurementCount = 0,
        record?: IChargeTransparencyRecord, signaturesValid = false): IBoundOCMFResult => ({ status, detail, binding,
        association: binding.evidence.association, historicalAssociation: binding.evidence.association === 'historical-attestation' && signaturesValid &&
            (status === 'verified' || status === 'key-conflict') ? 'rno-attested-at-reading-times' : 'not-proven', readingPhase, signaturesValid, signatureCount, measurementCount,
        ...(record === undefined ? {} : { record }) });
    options.signal?.throwIfAborted();
    const current = (options.now ?? Date.now)();
    if (!Number.isFinite(current) || !Number.isFinite(binding.evidence.verifiedAt) || !Number.isFinite(binding.evidence.validUntil) ||
        binding.evidence.verifiedAt > current || binding.evidence.validUntil < current || !(['current-snapshot', 'historical-attestation'] as readonly string[]).includes(binding.evidence.association))
        return finish('evidence-expired', 'The supplied observation is not current; reconstruct authorization and verify its proof again');
    if (session.EVSEId !== binding.evseId || binding.meterSerialNumber === '')
        return finish('identity-conflict', 'The requested session EVSE differs from the authorized key binding');
    if (binding.key.algorithm !== 'ECDSA-secp256r1') return finish('unsupported', 'The bound-key OCMF pilot supports P-256 only');
    let material: IOCMFSessionMaterial;
    let expected: string;
    try { material = ocmfSessionMaterial(session); expected = valuesOf(session); }
    catch (error) { return finish('unsupported', error instanceof Error ? error.message : 'Unsupported original measurement input'); }
    if (material.meterSerialNumber !== binding.meterSerialNumber)
        return finish('identity-conflict', 'The session meter differs from the explicitly associated EVSE meter');
    const key = readPublicKey(binding.key.value, [...binding.key.encodings], binding.key.algorithm);
    if (key.keyHex === undefined) return finish('unsupported', key.details ?? 'The authorized public key cannot be decoded');
    // The pilot compares canonical uncompressed P-256 SPKI, including COSE normalized by readPublicKey.
    // Other encodings are a capability limitation, never evidence of a different mathematical key.
    const pilotSPKI = /^3059301306072a8648ce3d020106082a8648ce3d03010703420004[0-9a-f]{128}$/i;
    if (!pilotSPKI.test(key.keyHex)) return finish('unsupported', 'The P-256 pilot requires canonical uncompressed SPKI');
    let conflict = false;
    for (const supplied of material.containerKeys) {
        const decoded = readPublicKey(supplied.value, [...supplied.encodings], binding.key.algorithm);
        if (decoded.keyHex === undefined) return finish('unsupported', decoded.details ?? 'The supplied container key cannot be decoded');
        if (!pilotSPKI.test(decoded.keyHex)) return finish('unsupported', 'The supplied key needs a supported uncompressed P-256 encoding before identity comparison');
        if (decoded.keyHex.toLowerCase() !== key.keyHex.toLowerCase()) conflict = true;
    }
    const record = await new OCMF(chargy).TryToParseOCMFDocuments([...material.documents], key.keyHex, 'hex');
    options.signal?.throwIfAborted();
    if (!IsAChargeTransparencyRecord(record)) return finish('unsupported', 'The original OCMF documents could not be parsed with the authorized key');
    const parsedSession = record.chargingSessions?.[0];
    if (record.chargingSessions?.length !== 1 || parsedSession === undefined)
        return finish('identity-conflict', 'The original readings do not describe exactly one charging session');
    const parsedDocuments = new Map<string, NonNullable<IOCMFMeasurementValue['ocmfDocument']>>();
    let count = 0;
    const transactions = new Set<string>();
    let valid = true;
    for (const measurement of parsedSession.measurements ?? []) {
        for (const value of measurement.values) {
            const document = (value as IOCMFMeasurementValue).ocmfDocument;
            if (document?.raw === undefined) return finish('unsupported', 'Missing original parsed OCMF document');
            if (document.payload.MS !== binding.meterSerialNumber || document.payload.CT?.toUpperCase() !== 'EVSEID' ||
                document.payload.CI?.trim() !== binding.evseId)
                return finish('identity-conflict', 'The signed OCMF meter/EVSE identification does not match the proven association');
            if (document.signature.SA !== undefined && document.signature.SA !== 'ECDSA-secp256r1-SHA256')
                return finish('unsupported', 'The signature algorithm does not match the authorized P-256 key');
            if (binding.evidence.association === 'historical-attestation' &&
                binding.evidence.measurementTimes?.includes(Date.parse(value.timestamp)) !== true)
                return finish('identity-conflict', 'The original reading timestamp is outside the explicitly proven historical coverage');
            parsedDocuments.set(document.raw, document);
            valid = valid && value.result?.status === VerificationResult.ValidSignature;
            const transaction = (value as IOCMFMeasurementValue).transaction;
            if (transaction !== undefined) transactions.add(transaction);
            count++;
        }
    }
    readingPhase = transactions.has('B') && transactions.has('E') ? 'complete'
        : count === 1 && transactions.has('B') ? 'start-only' : 'partial';
    if (count === 0 || parsedDocuments.size !== material.documents.length) return finish('unsupported', 'Not every original document yielded readings');
    if (valuesOf(parsedSession) !== expected) return finish('record-conflict', 'Displayed measurement fields differ from the original signed documents');
    const crypt = new OCMFv1_x(chargy);
    parsedSession.method = crypt;
    for (const measurement of parsedSession.measurements ?? []) {
        measurement.chargingSession = parsedSession;
        for (const value of measurement.values) { value.measurement = measurement; value.method = crypt; }
    }
    const checkedAt = (options.now ?? Date.now)();
    if (!Number.isFinite(checkedAt) || checkedAt < binding.evidence.verifiedAt || checkedAt > binding.evidence.validUntil)
        return finish('evidence-expired', 'The observation expired while the readings were being checked');
    return finish(conflict ? 'key-conflict' : valid ? 'verified' : 'invalid-signature',
        conflict ? 'The container key conflicts with the authorized EVSE key; no silent replacement' :
            valid ? 'Original reading signatures verified with the explicitly associated key; see the separate historical association result' :
                'An original reading signature does not match the authorized key', parsedDocuments.size, count, record, valid);
}

export interface IHistoricalOCMFResult {
    readonly checks: readonly IBoundOCMFResult[];
    readonly status: 'verified' | 'failed';
    readonly signaturesValid: boolean;
    readonly signatureCount: number;
    readonly measurementCount: number;
    readonly timeBasis: 'signed-measurement-timestamps';
}

/** Each original signed document is verified once with its uniquely authorized historical key. */
export async function verifyHistoricalOCMFSession(chargy: Chargy, session: IChargingSession,
    bindings: readonly IMeterKeyBinding[], options: { readonly now?: () => number; readonly signal?: AbortSignal } = {}): Promise<IHistoricalOCMFResult> {
    const material = ocmfSessionMaterial(session);
    const checks: IBoundOCMFResult[] = [];
    for (const raw of material.documents) {
        options.signal?.throwIfAborted();
        const measurements = (session.measurements ?? []).map(measurement => ({ ...measurement,
            values: measurement.values.filter(value => (value as IOCMFMeasurementValue).ocmfDocument?.raw === raw)
        })).filter(measurement => measurement.values.length > 0);
        const times = measurements.flatMap(measurement => measurement.values.map(value => Date.parse(value.timestamp)));
        const selected = times.map(time => {
            const candidates = bindings.filter(binding => binding.evidence.association === 'historical-attestation' && binding.evidence.measurementTimes?.includes(time) === true);
            if (candidates.length !== 1) throw new Error('Each original reading needs exactly one explicitly authorized historical binding');
            const binding = candidates[0]; if (binding === undefined) throw new Error('Missing historical binding'); return binding;
        });
        const binding = selected[0];
        if (binding === undefined || selected.some(other => other.key.canonicalId !== binding.key.canonicalId ||
            other.evseId !== binding.evseId || other.meterSerialNumber !== binding.meterSerialNumber))
            throw new Error('One original signed document cannot silently switch meter keys between readings');
        const combined: IMeterKeyBinding = { ...binding, evidence: { ...binding.evidence, measurementTimes: times,
            verifiedAt: Math.max(...selected.map(item => item.evidence.verifiedAt)),
            validUntil: Math.min(...selected.map(item => item.evidence.validUntil)) } };
        checks.push(await verifyOCMFSessionWithMeterKey(chargy, { ...session, measurements }, combined, options));
    }
    return { checks, status: checks.length > 0 && checks.every(check => check.status === 'verified') ? 'verified' : 'failed',
        signaturesValid: checks.length > 0 && checks.every(check => check.signaturesValid),
        signatureCount: checks.reduce((sum,check) => sum + check.signatureCount,0),
        measurementCount: checks.reduce((sum,check) => sum + check.measurementCount,0), timeBasis: 'signed-measurement-timestamps' };
}
