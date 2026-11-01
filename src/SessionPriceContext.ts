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
import { OCMF } from './OCMF';
import type { IOCMFMeasurementValue } from './OCMF';
import type { Chargy } from './chargy';
import { IsAChargeTransparencyRecord, type IChargingSession } from './interfaces/IChargeTransparencyRecord';
import { ocmfSessionMaterial, verifyOCMFSessionWithMeterKey, type IMeterKeyBinding, type IBoundOCMFResult } from './MeterKeyVerification';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import Decimal from 'decimal.js';
import { parseOCMFBonnTariffText, OCMFBonnTariffSeparator } from './OCMF_BET_TariffTextExtension';

export interface IOCMFSessionPriceContext {
    readonly evseId: string;
    readonly meterSerialNumber: string;
    readonly chargingStarted: number;
    readonly startDocumentSHA256: string;
    readonly tariffTexts: readonly string[];
    readonly allTariffTexts?: readonly string[];
    /** Context discovery is not signature verification. Caller must separately validate original readings. */
    readonly signatures: 'not-checked';
}

/** Reparse originals to discover a unique signed start document. Never consumes imported result flags or cached payloads. */
export async function readOCMFSessionPriceContext(chargy: Chargy, session: IChargingSession): Promise<IOCMFSessionPriceContext> {
    const material=ocmfSessionMaterial(session);
    const record=await new OCMF(chargy).TryToParseOCMFDocuments([...material.documents]);
    if(!IsAChargeTransparencyRecord(record)||record.chargingSessions?.length!==1)throw new Error('Price binding needs one original OCMF session');
    const parsed=record.chargingSessions[0];if(parsed===undefined)throw new Error('Missing original session');
    const starts=new Map<string,{raw:string;at:number}>(),tariffs=new Set<string>(),allTariffs=new Set<string>();
    for(const measurement of parsed.measurements??[])for(const value of measurement.values){
        const original=value as IOCMFMeasurementValue,document=original.ocmfDocument;
        if(document?.raw===undefined||document.payload.CT?.toUpperCase()!=='EVSEID'||document.payload.CI?.trim()!==session.EVSEId||document.payload.MS!==material.meterSerialNumber)
            throw new Error('Price context differs from original signed EVSE/meter identity');
        if(typeof document.payload.TT==='string')allTariffs.add(document.payload.TT);
        if(original.transaction==='B'){
            if(typeof document.payload.TT==='string')tariffs.add(document.payload.TT);
            const at=Date.parse(value.timestamp);if(!Number.isFinite(at))throw new Error('Invalid original start time');
            starts.set(document.raw+'\n'+String(at),{raw:document.raw,at});
        }
    }
    if(starts.size!==1)throw new Error('Price binding needs one unambiguous original start document/time');
    const start=[...starts.values()][0];if(start===undefined||session.EVSEId===undefined)throw new Error('Missing original price subject');
    return Object.freeze({evseId:session.EVSEId,meterSerialNumber:material.meterSerialNumber,chargingStarted:start.at,
        startDocumentSHA256:bytesToHex(sha256(new TextEncoder().encode(start.raw))),tariffTexts:Object.freeze([...tariffs]),allTariffTexts:Object.freeze([...allTariffs]),signatures:'not-checked'});
}

export interface IGrossPriceRates { readonly currency:string;readonly energyPerKWh?:string;readonly flatFee?:string;readonly timePerHour?:string; }
export interface IOCMFPriceRateComparison { readonly status:'rates-match'|'conflict'|'unsupported'|'missing';readonly detail:string; }

/** Compare exact raw decimal cents. This is rate consistency, not VAT/rounding/quantity/final-invoice verification. */
export function compareOCMFPriceRates(context:IOCMFSessionPriceContext,rates:IGrossPriceRates|undefined):IOCMFPriceRateComparison {
    if(context.tariffTexts.length===0)return {status:'missing',detail:'No signed OCMF tariff text'};
    if(rates===undefined)return {status:'unsupported',detail:'No supported declared gross-rate projection'};
    try{
        for(const text of context.tariffTexts)for(const part of text.split(OCMFBonnTariffSeparator)){
            const profile=parseOCMFBonnTariffText(part),fields=part.split(';');
            if(profile.currency!==rates.currency)return {status:'conflict',detail:'Signed currency differs from the selected price'};
            const fee=new Decimal(fields[2]??'NaN').div(100);
            if(!fee.eq(rates.flatFee??'0'))return {status:'conflict',detail:'Signed start fee differs from the selected price'};
            if(profile.code==='001'||profile.code==='002'){
                if(!new Decimal(fields[4]??'NaN').isZero())return {status:'unsupported',detail:'Conditional parking/blocking fees need their own applicability profile'};
                if(!new Decimal(fields[3]??'NaN').div(100).eq(rates.energyPerKWh??'0')||!new Decimal(rates.timePerHour??'0').isZero())
                    return {status:'conflict',detail:'Signed energy/time rate differs from the selected price'};
            }else if(!new Decimal(fields[3]??'NaN').times(60).div(100).eq(rates.timePerHour??'0')||!new Decimal(rates.energyPerKWh??'0').isZero())
                return {status:'conflict',detail:'Signed time/energy rate differs from the selected price'};
        }
        return {status:'rates-match',detail:'Declared gross currency and unconditional rates match the original start tariff texts; billing quantities, rounding and customer consent are separate'};
    }catch(error){return {status:'unsupported',detail:error instanceof Error?error.message:String(error)};}
}


/** Verify the exact original start document with a caller-authorized key, independent of later reading availability. */
export async function verifyOCMFPriceStart(chargy: Chargy, session: IChargingSession, context: IOCMFSessionPriceContext,
    binding: IMeterKeyBinding, options: { readonly now?: () => number; readonly signal?: AbortSignal } = {}): Promise<IBoundOCMFResult> {
    const measurements=(session.measurements??[]).map(measurement=>({...measurement,values:measurement.values.filter(value=>{
        const raw=(value as IOCMFMeasurementValue).ocmfDocument?.raw;
        return raw!==undefined&&bytesToHex(sha256(new TextEncoder().encode(raw)))===context.startDocumentSHA256;
    })})).filter(measurement=>measurement.values.length>0);
    if(measurements.length===0||context.evseId!==session.EVSEId||binding.evidence.measurementTimes?.includes(context.chargingStarted)!==true)
        throw new Error('Price assignment needs the exact original start and authorized historical coverage');
    return verifyOCMFSessionWithMeterKey(chargy,{...session,measurements},binding,options);
}
