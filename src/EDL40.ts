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

import { ACrypt }                          from './ACrypt'
import { createCompatibleCurve,
         createLegacyP192Curve }           from './SignatureCrypto'
import type { Chargy }                     from './chargy'
import type * as chargeTransparencyRecord  from './interfaces/IChargeTransparencyRecord'
import * as publicKeyInfo                  from './interfaces/IPublicKeyInfo'
import * as chargyInterfaces               from './interfaces/chargyInterfaces'
import * as chargyLib                      from './interfaces/chargyLib'
import Decimal                             from 'decimal.js';

export const EDL40_SESSION_CONTEXT = "https://open.charging.cloud/contexts/SessionSignatureFormats/EDL40+json";
export const EDL40_SIGNATURE_CONTEXT = "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EDL40+json";
export const EDL40_OBIS = "1-0:1.8.0*255";

export type EDL40Variant = "EDL_40_P" | "ISA_EDL_40_P";
export type EDL40Curve = "secp192r1" | "secp256r1";
export type SmlValue =
    | { kind: "octet"; bytes: Uint8Array }
    | { kind: "int";   value: bigint }
    | { kind: "uint";  value: bigint }
    | { kind: "bool";  value: boolean }
    | { kind: "list";  items: Array<SmlValue | null> }
    | { kind: "empty" };

export class EDL40ValidationError extends Error {

    constructor(readonly code: string,
                message:       string) {
        super(message);
        this.name = "EDL40ValidationError";
    }

}

export interface SmlTime {
    kind:             "secIndex" | "timestamp" | "timestampLocal";
    timestamp:        number;
    localOffsetMin:   number;
    seasonOffsetMin:  number;
}

export interface SmlListEntry {
    objName:         Uint8Array | null;
    status:          SmlValue   | null;
    valTime:         SmlTime    | null;
    unit:            number     | null;
    scaler:          number     | null;
    value:           SmlValue   | null;
    valueSignature:  Uint8Array | null;
}

export interface SmlGetListRes {
    serverId:        Uint8Array;
    listName:        Uint8Array | null;
    valList:         SmlListEntry[];
    listSignature:   Uint8Array;
}

export interface EDL40SignatureData {
    variant:         "EDL_40_P";
    signedData:      Uint8Array;
    listSignature:   Uint8Array;
    version:         number;
    isEmoc:          boolean;
    unit:            number;
    scaler:          number;
    serverId:        Uint8Array;
    contractId:      Uint8Array;
    pagination:      number;
    meterValue:      bigint;
    obisId:          Uint8Array;
    status:          number;
    meterDate:       Date;
}

export interface IsaSignatureData {
    variant:          "ISA_EDL_40_P";
    signedData:       Uint8Array;
    dataSignature:    Uint8Array;
    listSignature:    Uint8Array;
    serverId:         Uint8Array;
    listName:         Uint8Array | null;
    contractId:       Uint8Array;
    pagination:       number;
    unit:             number;
    actualEcValue:    bigint;
    actualEcScaler:   number;
    actualEcObis:     Uint8Array;
    actualEcStatus:   Uint8Array;
    actualEcDate:     Date;
    startEcValue:     bigint;
    startEcScaler:    number;
    startEcObis:      Uint8Array;
    startEcStatus:    Uint8Array;
    startEcDate:      Date;
}

export type ParsedEDL40Document = EDL40SignatureData | IsaSignatureData;

export interface IEDL40Document {
    "@context":          "EDL40";
    raw:                 string;
    variant:             EDL40Variant;
    curve:               EDL40Curve;
    encoding:            string;
    serverId:            string;
    contractId:          string;
    publicKey:           string;
    publicKeyFormat:     string;
    signedData:          string;
    hashAlgorithm:       string;
    hashValue:           string;
    signatureHex:        string;
    signature:           chargyInterfaces.ISignatureRS;
    pagination:          number;
    listNameContext?:    "START" | "UPDATE" | "STOP" | undefined;
    validationStatus:    chargyInterfaces.VerificationResult;
}

export interface IEDL40MeasurementValue extends chargeTransparencyRecord.IMeasurementValue {
    edl40Document:       IEDL40Document;
}

export interface IEDL40Measurement extends chargeTransparencyRecord.IMeasurement {
    serverId:            string;
    publicKey:           string;
    variant:             EDL40Variant;
    curve:               EDL40Curve;
    values:              IEDL40MeasurementValue[];
}

export interface IEDL40ChargeTransparencyRecord extends chargeTransparencyRecord.IChargeTransparencyRecord {
    edl40?: {
        variant:         EDL40Variant;
        serverId:        string;
        paginationStart: number;
        paginationEnd:   number;
    };
}

export interface IEDL40Crypt01Result extends chargyInterfaces.ICryptoResult {
    hashValue?:          string | undefined;
    signedData?:         string | undefined;
    publicKey?:          string | undefined;
    publicKeyFormat?:    string | undefined;
    signature?:          chargyInterfaces.ISignatureRS | undefined;
    serverId?:           string | undefined;
    variant?:            EDL40Variant | undefined;
    curve?:              EDL40Curve | undefined;
    pagination?:         string | undefined;
    obis?:               string | undefined;
    unitEncoded?:        string | undefined;
    scaler?:             string | undefined;
    value?:              string | undefined;
}

const START_ESCAPE = [0x1b, 0x1b, 0x1b, 0x1b, 0x01, 0x01, 0x01, 0x01];
const ESCAPE = [0x1b, 0x1b, 0x1b, 0x1b];
const REQUIRED_UNIT = 30;
const SIGNATURE_LENGTH = 320;

