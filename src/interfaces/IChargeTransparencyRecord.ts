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

import type { ACrypt }                       from '../ACrypt'
import type { ISignatureRS }                 from './chargyInterfaces';
import type * as chargyInterfaces            from './chargyInterfaces'
import type * as chargeTransparencyLiveLink  from './IChargeTransparencyLiveLink'
import type * as publicKeyInfo               from './IPublicKeyInfo';
import      * as chargyLib                   from './chargyLib'
import Decimal                               from 'decimal.js';
import {
    isISessionCryptoResult1,
    SessionVerificationResult
} from './chargyInterfaces';

export function IsAChargeTransparencyRecord(data: unknown): data is IChargeTransparencyRecord
{

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    const chargeTransparencyRecord = data as IChargeTransparencyRecord;

    return chargeTransparencyRecord.begin            !== undefined &&
           //chargeTransparencyRecord.end              !== undefined &&
           chargeTransparencyRecord.chargingSessions !== undefined;

}


export interface IChargeTransparencyRecord extends chargyLib.JSONObject
{

    "@id":                       string;
    "@context":                  string | Array<string>                           | undefined;
    begin?:                      string                                           | undefined;
    end?:                        string                                           | undefined;
    description?:                chargyLib.I18NString                             | undefined;
    contracts?:                  Array<chargyInterfaces.IContract>                | undefined;
    chargingStationOperators?:   Array<chargyInterfaces.IChargingStationOperator> | undefined;
    chargingPools?:              Array<chargyInterfaces.IChargingPool>            | undefined;
    chargingStations?:           Array<chargyInterfaces.IChargingStation>         | undefined;
    chargingTariffs?:            Array<chargyInterfaces.IChargingTariff>          | undefined;
    publicKeys?:                 Array<publicKeyInfo.   IPublicKey>               | undefined;
    chargingSessions?:           Array<IChargingSession>                          | undefined;
    eMobilityProviders?:         Array<chargyInterfaces.IEMobilityProvider>       | undefined;
    mediationServices?:          Array<chargyInterfaces.IMediationService>        | undefined;
    verificationResult?:         chargyInterfaces.ISessionCryptoResult            | undefined;
    invalidDataSets?:            Array<IExtendedFileInfo>                         | undefined;

    warnings?:                   Array<chargyInterfaces.IWarning>                 | undefined;
    errors?:                     Array<chargyInterfaces.IError>                   | undefined;
    status?:                     chargyInterfaces.SessionVerificationResult       | undefined;

    // How sure we are that this result is correct!
    // (JSON) transparency records might not always include an unambiguously
    // format identifier. So multiple chargy parsers might be candidates, but
    // hopefully one will be the best matching parser.
    certainty:                   number;

}






export function IsASessionCryptoResult(data: unknown): data is chargyInterfaces.ISessionCryptoResult
{

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    //const sessionCryptoResult = data as chargyInterfaces.ISessionCryptoResult;

    //return sessionCryptoResult.status !== undefined;
    return true;

}




export interface IChargingSession
{
    "@id":                        string;
    "@context"?:                  string | Array<string>                     | undefined;
    ctr?:                         IChargeTransparencyRecord                  | undefined;
    GUI?:                         HTMLDivElement                             | undefined;
    begin?:                       string                                     | undefined;
    end?:                         string                                     | undefined;
    internalSessionId?:           string                                     | undefined;
    chargingProductRelevance?:    chargyInterfaces.IChargingProductRelevance | undefined,
    description?:                 chargyLib.       I18NString                | undefined;
    chargingStationOperatorId?:   string                                     | undefined;
    chargingStationOperator?:     chargyInterfaces.IChargingStationOperator  | undefined;
    chargingPoolId?:              string                                     | undefined;
    chargingPool?:                chargyInterfaces.IChargingPool             | undefined;
    chargingStationId?:           string                                     | undefined;
    chargingStation?:             chargyInterfaces.IChargingStation          | undefined;
    EVSEId?:                      string                                     | undefined;
    EVSE?:                        chargyInterfaces.IEVSE                     | undefined;
    ConnectorId?:                 string                                     | undefined;
    Connector?:                   chargyInterfaces.IConnector                | undefined;
    meterId?:                     string                                     | undefined;
    meter?:                       chargyInterfaces.IEnergyMeter              | undefined;
    publicKey?:                   publicKeyInfo.IPublicKey                   | undefined;
    tariffId?:                    string                                     | undefined;
    chargingTariffs?:             Array<chargyInterfaces.IChargingTariff>    | undefined;
    chargingPeriods?:             Array<chargyInterfaces.IChargingPeriod>    | undefined;
    totalCosts?:                  chargyInterfaces.IChargingCosts            | undefined;
    authorizationStart?:          chargyInterfaces.IAuthorization            | undefined;
    authorizationStop?:           chargyInterfaces.IAuthorization            | undefined;
    product?:                     chargyInterfaces.IChargingProduct          | undefined;
    measurements?:                Array<IMeasurement>                        | undefined;
    legallyRelevantLogMessages?:  Array<ILegallyRelevantLogMessage>          | undefined;
    parking?:                     Array<chargyInterfaces.IParking>           | undefined;
    transparencyInfos?:           chargyInterfaces.ITransparencyInfos        | undefined;
    method?:                      ACrypt                                     | undefined;
    original?:                    string                                     | undefined;
    signature?:                   chargyInterfaces.ISignatureRS | string     | undefined;
    hashValue?:                   string                                     | undefined;
    verificationResult?:          chargyInterfaces.ISessionCryptoResult      | undefined;
}


