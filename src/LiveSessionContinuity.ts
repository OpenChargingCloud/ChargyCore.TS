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
import { canonicalJSONBytes } from './interfaces/CryptoUtils';
import { collectDocumentPublicKeys, verifyDocumentSignaturesWithKeys, type IDocumentPublicKey } from './DocumentSignatures';
import type { JSONObject } from './interfaces/chargyLib';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ILiveSessionDocument {
    readonly json: JSONObject;
    readonly id: string;
    readonly evseId: string;
    readonly meterSerialNumber: string;
    readonly readings: readonly string[];
    readonly reference: string;
}
function object(value: unknown): Record<string, unknown> {
    if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a live-session object');
    return value as Record<string,unknown>;
}
function text(value:unknown):string {
    if(typeof value!=='string'||value.length===0)throw new Error('Missing live-session identity');return value;
}
/** Strict cumulative OCMF pilot. Document signatures establish continuity with the imported CPO keys, not their external authority. */
export function readLiveSessionDocument(input:string,now:number=Date.now()):ILiveSessionDocument {
    if(input.length>4*1024*1024||!Number.isFinite(now))throw new Error('Invalid live-session input or clock');
    const json=object(JSON.parse(input)) as JSONObject;
    if(json['@context']!=='https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0')throw new Error('Unsupported live-session context');
    const at=Date.parse(text(json['lastUpdated'])),created=Date.parse(text(json['created']));
    if(!Number.isFinite(at)||!Number.isFinite(created)||created>at||at>now)throw new Error('Invalid/future live-session timestamps');
    const station=object(json['chargingStation']),evse=object(station['EVSE']),meter=object(evse['energyMeter']);
    const cpo=object(json['chargingStationOperator']);
    const keys=collectDocumentPublicKeys({chargingStationOperator:cpo}).filter(key=>key.keyUsage.includes('signCTRs'));
    const signatures=json['signatures'];
    if(!Array.isArray(signatures)||signatures.length===0||signatures.some(raw=>{
        const signed=object(object(raw)['signedData']);
        return JSON.stringify(signed['excludedProperties'])!==JSON.stringify(['signatures']);
    }))throw new Error('Live pilot requires signatures covering the complete document');
    if(verifyDocumentSignaturesWithKeys(json,keys).status!=='allValid')throw new Error('Live document signature is not valid with the imported CPO document keys');
    const section=json['signedMeterValues'];let readings:string[]=[];
    if(section!==undefined){const values=object(section);
        if(JSON.stringify(values['encodings'])!==JSON.stringify(['OCMF'])||!Array.isArray(values['values'])||values['values'].some(raw=>typeof raw!=='string'||!raw.startsWith('OCMF|')))
            throw new Error('Live pilot requires cumulative original OCMF documents');
        readings=values['values'] as string[];
    }
    if(readings.length>2000||new Set(readings).size!==readings.length)throw new Error('Duplicate or excessive live readings');
    const pipeline=json['docRefIdGeneration']??['SHA-256','hex'];
    if(JSON.stringify(pipeline)!==JSON.stringify(['SHA-256','hex']))throw new Error('Unsupported live document reference pipeline');
    return {json,id:text(json['@id']),evseId:text(evse['@id']),meterSerialNumber:text(meter['serialNumber']),readings,
        reference:bytesToHex(sha256(canonicalJSONBytes(json)))};
}
/** Validate originals, exact predecessor reference, fixed identity/keys and append-only cumulative readings before adopting an update. */
export function verifyLiveSessionTransition(previousText:string,nextText:string,now:number=Date.now(),options:{readonly structureOnly?:boolean}={}):ILiveSessionDocument {
    const previous=readLiveSessionDocument(previousText,now),next=readLiveSessionDocument(nextText,now);
    if(previous.id!==next.id||previous.evseId!==next.evseId||previous.meterSerialNumber!==next.meterSerialNumber||
        previous.json['created']!==next.json['created']||previous.json['chargingSessionId']!==next.json['chargingSessionId']||
        object(previous.json['chargingStationOperator'])['@id']!==object(next.json['chargingStationOperator'])['@id'])throw new Error('Live-session identity changed');
    if(Date.parse(text(next.json['lastUpdated']))<=Date.parse(text(previous.json['lastUpdated']))||
        text(next.json['updates']).toLowerCase()!==previous.reference)throw new Error('Live update does not follow the original accepted predecessor');
    const previousCPO=object(previous.json['chargingStationOperator']);
    const keys=collectDocumentPublicKeys({chargingStationOperator:previousCPO}).filter(key=>key.keyUsage.includes('signCTRs'));
    if(options.structureOnly!==true&&verifyDocumentSignaturesWithKeys(next.json,keys).status!=='allValid')throw new Error('Live CPO document key changed without an authorized transition');
    if(next.readings.length<previous.readings.length||previous.readings.some((raw,index)=>next.readings[index]!==raw))throw new Error('Previously received signed readings were removed, reordered or replaced');
    return next;
}

export interface ILiveCPOAuthority {
    readonly evseId:string;readonly chargingStationId:string;readonly operatorId:string;
    readonly keys:readonly {readonly algorithm:string;readonly encodings:readonly string[];readonly value:string;readonly keyUsage:readonly string[]}[];
}
/** Verify every original envelope with keys authenticated independently through POI, never its self-declared key list. */
export function verifyLiveSessionAuthority(input:string,authority:ILiveCPOAuthority,previousText?:string,now:number=Date.now()):ILiveSessionDocument {
    const current=readLiveSessionDocument(input,now),cpo=object(current.json['chargingStationOperator']),station=object(current.json['chargingStation']);
    if(current.evseId!==authority.evseId||station['@id']!==authority.chargingStationId||cpo['@id']!==authority.operatorId)throw new Error('The live document does not belong to the POI-authorized CPO/station/EVSE');
    const keys:IDocumentPublicKey[]=authority.keys.filter(key=>key.keyUsage.includes('signCTRs')).map(key=>({...key,encodings:[...key.encodings],keyUsage:[...key.keyUsage]}));
    if(verifyDocumentSignaturesWithKeys(current.json,keys).status!=='allValid')throw new Error('The live document signature is not authorized by the proven CPO');
    if(previousText!==undefined){
        const previous=readLiveSessionDocument(previousText,now);verifyLiveSessionTransition(previousText,input,now,{structureOnly:true});
        const old=collectDocumentPublicKeys({chargingStationOperator:previous.json['chargingStationOperator']}).filter(key=>key.keyUsage.includes('signCTRs'));
        if(verifyDocumentSignaturesWithKeys(current.json,old).validCount===0)throw new Error('A live document-key change requires an old-key co-signature on the transition envelope');
    }
    return current;
}