const OBIS_CONTRACT_ID = "8182815401ff";
const OBIS_SIGNED_VALUE = "0100011100ff";
const OBIS_SIGNED_VALUE_2 = "0100010800ff";
const OBIS_EDL_PAGINATION = "8180817101ff";
const OBIS_EDL_SECONDS_INDEX = "810060080001";
const OBIS_SIGNATURE_VERSION = "00af737672ff";
const OBIS_START_EC = "010001080080";
const OBIS_ACTUAL_EC = "0100010800ff";
const OBIS_ISA_PAGINATION = "8180c7f040ff";
const OBIS_ESTH = "8180816101ff";

export function canParseEDL40(data: string): boolean {

    try {
        parseEDL40(data);
        return true;
    }
    catch {
        return false;
    }

}

export function parseEDL40(data: string): ParsedEDL40Document {

    const res = parseGetListRes(data);

    try {
        return buildIsaSignature(res);
    }
    catch {
        return buildEDL40Signature(res);
    }

}

export async function verifyEDL40Document(document: ParsedEDL40Document,
                                          publicKey: string,
                                          chargy:    Chargy): Promise<{
    status:      chargyInterfaces.VerificationResult;
    curve:       EDL40Curve;
    hashValue:   string;
    signature:   Uint8Array;
}> {

    const normalizedPublicKey = chargyLib.cleanHex(publicKey);

    if (document.variant === "ISA_EDL_40_P")
    {
        const signature = document.dataSignature;
        const hashValue = await hashSignedData(document.signedData, 32);

        if (normalizedPublicKey.length !== 128 || signature.length !== 64)
            return {
                status:    chargyInterfaces.VerificationResult.InvalidPublicKey,
                curve:     "secp256r1",
                hashValue,
                signature
            };

        return {
            status: verifyRawSignature(chargy, "secp256r1", normalizedPublicKey, signature, hashValue),
            curve: "secp256r1",
            hashValue,
            signature
        };
    }

    const cutoff = document.version === 4 || document.listSignature.length === 50 ? 2 : 0;
    const signature = document.listSignature.subarray(0, document.listSignature.length - cutoff);

    if (normalizedPublicKey.length === 96 && signature.length === 48)
    {
        const hashValue = await hashSignedData(document.signedData, 24);
        return {
            status: verifyRawSignature(chargy, "secp192r1", normalizedPublicKey, signature, hashValue),
            curve: "secp192r1",
            hashValue,
            signature
        };
    }

    if (normalizedPublicKey.length === 128 && signature.length === 64)
    {
        const hashValue = await hashSignedData(document.signedData, 32);
        return {
            status: verifyRawSignature(chargy, "secp256r1", normalizedPublicKey, signature, hashValue),
            curve: "secp256r1",
            hashValue,
            signature
        };
    }

    return {
        status:    normalizedPublicKey.length === 96 || normalizedPublicKey.length === 128
                       ? chargyInterfaces.VerificationResult.InvalidSignature
                       : chargyInterfaces.VerificationResult.InvalidPublicKey,
        curve:     normalizedPublicKey.length === 128 ? "secp256r1" : "secp192r1",
        hashValue: await hashSignedData(document.signedData, normalizedPublicKey.length === 128 ? 32 : 24),
        signature
    };

}

function parseGetListRes(data: string): SmlGetListRes {

    for (const encoding of guessEncoding(data))
    {
        try {
            const bytes = decodeWithEncoding(encoding, data);
            const res = findGetListRes(decodeSmlMessages(stripTransport(bytes)));
            if (res != null)
                return res;
        }
        catch {
            // Try next plausible encoding.
        }
    }

    throw new EDL40ValidationError("SML_NO_GETLISTRES", "No verifiable SML data found");

}

function guessEncoding(data: string | null | undefined): string[] {

    const matches: string[] = [];

    if (data == null || data.trim().length === 0)
        return matches;

    try {
        decodeBase32(data);
        matches.push("base32");
    }
    catch {
        // no-op
    }

    try {
        decodeBase64(data);
        matches.push("base64");
    }
    catch {
        // no-op
    }

    try {
        chargyLib.hexToBytes(data);
        matches.push("hex");
    }
    catch {
        // no-op
    }

    return matches;

}

function decodeWithEncoding(encoding: string,
                            data:     string): Uint8Array {

    switch (encoding)
    {
        case "base32":
            return decodeBase32(data);

        case "base64":
            return decodeBase64(data);

        default:
            return chargyLib.hexToBytes(data);
    }

}

function decodeBase64(data: string): Uint8Array {

    const clean = data.replace(/\s+/g, "");

    if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean))
        throw new Error("Invalid base64 data");

    return chargyLib.base64ToBytes(clean);

}

function decodeBase32(data: string): Uint8Array {

    const clean = data.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();

    if (clean.length === 0)
        return new Uint8Array(0);

    if (!/^[A-Z2-7]+$/.test(clean))
        throw new Error("Invalid base32 data");

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    const out: number[] = [];

    for (const ch of clean)
    {
        const idx = alphabet.indexOf(ch);
        value = (value << 5) | idx;
        bits += 5;

        if (bits >= 8)
        {
            bits -= 8;
            out.push((value >>> bits) & 0xff);
        }
    }

    return Uint8Array.from(out);

}

export function stripTransport(raw: Uint8Array): Uint8Array {

    const start = indexOfSeq(raw, START_ESCAPE);

    if (start < 0)
        return raw;

    let i = start + START_ESCAPE.length;
    const out: number[] = [];

    while (i < raw.length)
    {
        if (matchSeq(raw, i, ESCAPE))
        {
            if (raw[i + 4] === 0x1a)
                break;

            if (matchSeq(raw, i + 4, ESCAPE))
            {
                out.push(0x1b, 0x1b, 0x1b, 0x1b);
                i += 8;
                continue;
            }
        }

        const byte = raw[i];
        if (byte === undefined)
            break;

        out.push(byte);
        i++;
    }

    return Uint8Array.from(out);

}