export interface ILegallyRelevantLogMessage
{
    "@context"?:                  string | Array<string>                          | undefined;
    chargingSession?:             IChargingSession                                | undefined;
    timestamp:                    string;
    code?:                        string                                          | undefined;
    data?:                        chargyLib.JSONObject                            | undefined;
    text?:                        chargyLib.I18NString                            | undefined;
    signatures?:                  Array<chargyInterfaces.ISignature|ISignatureRS> | undefined;
}


export interface IMeasurement
{
    "@context"?:                  string| Array<string>            | undefined;
    chargingSession?:             IChargingSession                 | undefined;
    energyMeterId:                string;
    phenomena?:                   unknown[]                        | undefined;
    name:                         string;
    obis:                         string;
    unit?:                        string                           | undefined;
    unitEncoded?:                 number                           | undefined;
    valueType?:                   string                           | undefined;
    scale:                        number;
    verifyChain?:                 boolean                          | undefined;
    signatureInfos?:              chargyInterfaces.ISignatureInfos | undefined;
    values:                       Array<IMeasurementValue>;
    verificationResult?:          chargyInterfaces.ICryptoResult   | undefined;
}

export interface IMeasurements
{
    "@context"?:                  string | Array<string>         | undefined;
    values:                       Array<IMeasurement>;
    verificationResult?:          chargyInterfaces.ICryptoResult | undefined;
}

export interface IMeasurementValue
{

    measurement?:                 IMeasurement                                    | undefined;
    method?:                      ACrypt                                          | undefined;
    previousValue?:               IMeasurementValue                               | undefined;

    timestamp:                    string;
    value:                        Decimal;
    value_displayPrefix?:         chargyInterfaces.DisplayPrefixes                | undefined;
    value_displayPrecision?:      number                                          | undefined;
    statusMeter?:                 string                                          | undefined;
    secondsIndex?:                number                                          | undefined;
    paginationId?:                number | string                                 | undefined;
    logBookIndex?:                string                                          | undefined;
    statusAdapter?:               string                                          | undefined;

    errors?:                      Array<chargyInterfaces.IError>                  | undefined;
    warnings?:                    Array<chargyInterfaces.IWarning>                | undefined;

    signatures?:                  Array<chargyInterfaces.ISignature|ISignatureRS> | undefined;
    result?:                      chargyInterfaces.ICryptoResult                  | undefined;

}

export interface IExtendedFileInfo extends chargyInterfaces.IFileInfo {

    result:  IChargeTransparencyRecord                              |
             chargeTransparencyLiveLink.IChargeTransparencyLiveLink |
             publicKeyInfo.IPublicKey                               |
             publicKeyInfo.IPublicKeyLookup                         |
             chargyInterfaces.ISessionCryptoResult

}


export function CloneCTR(CTR: IChargeTransparencyRecord): IChargeTransparencyRecord
{

    // const jsonSerializer = (key:string, value:any) => {
    //     return value instanceof Decimal ? value.toNumber() : value;
    // };

    const clonedCTR = JSON.parse(JSON.stringify(CTR)) as IChargeTransparencyRecord;   //, jsonSerializer));

    if (clonedCTR.chargingSessions)
    {
        for (const session of clonedCTR.chargingSessions) {
            for (const measurement of session.measurements ?? []) {
                for (const value of measurement.values) {
                    if (typeof value.value === 'string' || typeof value.value === 'number')
                        value.value = new Decimal(value.value);
                }
            }
        }
    }

    return clonedCTR;

}

/**
 * Extracts the per-session verification results from a verified Charge Transparency
 * Record. When the record carries no usable session results, a single "no charge
 * transparency records found" result is returned instead.
 *
 * This is exactly the payload the renderer hands to the main process (and, in
 * --nogui / HTTP mode, to the CLI verification service) after a verification. It
 * is kept here as a pure, DOM-free function so the renderer (ChargyApp), the main
 * process and the tests can all share the very same logic instead of mirroring it.
 *
 * The "no records found" message is passed in so the renderer can localize it,
 * while non-UI callers (CLI service, tests) get a sensible English default.
 */
export function toSessionVerificationResults(CTR:               IChargeTransparencyRecord,
                                             noRecordsMessage:  chargyLib.I18NString = {"en": "No charge transparency records found!" })

    : chargyInterfaces.ISessionCryptoResult[] | chargyInterfaces.ISessionCryptoResult

{

    const verificationResults = (CTR.chargingSessions ?? [])
                                    .map(session => session.verificationResult)
                                    .filter(isISessionCryptoResult1);

    if (verificationResults.length > 0)
        return verificationResults;

    return {
        status:     SessionVerificationResult.Unvalidated,
        message:    noRecordsMessage,
        certainty:  0
    };

}