export function readTLV(buf: Uint8Array,
                        pos: number): { value: SmlValue | null; next: number } {

    if (pos >= buf.length)
        throw new EDL40ValidationError("SML_INCOMPLETE", "Unexpected end of SML data at " + pos.toString());

    const tl = byteAt(buf, pos);

    if (tl === 0x00)
        return { value: { kind: "empty" }, next: pos + 1 };

    if (tl === 0x01)
        return { value: null, next: pos + 1 };

    const type = (tl >> 4) & 0x07;
    let len = tl & 0x0f;
    let headerBytes = 1;

    if (tl & 0x80)
    {
        let p = pos + 1;

        while (p < buf.length && (byteAt(buf, p) & 0x80))
        {
            len = (len << 4) | (byteAt(buf, p) & 0x0f);
            p++;
            headerBytes++;
        }

        if (p >= buf.length)
            throw new EDL40ValidationError("SML_INCOMPLETE", "Truncated multi-byte length");

        len = (len << 4) | (byteAt(buf, p) & 0x0f);
        headerBytes++;
    }

    if (type === 0x07)
    {
        let p = pos + headerBytes;
        const items: Array<SmlValue | null> = [];

        for (let k = 0; k < len; k++)
        {
            const r = readTLV(buf, p);
            items.push(r.value);
            p = r.next;
        }

        return { value: { kind: "list", items }, next: p };
    }

    const dataLen = len - headerBytes;

    if (dataLen < 0 || pos + headerBytes + dataLen > buf.length)
        throw new EDL40ValidationError("SML_TLV_INVALID", "Invalid TLV length at " + pos.toString());

    const data = buf.slice(pos + headerBytes, pos + headerBytes + dataLen);
    const next = pos + headerBytes + dataLen;

    switch (type)
    {
        case 0x00:
            return { value: { kind: "octet", bytes: data }, next };

        case 0x04:
            return { value: { kind: "bool", value: data.length > 0 && data[0] !== 0 }, next };

        case 0x05:
            return { value: { kind: "int", value: toSignedBigInt(data) }, next };

        case 0x06:
            return { value: { kind: "uint", value: toUnsignedBigInt(data) }, next };

        default:
            throw new EDL40ValidationError("SML_TLV_INVALID", "Unknown SML type 0x" + type.toString(16));
    }

}

export function decodeSmlMessages(payload: Uint8Array): SmlValue[] {

    const messages: SmlValue[] = [];
    let pos = 0;

    while (pos < payload.length)
    {
        if (payload[pos] === 0x00)
        {
            pos++;
            continue;
        }

        const r = readTLV(payload, pos);

        if (r.next <= pos)
            break;

        if (r.value?.kind === "list")
            messages.push(r.value);

        pos = r.next;
    }

    return messages;

}

export function findGetListRes(messages: SmlValue[]): SmlGetListRes | null {

    for (const msg of messages)
    {
        if (msg.kind !== "list" || msg.items.length < 4)
            continue;

        const messageBody = msg.items[3];

        if (messageBody?.kind !== "list" || messageBody.items.length < 2)
            continue;

        const tagNode = messageBody.items[0];
        const bodyNode = messageBody.items[1];

        if (tagNode == null || (tagNode.kind !== "uint" && tagNode.kind !== "int"))
            continue;

        if (Number(tagNode.value) !== 0x0701 || bodyNode == null)
            continue;

        const res = parseGetListResNode(bodyNode);

        if (res != null)
            return res;
    }

    return null;

}

function parseGetListResNode(body: SmlValue): SmlGetListRes | null {

    if (body.kind !== "list" || body.items.length < 6)
        return null;

    const serverId = octet(body.items[1]);
    const listName = octet(body.items[2]);
    const valListNode = body.items[4];
    const listSignature = octet(body.items[5]);

    if (serverId == null || listSignature == null || valListNode?.kind !== "list")
        return null;

    const valList: SmlListEntry[] = [];

    for (const entry of valListNode.items)
    {
        const parsed = parseListEntry(entry);
        if (parsed != null)
            valList.push(parsed);
    }

    return { serverId, listName, valList, listSignature };

}

function parseListEntry(v: SmlValue | null): SmlListEntry | null {

    if (v?.kind !== "list")
        return null;

    return {
        objName:         octet(v.items[0]),
        status:          v.items[1] ?? null,
        valTime:         parseSmlTime(v.items[2]),
        unit:            num(v.items[3]),
        scaler:          num(v.items[4]),
        value:           v.items[5] ?? null,
        valueSignature:  octet(v.items[6])
    };

}

export function findEntryByObis(res:     SmlGetListRes,
                                obisHex: string): SmlListEntry | null {

    const target = obisHex.toLowerCase();

    for (const entry of res.valList)
        if (entry.objName != null && bytesToHex(entry.objName) === target)
            return entry;

    return null;

}

export function parseSmlTime(v: SmlValue | null | undefined): SmlTime | null {

    if (v?.kind !== "list" || v.items.length < 2)
        return null;

    const tag = asNumber(v.items[0]);
    const body = v.items[1];

    if (tag === 1)
        return { kind: "secIndex", timestamp: asNumber(body), localOffsetMin: 0, seasonOffsetMin: 0 };

    if (tag === 2)
        return { kind: "timestamp", timestamp: asNumber(body), localOffsetMin: 0, seasonOffsetMin: 0 };

    if (tag === 3 && body?.kind === "list" && body.items.length >= 3)
        return {
            kind:             "timestampLocal",
            timestamp:        asNumber(body.items[0]),
            localOffsetMin:   asNumber(body.items[1]),
            seasonOffsetMin:  asNumber(body.items[2])
        };

    return null;

}

function resolveSmlTime(t: SmlTime): { localEpoch: number; date: Date } {

    const offsetSec = (t.localOffsetMin + t.seasonOffsetMin) * 60;

    return {
        localEpoch:  t.timestamp + offsetSec,
        date:        new Date(t.timestamp * 1000)
    };

}

export function buildEDL40Signature(res: SmlGetListRes): EDL40SignatureData {

    const listSignature = res.listSignature;
    const isEmoc = listSignature.length === 66;

    let signedValueEntry = findEntryByObis(res, OBIS_SIGNED_VALUE);
    signedValueEntry ??= findEntryByObis(res, OBIS_SIGNED_VALUE_2);

    if (signedValueEntry == null)
        throw new EDL40ValidationError("MISSING_FIELD", "EDL40: missing signed value entry");

    const contractEntry = findEntryByObis(res, OBIS_CONTRACT_ID);
    const paginationEntry = findEntryByObis(res, OBIS_EDL_PAGINATION);
    const secondsIndexEntry = findEntryByObis(res, OBIS_EDL_SECONDS_INDEX);
    const versionEntry = findEntryByObis(res, OBIS_SIGNATURE_VERSION);

    const unit = signedValueEntry.unit ?? 0;

    if (unit !== REQUIRED_UNIT)
        throw new EDL40ValidationError("INVALID_UNIT", "EDL40: unit must be 30 (Wh)");

    const scaler = signedValueEntry.scaler ?? 0;
    const meterValue = valueAsLong(signedValueEntry);
    const obisId = signedValueEntry.objName ?? new Uint8Array(6);

    let status = 0;
    if (signedValueEntry.status != null && (signedValueEntry.status.kind === "uint" || signedValueEntry.status.kind === "int"))
        status = Number(BigInt.asUintN(32, signedValueEntry.status.value)) & 0xff;

    if (isEmoc && signedValueEntry.status != null && (signedValueEntry.status.kind === "uint" || signedValueEntry.status.kind === "int"))
        status = transformEDL40Status(Number(BigInt.asUintN(32, signedValueEntry.status.value)));

    let pagination = 0;
    const p = deepFirstInt(paginationEntry?.value);
    if (p != null)
        pagination = Number(p);

    let secondsIndex = 0;
    const s = deepFirstInt(secondsIndexEntry?.value);
    if (s != null)
        secondsIndex = Number(s);

    let version = 0;
    const ver = deepFirstInt(versionEntry?.value);
    if (ver != null)
        version = Number(ver);

    const contractRaw = contractEntry?.value?.kind === "octet"
                            ? contractEntry.value.bytes
                            : new Uint8Array(0);
    const contractId = new Uint8Array(128);
    contractId.set(contractRaw.subarray(0, 128), 0);

    const out = new Uint8Array(SIGNATURE_LENGTH);
    out.set(res.serverId.subarray(0, 10), 0);
    out.set(timeBytes(signedValueEntry), 10);
    out[14] = status;
    out.set(reverseBytes(intToBytesBE(secondsIndex >>> 0)), 15);
    out.set(reverseBytes(intToBytesBE(pagination >>> 0)), 19);
    out.set(obisId.subarray(0, 6), 23);
    out[29] = unit & 0xff;
    out[30] = scaler & 0xff;
    out.set(reverseBytes(longToBytesBE(meterValue)), 31);
    out.set(listSignature.subarray(listSignature.length - 2), 39);
    out.set(contractId, 41);

    if (contractEntry != null)
        out.set(timeBytes(contractEntry), 169);

    return {
        variant:       "EDL_40_P",
        signedData:    out,
        listSignature,
        version,
        isEmoc,
        unit,
        scaler,
        serverId:      res.serverId,
        contractId,
        pagination,
        meterValue,
        obisId,
        status,
        meterDate:     signedValueEntry.valTime != null ? resolveSmlTime(signedValueEntry.valTime).date : new Date(0)
    };

}

export function buildIsaSignature(res: SmlGetListRes): IsaSignatureData {

    const contractEntry = requireEntry(res, OBIS_CONTRACT_ID, "contract-id");
    const startEntry = requireEntry(res, OBIS_START_EC, "start-ec");
    const actualEntry = requireEntry(res, OBIS_ACTUAL_EC, "actual-ec");
    const paginationEntry = requireEntry(res, OBIS_ISA_PAGINATION, "pagination");
    const esthEntry = requireEntry(res, OBIS_ESTH, "esth");

    const actualUnit = actualEntry.unit ?? 0;
    const startUnit = startEntry.unit ?? 0;

    if (actualUnit !== REQUIRED_UNIT || startUnit !== REQUIRED_UNIT)
        throw new EDL40ValidationError("INVALID_UNIT", "ISA: unit must be 30 (Wh)");

    if (paginationEntry.value == null || (paginationEntry.value.kind !== "uint" && paginationEntry.value.kind !== "int"))
        throw new EDL40ValidationError("MISSING_FIELD", "ISA: pagination is not an unsigned integer");

    const contractRaw = contractEntry.value?.kind === "octet"
                            ? contractEntry.value.bytes
                            : new Uint8Array(0);
    const contractId = new Uint8Array(128);
    contractId.set(contractRaw.subarray(0, 128), 0);

    const esth = esthEntry.value?.kind === "octet"
                     ? esthEntry.value.bytes
                     : new Uint8Array(20);

    const actualStatus = status8(actualEntry);
    const startStatus = status8(startEntry);
    const actualValue = valueAsLong(actualEntry);
    const startValue = valueAsLong(startEntry);
    const actualSig = actualEntry.valueSignature ?? new Uint8Array(66);
    const listName = res.listName ?? new Uint8Array(6);
    const listSignature = res.listSignature;
    const dataSignature = listSignature.subarray(0, listSignature.length - 2);
    const pagination = Number(paginationEntry.value.value);

    const out = new Uint8Array(SIGNATURE_LENGTH);
    out.set(res.serverId.subarray(0, 10), 0);
    out.set(timeBytes(actualEntry), 10);
    out[14] = actualStatus[7] ?? 0;
    out.set((actualEntry.objName ?? new Uint8Array(6)).subarray(0, 6), 15);
    out[21] = actualUnit & 0xff;
    out[22] = (actualEntry.scaler ?? 0) & 0xff;
    out.set(reverseBytes(longToBytesBE(actualValue)), 23);
    out.set(listSignature.subarray(listSignature.length - 2), 31);
    out.set(actualSig.subarray(0, 66), 33);
    out.set(contractId, 99);
    out.set(timeBytes(startEntry), 227);
    out.set(esth.subarray(0, 20), 231);
    out[251] = startStatus[7] ?? 0;
    out.set((startEntry.objName ?? new Uint8Array(6)).subarray(0, 6), 252);
    out[258] = startUnit & 0xff;
    out[259] = (startEntry.scaler ?? 0) & 0xff;
    out.set(reverseBytes(longToBytesBE(startValue)), 260);
    out.set(listName.subarray(0, 6), 268);
    out.set(reverseBytes(intToBytesBE(pagination >>> 0)), 274);

    return {
        variant:          "ISA_EDL_40_P",
        signedData:       out,
        dataSignature,
        listSignature,
        serverId:         res.serverId,
        listName:         res.listName,
        contractId,
        pagination,
        unit:             actualUnit,
        actualEcValue:    actualValue,
        actualEcScaler:   actualEntry.scaler ?? 0,
        actualEcObis:     actualEntry.objName ?? new Uint8Array(6),
        actualEcStatus:   actualStatus,
        actualEcDate:     actualEntry.valTime != null ? resolveSmlTime(actualEntry.valTime).date : new Date(0),
        startEcValue:     startValue,
        startEcScaler:    startEntry.scaler ?? 0,
        startEcObis:      startEntry.objName ?? new Uint8Array(6),
        startEcStatus:    startStatus,
        startEcDate:      startEntry.valTime != null ? resolveSmlTime(startEntry.valTime).date : new Date(0)
    };

}

export function isaListNameContext(listName: Uint8Array | null): "START" | "UPDATE" | "STOP" {

    const hex = listName != null ? bytesToHex(listName) : "";

    if (hex === "8180816201ff")
        return "UPDATE";

    if (hex === "8180816202ff")
        return "STOP";

    return "START";

}

export function transformEDL40Status(value: number): number {

    let b = 0;
    const set = (targetBit: number, sourceBit: number): void => {
        if (value & (1 << sourceBit))
            b |= 1 << targetBit;
    };

    set(0, 17);
    set(3, 31);
    set(4, 16);
    set(5, 11);
    set(6, 9);
    set(7, 8);

    return b & 0xff;

}

export class EDL40Crypt01 extends ACrypt {

    constructor(chargy: Chargy) {
        super("EDL40/ISA-EDL40",
              chargy);
    }

    async VerifyChargingSession(chargingSession: chargeTransparencyRecord.IChargingSession): Promise<chargyInterfaces.ISessionCryptoResult> {

        let sessionResult = chargyInterfaces.SessionVerificationResult.ValidSignature;
        let valueCount = 0;

        for (const measurement of chargingSession.measurements ?? [])
        {
            measurement.chargingSession = chargingSession;

            for (const measurementValue of measurement.values)
            {
                valueCount++;
                measurementValue.measurement = measurement;
                const result = await this.VerifyMeasurement(measurementValue as IEDL40MeasurementValue);

                if (result.status !== chargyInterfaces.VerificationResult.ValidSignature)
                    sessionResult = chargyInterfaces.SessionVerificationResult.InvalidSignature;
            }

            if (measurement.values.length > 0 &&
                measurement.values.every(value => value.result?.status === chargyInterfaces.VerificationResult.ValidSignature))
            {
                measurement.verificationResult = {
                    status: chargyInterfaces.VerificationResult.ValidSignature
                };
            }
            else
            {
                measurement.verificationResult = {
                    status: chargyInterfaces.VerificationResult.InvalidSignature
                };
            }
        }

        if (valueCount === 0)
            sessionResult = chargyInterfaces.SessionVerificationResult.InvalidSessionFormat;

        return {
            status:    sessionResult,
            certainty: .9
        };

    }

    async VerifyMeasurement(measurementValue: IEDL40MeasurementValue): Promise<IEDL40Crypt01Result> {

        measurementValue.method = this;

        const document = measurementValue.edl40Document;
        const result: IEDL40Crypt01Result = {
            status:           document.validationStatus,
            hashValue:        document.hashValue,
            signedData:       document.signedData,
            publicKey:        document.publicKey,
            publicKeyFormat:  document.publicKeyFormat,
            signature:        document.signature,
            serverId:         document.serverId,
            variant:          document.variant,
            curve:            document.curve,
            pagination:       document.pagination.toString(),
            obis:             measurementValue.measurement?.obis,
            unitEncoded:      String(measurementValue.measurement?.unitEncoded ?? ""),
            scaler:           String(measurementValue.measurement?.scale ?? ""),
            value:            measurementValue.value.toString()
        };

        measurementValue.result = result;

        return Promise.resolve(result);

    }

    async ViewMeasurement(measurementValue:      chargeTransparencyRecord.IMeasurementValue,
                          errorDiv:              HTMLDivElement,
                          introDiv:              HTMLDivElement,
                          infoDiv:               HTMLDivElement,
                          PlainTextDiv:          HTMLDivElement,
                          HashedPlainTextDiv:    HTMLDivElement,
                          PublicKeyDiv:          HTMLDivElement,
                          SignatureExpectedDiv:  HTMLDivElement,
                          SignatureCheckDiv:     HTMLDivElement): Promise<Error | undefined> {

        void errorDiv;
        void infoDiv;

        const result = measurementValue.result as IEDL40Crypt01Result | undefined;

        introDiv.innerHTML = this.chargy.GetLocalizedMessage("The following data of the charging session is relevant for metrological and legal metrological purposes and therefore part of the digital signature").
                                      replace("{methodName}",       "EDL40/ISA-EDL40").
                                      replace("{cryptoAlgorithm}",  result?.curve ?? "");

        PlainTextDiv.innerHTML = result?.signedData?.match(/.{1,8}/g)?.join(" ") ?? "";
        HashedPlainTextDiv.innerHTML = result?.hashValue?.match(/.{1,8}/g)?.join(" ") ?? "";
        PublicKeyDiv.innerHTML = result?.publicKey?.match(/.{1,8}/g)?.join(" ") ?? "";

        SignatureExpectedDiv.innerHTML = result?.signature != null
                                             ? "r: " + (result.signature.r.match(/.{1,8}/g)?.join(" ") ?? "") + "<br />" +
                                               "s: " + (result.signature.s.match(/.{1,8}/g)?.join(" ") ?? "")
                                             : "";

        SignatureCheckDiv.innerHTML = result?.status === chargyInterfaces.VerificationResult.ValidSignature
                                          ? '<i class="fas fa-check-circle"></i><div id="description">' + this.chargy.GetLocalizedMessage("Valid signature") + '</div>'
                                          : '<i class="fas fa-times-circle"></i><div id="description">' + this.chargy.GetLocalizedMessage("Invalid signature") + '</div>';

        return Promise.resolve(undefined);

    }

}

export class EDL40 {

    constructor(private readonly chargy: Chargy) {
    }

    public async TryToParseEDL40Documents(signedDataValues:  string[],
                                          publicKey:         string,
                                          containerInfos?:   chargyInterfaces.IContainerInfos): Promise<IEDL40ChargeTransparencyRecord | chargyInterfaces.ISessionCryptoResult> {

        try
        {
            if (signedDataValues.length === 0)
                return {
                    status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                    message:   this.chargy.GetMultilanguageText("The given EDL40 data could not be parsed!"),
                    certainty: 0
                };

            const parsed = signedDataValues.map(signedData => ({
                raw:       signedData,
                signature: parseEDL40(signedData)
            }));

            const variants = new Set(parsed.map(value => value.signature.variant));

            if (variants.size > 1)
                return {
                    status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                    message:   this.chargy.GetMultilanguageText("Invalid mixture of different signed data formats within the given XML container!"),
                    certainty: 0
                };

            const documents: IEDL40Document[] = [];

            for (const value of parsed)
            {
                const verification = await verifyEDL40Document(value.signature, publicKey, this.chargy);
                const signatureHex = bytesToHex(verification.signature);
                const document: IEDL40Document = {
                    "@context":        "EDL40",
                    raw:               value.raw,
                    variant:           value.signature.variant,
                    curve:             verification.curve,
                    encoding:          "guessed",
                    serverId:          bytesToHex(value.signature.serverId),
                    contractId:        bytesToHex(trimPaddingAtEnd(value.signature.contractId)),
                    publicKey:         chargyLib.cleanHex(publicKey),
                    publicKeyFormat:   publicKeyInfo.PublicKeyFormats.XY,
                    signedData:        bytesToHex(value.signature.signedData),
                    hashAlgorithm:     "SHA256",
                    hashValue:         verification.hashValue,
                    signatureHex,
                    signature:         rawSignatureToRS(verification.signature),
                    pagination:        value.signature.pagination,
                    validationStatus:  verification.status
                };

                if (value.signature.variant === "ISA_EDL_40_P")
                    document.listNameContext = isaListNameContext(value.signature.listName);

                documents.push(document);
            }

            return this.toChargeTransparencyRecord(parsed.map(value => value.signature), documents, publicKey, containerInfos);
        }
        catch (exception)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   this.chargy.GetMultilanguageText(exception instanceof Error ? exception.message : String(exception)),
                certainty: 0
            };
        }

    }

    private toChargeTransparencyRecord(signatures:       ParsedEDL40Document[],
                                       documents:        IEDL40Document[],
                                       publicKey:        string,
                                       containerInfos?:  chargyInterfaces.IContainerInfos): IEDL40ChargeTransparencyRecord {

        const first = chargyLib.getFirstArrayElement(signatures, "Missing EDL40 signature data");
        const values = this.toMeasurementValues(signatures, documents);
        const firstValue = chargyLib.getFirstArrayElement(values, "Missing EDL40 measurement value");
        const lastValue = values[values.length - 1] ?? firstValue;
        const serverId = bytesToHex(first.serverId);
        const meterId = serverId;
        const sessionId = serverId + "-" + String(first.pagination) + "-" + String(signatures[signatures.length - 1]?.pagination ?? first.pagination);
        const curve = documents[0]?.curve ?? "secp192r1";
        const variant = first.variant;
        const evseId = containerInfos?.chargingStations?.[0]?.EVSEs?.[0]?.["@id"] ?? "DE*GEF*EVSE*EDL40*1";
        const chargingStation = containerInfos?.chargingStations?.[0] ?? {
            "@id":         "DE*GEF*STATION*EDL40*1",
            "description": { "en": "EDL40 charging station" }
        };

        chargingStation.EVSEs ??= [
            {
                "@id": evseId
            }
        ];

        let primaryEVSE = chargingStation.EVSEs[0];

        if (primaryEVSE == null)
        {
            primaryEVSE = {
                "@id": evseId
            };
            chargingStation.EVSEs = [ primaryEVSE ];
        }

        primaryEVSE.energyMeters = [
            {
                "@id":              meterId,
                "manufacturer":     { "name": variant === "ISA_EDL_40_P" ? "ISA" : "EDL40" },
                "signatureFormat":  EDL40_SIGNATURE_CONTEXT,
                "publicKeys": [
                    {
                        "value":      chargyLib.cleanHex(publicKey),
                        "algorithm":  curve,
                        "format":     publicKeyInfo.PublicKeyFormats.XY,
                        "encoding":   chargyInterfaces.IEncoding.hex
                    }
                ]
            }
        ];

        const measurement: IEDL40Measurement = {
            "energyMeterId":   meterId,
            "@context":        EDL40_SIGNATURE_CONTEXT,
            "name":            chargyLib.OBIS2MeasurementName(EDL40_OBIS),
            "obis":            EDL40_OBIS,
            "unit":            "kWh",
            "unitEncoded":     30,
            "scale":           -3,
            "serverId":        serverId,
            "publicKey":       chargyLib.cleanHex(publicKey),
            "variant":         variant,
            "curve":           curve,
            "signatureInfos": {
                "hash":              chargyInterfaces.CryptoHashAlgorithms.SHA256,
                "hashTruncation":    curve === "secp192r1" ? 24 : 32,
                "algorithm":         chargyInterfaces.CryptoAlgorithms.ECC,
                "curve":             curve,
                "format":            chargyInterfaces.SignatureFormats.RS,
                "encoding":          chargyInterfaces.IEncoding.hex
            },
            "values":          values
        };

        const firstDocument = documents[0];
        const authorizationStart = firstDocument?.contractId != null && firstDocument.contractId.length > 0
                                       ? {
                                             "@id": firstDocument.contractId
                                         }
                                       : undefined;

        const chargingSession: chargeTransparencyRecord.IChargingSession = {
            "@id":                sessionId,
            "@context":           EDL40_SESSION_CONTEXT,
            "begin":              firstValue.timestamp,
            "end":                lastValue.timestamp,
            "internalSessionId":  sessionId,
            "EVSEId":             evseId,
            "meterId":            meterId,
            "authorizationStart": authorizationStart,
            "measurements": [
                measurement
            ]
        };

        return {
            "@id":              sessionId,
            "@context":         "https://open.charging.cloud/contexts/CTR+json",
            "begin":            chargingSession.begin,
            "end":              chargingSession.end,
            "description":      {
                "de": "EDL40/ISA-EDL40 Ladevorgang",
                "en": "EDL40/ISA-EDL40 charging session"
            },
            "chargingStations": [
                chargingStation
            ],
            "chargingSessions": [
                chargingSession
            ],
            "publicKeys": [
                {
                    "@context":  "https://open.charging.cloud/contexts/publicKey+json",
                    "subject":   meterId,
                    "algorithm": curve,
                    "encoding":  chargyInterfaces.IEncoding.hex,
                    "format":    publicKeyInfo.PublicKeyFormats.XY,
                    "value":     chargyLib.cleanHex(publicKey),
                    "certainty": 1
                }
            ],
            "warnings":          containerInfos?.warnings,
            "edl40":             {
                variant,
                serverId,
                paginationStart: first.pagination,
                paginationEnd:   signatures[signatures.length - 1]?.pagination ?? first.pagination
            },
            "certainty":         1,
            "status":            chargyInterfaces.SessionVerificationResult.Unvalidated
        };

    }

    private toMeasurementValues(signatures: ParsedEDL40Document[],
                                documents:  IEDL40Document[]): IEDL40MeasurementValue[] {

        const values: IEDL40MeasurementValue[] = [];

        for (let index = 0; index < signatures.length; index++)
        {
            const signature = chargyLib.getArrayElement(signatures, index, "Missing EDL40 signature data");
            const document = chargyLib.getArrayElement(documents, index, "Missing EDL40 document");

            if (signature.variant === "ISA_EDL_40_P")
            {
                values.push(this.toValue(
                    signature.startEcDate,
                    signature.startEcValue,
                    signature.startEcScaler,
                    bytesToHex(signature.startEcStatus),
                    signature.pagination,
                    document
                ));

                values.push(this.toValue(
                    signature.actualEcDate,
                    signature.actualEcValue,
                    signature.actualEcScaler,
                    bytesToHex(signature.actualEcStatus),
                    signature.pagination,
                    document
                ));
            }
            else
            {
                values.push(this.toValue(
                    signature.meterDate,
                    signature.meterValue,
                    signature.scaler,
                    signature.status.toString(16).padStart(2, "0"),
                    signature.pagination,
                    document
                ));
            }
        }

        return values.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    }

    private toValue(timestamp:    Date,
                    valueWh:      bigint,
                    scaler:       number,
                    statusMeter:  string,
                    pagination:   number,
                    document:     IEDL40Document): IEDL40MeasurementValue {

        return {
            "timestamp":      timestamp.toISOString(),
            "value":          scaledWhToKWh(valueWh, scaler),
            "statusMeter":    statusMeter,
            "paginationId":   pagination,
            "signatures": [
                document.signature
            ],
            "edl40Document":  document,
            "result": {
                "status": document.validationStatus
            }
        };

    }

}

async function hashSignedData(signedData: Uint8Array,
                              crop:       number): Promise<string> {

    return bytesToHex((await chargyLib.sha256____(signedData)).subarray(0, crop));

}

function verifyRawSignature(chargy:    Chargy,
                            curve:     EDL40Curve,
                            publicKey: string,
                            signature: Uint8Array,
                            hashValue: string): chargyInterfaces.VerificationResult {

    try
    {
        const ec = curve === "secp192r1"
                       ? createLegacyP192Curve(chargy.elliptic)
                       : createCompatibleCurve("p256");

        const verified = ec.
            keyFromPublic("04" + publicKey, "hex").
            verify(hashValue.toUpperCase(), rawSignatureToRS(signature));

        return verified
                   ? chargyInterfaces.VerificationResult.ValidSignature
                   : chargyInterfaces.VerificationResult.InvalidSignature;
    }
    catch
    {
        return chargyInterfaces.VerificationResult.InvalidSignature;
    }

}

function rawSignatureToRS(signature: Uint8Array): chargyInterfaces.ISignatureRS {

    const signatureHex = bytesToHex(signature);
    const half = signatureHex.length / 2;

    return {
        algorithm:  chargyInterfaces.CryptoAlgorithms.ECC,
        format:     chargyInterfaces.SignatureFormats.RS,
        value:      signatureHex,
        r:          signatureHex.substring(0, half),
        s:          signatureHex.substring(half)
    };

}

function scaledWhToKWh(valueWh: bigint,
                       scaler:  number): Decimal {

    return new Decimal(valueWh.toString()).
               mul(new Decimal(10).pow(scaler)).
               div(1000);

}

function timeBytes(entry: SmlListEntry): Uint8Array {

    if (entry.valTime == null)
        throw new EDL40ValidationError("MISSING_FIELD", "EDL40/ISA: missing valTime");

    return reverseBytes(intToBytesBE(resolveSmlTime(entry.valTime).localEpoch >>> 0));

}

function valueAsLong(entry: SmlListEntry): bigint {

    if (entry.value?.kind === "int" || entry.value?.kind === "uint")
        return entry.value.value;

    if (entry.value?.kind === "octet")
        return toSignedBigInt(entry.value.bytes);

    return 0n;

}

function requireEntry(res:     SmlGetListRes,
                      obis:    string,
                      label:   string): SmlListEntry {

    const entry = findEntryByObis(res, obis);

    if (entry == null)
        throw new EDL40ValidationError("MISSING_FIELD", "ISA: missing " + label + " entry (OBIS " + obis + ")");

    return entry;

}

function status8(entry: SmlListEntry): Uint8Array {

    const value = entry.status;

    if (value != null && (value.kind === "uint" || value.kind === "int"))
        return longToBytesBE(BigInt.asUintN(64, value.value));

    return new Uint8Array(8);

}

function deepFirstInt(value: SmlValue | null | undefined): bigint | null {

    if (value == null)
        return null;

    if (value.kind === "uint" || value.kind === "int")
        return value.value;

    if (value.kind === "list")
        for (let i = value.items.length - 1; i >= 0; i--)
        {
            const result = deepFirstInt(value.items[i]);
            if (result != null)
                return result;
        }

    return null;

}

function octet(value: SmlValue | null | undefined): Uint8Array | null {
    return value?.kind === "octet" ? value.bytes : null;
}

function num(value: SmlValue | null | undefined): number | null {

    if (value?.kind === "uint" || value?.kind === "int")
        return Number(value.value);

    return null;

}

function asNumber(value: SmlValue | null | undefined): number {

    if (value?.kind === "uint" || value?.kind === "int")
        return Number(value.value);

    return 0;

}

function intToBytesBE(value: number): Uint8Array {
    return Uint8Array.from([
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8)  & 0xff,
         value         & 0xff
    ]);
}

function longToBytesBE(value: bigint): Uint8Array {

    const out = new Uint8Array(8);
    let v = BigInt.asUintN(64, value);

    for (let i = 7; i >= 0; i--)
    {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }

    return out;

}

function reverseBytes(bytes: Uint8Array): Uint8Array {

    const out = new Uint8Array(bytes.length);

    for (let i = 0; i < bytes.length; i++)
    {
        const byte = bytes[i];
        if (byte !== undefined)
            out[bytes.length - 1 - i] = byte;
    }

    return out;

}

function toUnsignedBigInt(bytes: Uint8Array): bigint {

    let value = 0n;

    for (const byte of bytes)
        value = (value << 8n) | BigInt(byte);

    return value;

}

function toSignedBigInt(bytes: Uint8Array): bigint {

    if (bytes.length === 0)
        return 0n;

    let value = toUnsignedBigInt(bytes);
    const bits = BigInt(bytes.length * 8);
    const signBit = 1n << (bits - 1n);

    if (value & signBit)
        value -= 1n << bits;

    return value;

}

function trimPaddingAtEnd(bytes: Uint8Array): Uint8Array {

    let end = bytes.length;

    while (end > 0 && bytes[end - 1] === 0x00)
        end--;

    return bytes.subarray(0, end);

}

function indexOfSeq(haystack: Uint8Array,
                    needle:   number[]): number {

    outer: for (let i = 0; i + needle.length <= haystack.length; i++)
    {
        for (let j = 0; j < needle.length; j++)
            if (haystack[i + j] !== needle[j])
                continue outer;

        return i;
    }

    return -1;

}

function matchSeq(buf: Uint8Array,
                  pos: number,
                  seq: number[]): boolean {

    if (pos + seq.length > buf.length)
        return false;

    for (let i = 0; i < seq.length; i++)
        if (buf[pos + i] !== seq[i])
            return false;

    return true;

}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function byteAt(bytes: Uint8Array,
                index: number): number {

    const byte = bytes[index];

    if (byte === undefined)
        throw new EDL40ValidationError("SML_INCOMPLETE", "Unexpected end of SML data at " + index.toString());

    return byte;

}
