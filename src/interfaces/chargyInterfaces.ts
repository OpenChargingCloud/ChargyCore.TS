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

import type Decimal               from 'decimal.js';
import * as chargyLib             from './chargyLib'
import type { IPublicKey }        from './IPublicKeyInfo';
import type { IChargingSession }  from './IChargeTransparencyRecord';


export function isGeoLocation(data: unknown): data is IGeoLocation {
    if (!chargyLib.isObject(data))
        return false;

    const latitude  = data["lat"];
    const longitude = data["lng"];

    return (latitude  === undefined || typeof latitude  === "number") &&
           (longitude === undefined || typeof longitude === "number");
}

export type GetChargingPoolFunc    = (Id: string) => IChargingPool|null;

export type GetChargingStationFunc = (Id: string) => IChargingStation|null;

export type GetEVSEFunc            = (Id: string) => IEVSE|null;

export type GetMeterFunc           = (Id: string) => IEnergyMeter|null;

export type CheckMeterPublicKeySignatureFunc = (
    chargingStation:  IChargingStation | null | undefined,
    evse:             IEVSE            | null | undefined,
    energyMeter:      IEnergyMeter     | null | undefined,
    publicKey:        IPublicKey       | null | undefined,
    signature:        unknown
) => Promise<string>;



export interface IContract
{
    "@id":                      string;
    "@context"?:                string               | undefined;
    description?:               chargyLib.I18NString | undefined;
    type?:                      string               | undefined;
    username?:                  string               | undefined;
    email?:                     string               | undefined;
}




export interface IKeyInfo
{
    keyId:                      string;
    keyType:                    string;
    curve:                      string;
    value:                      string;
}

export interface IChargingStationOperator
{
    "@id":                      string;
    "@context"?:                string                   | undefined;
    subCSOIds?:                 Array<string>            | undefined;
    description?:               chargyLib.I18NString     | undefined;
    contact:                    IContact;
    support:                    ISupport;
    privacy:                    IPrivacyContact;
    geoLocation?:               IGeoLocation             | undefined;
    chargingPools?:             Array<IChargingPool>     | undefined;
    chargingStations?:          Array<IChargingStation>  | undefined;
    EVSEs?:                     Array<IEVSE>             | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;

    chargingTariffs?:           Array<IChargingTariff>   | undefined;
    parkingTariffs?:            Array<IParkingTariff>    | undefined;

}

export interface IContact {
    email?:                     string                   | undefined;
    web?:                       string                   | undefined;
    logoUrl?:                   string                   | undefined;
    address?:                   IAddress                 | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;
}

export interface ISupport {
    hotline?:                   string;
    email:                      string;
    web?:                       string                   | undefined;
    mediationServices?:         Array<IMediationService> | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;
}

export interface IPrivacyContact {
    contact:                    string;
    email:                      string;
    web:                        string;
    publicKeys?:                Array<IPublicKey>        | undefined;
}

export interface ISignature
{
    algorithm?:                 CryptoAlgorithms | string | undefined;
    format?:                    SignatureFormats | string | undefined;
    previousValue?:             string                    | undefined;
    value?:                     string                    | undefined;
}

// export interface IECCSignature extends ISignature
// {s
//     //algorithm:                  CryptoAlgorithms|string;
//     //format:                     SignatureFormats|string;
//     //previousValue?:             string;
//     //value?:                     string;
//     r?:                         string;
//     s?:                         string;
// }


export interface ISignatureRS extends ISignature
{
    r:                          string;
    s:                          string;
}

export interface IChargingPool
{
    "@id":                      string;
    "@context"?:                string                   | undefined;
    description?:               chargyLib.I18NString     | undefined;
    address?:                   IAddress                 | undefined;
    geoLocation?:               IGeoLocation             | undefined;
    chargingStationOperator?:   IChargingStationOperator | undefined;
    chargingStations?:          Array<IChargingStation>  | undefined;
    chargingTariffs?:           Array<IChargingTariff>   | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;
}

export interface IChargingStation
{
    "@id":                      string;
    "@context"?:                string                   | undefined;
    description?:               chargyLib.I18NString     | undefined;
    manufacturer?:              IManufacturer            | undefined;
    model?:                     IDeviceModel             | undefined;
    hardware?:                  IHardware                | undefined;
    firmware?:                  IFirmware                | undefined;
    legalCompliance?:           ILegalCompliance         | undefined;
    address?:                   IAddress                 | undefined;
    geoLocation?:               IGeoLocation             | undefined;
    chargingStationOperator?:   IChargingStationOperator | undefined;
    chargingPool?:              IChargingPool            | undefined;
    chargingPoolId?:            string                   | undefined;
    EVSEs?:                     Array<IEVSE>             | undefined;
    EVSEIds?:                   Array<string>            | undefined;
    energyMeters?:              Array<IEnergyMeter>      | undefined;
    chargingTariffs?:           Array<IChargingTariff>   | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;
}

export interface IEVSE
{
    "@id":                      string;
    "@context"?:                string                   | undefined;
    description?:               chargyLib.I18NString     | undefined;
    chargingPoolId?:            string                   | undefined;
    chargingStation?:           IChargingStation         | undefined;
    chargingStationId?:         string                   | undefined;
    energyMeters?:              Array<IEnergyMeter>      | undefined;
    connectors?:                Array<IConnector>        | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;
    chargingTariffs?:           Array<IChargingTariff>   | undefined;
}

export interface IEnergyMeter
{
    "@id":                      string;
    "@context"?:                string                   | undefined;
    description?:               chargyLib.I18NString     | undefined;
    manufacturer?:              IManufacturer            | undefined;
    model?:                     IDeviceModel             | undefined;
    firmware?:                  IFirmware                | undefined;
    hardware?:                  IHardware                | undefined;
    legalCompliance?:           ILegalCompliance         | undefined;
    chargingPoolId?:            string                   | undefined;
    chargingPool?:              IChargingPool            | undefined;
    chargingStationId?:         string                   | undefined;
    chargingStation?:           IChargingStation         | undefined;
    EVSEId?:                    string                   | undefined;
    EVSE?:                      IEVSE                    | undefined;
    signatureInfos?:            ISignatureInfos          | undefined;
    signatureFormat?:           string                   | undefined;
    publicKeys?:                Array<IPublicKey>        | undefined;
}

export interface IConnector {
    "@id"?:                     string | undefined;
    type?:                      string | undefined;
    cable?:                     ICable | undefined;
}

export interface ICable {
    length?:                    number | undefined;
    lossCompensation?:          string | undefined;
    lossCompensationId?:        string | undefined;
    resistance?:                number | undefined;
    resistanceUnit?:            string | undefined;
}

export interface IConformity {
    certificateId:              string;
    url?:                       string;
    notBefore:                  string;
    notAfter:                   string;
    officialSoftware?:          Array<ITransparencySoftware>;  // The transparency software that is officially part of the charging station.
    compatibleSoftware?:        Array<ITransparencySoftware>;  // Other transparency softwares, that can verify the transparency record, but are not officially part of the charging station.
    freeText:                   string;
}

export interface ICalibration {
    certificateId:              string;
    url?:                       string;
    notBefore:                  string;
    notAfter:                   string;
    freeText:                   string;
}

export interface ILegalCompliance {
    conformity?:                Array<IConformity>;
    calibration?:               Array<ICalibration>;
    url?:                       string;
    freeText:                   string;
}

export interface IEMobilityProvider
{
    "@id":                      string;
    "@context"?:                string;
    description:                chargyLib.I18NString;
    chargingTariffs:            Array<IChargingTariff>;
    publicKeys?:                Array<IPublicKey>;
}

export interface ITaxes
{
    "@id":                      string;
    "@context"?:                string;
    description?:               chargyLib.I18NString;
    percentage:                 number;
}

export interface IMediationService
{
    "@id":                      string;
    "@context"?:                string;
    description:                chargyLib.I18NString;
    publicKeys?:                Array<IPublicKey>;
}



export interface IChargingProduct
{
    "@id":                      string;
    "@context"?:                string;
}

export interface IChargingCosts {
    total:                      number;
    currency:                   string;
    reservation?:               ICost;
    energy?:                    ICost;
    time?:                      ICost;
    idle?:                      ICost;
    flat?:                      IFlatCost;
}

export interface ICost {
    amount:                     number;     // Note: The billed amount might be different from the measured amount!
    unit:                       string;
    cost:                       number;
}

export interface IFlatCost {
    cost:                       number;
}

export interface IParking
{
    "@id":                      string;
    "@context"?:                string;
    begin:                      string;
    end?:                       string;
    overstay?:                  boolean;
}

export interface ITransparencySoftware {
    name:                       string;
    version?:                   string;
    manufacturer?:              string;
    downloadURLs?:              Array<string>;
}

export interface ITransparencyInfos {
    chargingSessionURL?:        string;                        // e.g. https://chargeportal.de.mer.eco/transactions/transparency/$sessionId
    officialSoftware?:          Array<ITransparencySoftware>;  // The transparency software that is officially part of the charging station.
    compatibleSoftware?:        Array<ITransparencySoftware>;  // Other transparency softwares, that can verify the transparency record, but are not officially part of the charging station.
    freeText?:                  string;
}

export interface IAuthorization
{
    "@id":                      string;
    "@context"?:                string;
    type?:                      string;
    timestamp?:                 string;
    chargingStationOperator?:   string;
    roamingNetwork?:            string;
    eMobilityProvider?:         string;
}

export interface ISignatureInfos {
    hash:                       CryptoHashAlgorithms|string;
    hashTruncation?:                                 number;
    algorithm:                  CryptoAlgorithms    |string;
    curve:                      IECCurves           |string;
    format:                     SignatureFormats    |string;
    encoding?:                  IEncoding           |string;
}

export enum IECCurves {
    secp192r1   = "secp192r1",
    secp224k1   = "secp224k1",
    secp256k1   = "secp256k1",
    secp256r1   = "secp256r1",
    secp384r1   = "secp384r1",
    secp512r1   = "secp512r1"
}

export enum IEncoding {
    hex         = "hex",
    base64      = "base64"
}

export enum SignatureFormats {
    DER         = "DER",
    RS          = "RS"
}

export enum CryptoAlgorithms {
    RSA         = "RSA",
    ECC         = "ECC"
}

export enum CryptoHashAlgorithms {
    SHA256      = "SHA256",
    SHA384      = "SHA384",
    SHA512      = "SHA512"
}

export enum DisplayPrefixes {
    NULL,
    KILO,
    MEGA,
    GIGA
}

export enum WarningLevel {
    low         = "low",
    medium      = "medium",
    high        = "high"
}

export enum ErrorLevel {
    low         = "low",
    medium      = "medium",
    high        = "high"
}

export interface IWarning {
    level:       WarningLevel;
    message:     chargyLib.I18NString;
}

export function CreateWarning(message: chargyLib.I18NString,
                              level:   WarningLevel = WarningLevel.low): IWarning {

    return {
        level:   level,
        message: message
    };

}

export interface IError {
    level:       ErrorLevel;
    message:     chargyLib.I18NString;
}

export function CreateError(message: chargyLib.I18NString,
                            level:   ErrorLevel = ErrorLevel.high): IError {

    return {
        level:   level,
        message: message
    };

}

export interface ISessionCryptoResult extends chargyLib.JSONObject
{

    status:                     SessionVerificationResult;
    message?:                   chargyLib.I18NString;
    exception?:                 unknown;

    // How sure we are that this result is correct!
    // (JSON) transparency records might not always include an unambiguously
    // format identifier. So multiple chargy parsers might be candidates, but
    // hopefully one will be the best matching parser.
    certainty:                  number;

    warnings?:                  Array<IWarning>;
    errors?:                    Array<IError>;

}

export function isISessionCryptoResult1(obj: unknown): obj is ISessionCryptoResult {
    return chargyLib.isObject(obj) &&
           obj["status"] !== undefined
}

export function isISessionCryptoResult2(obj: unknown): obj is ISessionCryptoResult {
    return chargyLib.isObject(obj) &&
           obj["status"] !== undefined &&
           obj["status"] !== SessionVerificationResult.InvalidSessionFormat
}

export interface ICryptoResult
{
    status:                     VerificationResult;
    errors?:                    Array<IError>;
    warnings?:                  Array<IWarning>;
}

export function isICryptoResult(obj: unknown): obj is ICryptoResult {
    return chargyLib.isObject(obj) &&
           obj["status"] !== undefined
}

export interface IAddress {
    "@context"?:                string;
    city:                       string               | undefined;
    street?:                    string               | undefined;
    houseNumber?:               string               | undefined;
    floorLevel?:                string               | undefined;
    postalCode:                 string               | undefined;
    country:                    string               | undefined;
    comment?:                   chargyLib.I18NString | undefined;
}

export interface IGeoLocation {
    lat:                        number;
    lng:                        number;
}

export interface IChargingProductRelevance
{
    time?:                      InformationRelevance | string;
    energy?:                    InformationRelevance | string;
    parking?:                   InformationRelevance | string;
    sessionFee?:                InformationRelevance | string;
}

export enum InformationRelevance {
    Unknown      = "Unknown",
    Ignored      = "Ignored",
    Informative  = "Informative",
    Important    = "Important"
}

// Remember to update main.cjs "setVerificationResult" when you edit this enum!
export enum SessionVerificationResult {

    Unvalidated                       = "Unvalidated",

    UnknownCTRFormat                  = "UnknownCTRFormat",
    NoChargeTransparencyRecordsFound  = "NoChargeTransparencyRecordsFound",

    UnknownSessionFormat              = "UnknownSessionFormat",
    InvalidSessionFormat              = "InvalidSessionFormat",
    AtLeastTwoMeasurementsRequired    = "AtLeastTwoMeasurementsRequired",
    InconsistentTimestamps            = "InconsistentTimestamps",
    MissingStartValue                 = "MissingStartValue",
    InvalidStartValue                 = "InvalidStartValue",
    InvalidIntermediateValue          = "InvalidIntermediateValue",
    MissingStopValue                  = "MissingStopValue",
    InvalidStopValue                  = "InvalidStopValue",

    EnergyMeterNotFound               = "EnergyMeterNotFound",
    InvalidMeasurement                = "InvalidMeasurement",
    InplausibleMeasurement            = "InplausibleMeasurement",

    PublicKeyNotFound                 = "PublicKeyNotFound",
    UnknownPublicKeyFormat            = "UnknownPublicKeyFormat",
    InvalidPublicKey                  = "InvalidPublicKey",

    UnknownSignatureFormat            = "UnknownSignatureFormat",
    InvalidSignature                  = "InvalidSignature",
    ValidSignature                    = "ValidSignature"

}

export enum VerificationResult {

    Unvalidated               = "Unvalidated",
    NoOperation               = "NoOperation",

    UnknownCTRFormat          = "UnknownCTRFormat",

    EnergyMeterNotFound       = "EnergyMeterNotFound",
    InvalidMeasurement        = "InvalidMeasurement",

    InvalidStartValue         = "InvalidStartValue",
    StartValue                = "StartValue",
    ValidStartValue           = "ValidStartValue",

    InvalidIntermediateValue  = "InvalidIntermediateValue",
    IntermediateValue         = "IntermediateValue",
    ValidIntermediateValue    = "ValidIntermediateValue",

    InvalidStopValue          = "InvalidStopValue",
    StopValue                 = "StopValue",
    ValidStopValue            = "ValidStopValue",

    PublicKeyNotFound         = "PublicKeyNotFound",
    UnknownPublicKeyFormat    = "UnknownPublicKeyFormat",
    InvalidPublicKey          = "InvalidPublicKey",

    UnknownSignatureFormat    = "UnknownSignatureFormat",
    InvalidSignature          = "InvalidSignature",
    ValidSignature            = "ValidSignature",

    ValidationError           = "ValidationError"

}

export interface IVersions {
    name:           string,
    description:    chargyLib.I18NString,
    versions:       Array<IVersion>
}

export interface IVersion {
    version:        string,
    releaseDate:    string,
    description:    chargyLib.I18NString,
    tags:           Array<string>,
    packages:       Array<IVersionPackage>
}

export interface IVersionPackage {
    name:           string,
    description:    chargyLib.I18NString,
    additionalInfo: unknown,
    cryptoHashes:   ICryptoHashes,
    signatures:     Array<IVersionSignature>,
    downloadURLs:   Record<string, string>
}

export interface ICryptoHashes {
    sha256?:        string,
    sha512?:        string
}

export interface IVersionSignature {
    signer:         string,
    timestamp:      string,
    publicKey:      string,
    algorithm:      string,
    format:         string,
    signature:      string
}



export type ValidationRuleOperator = ">" | ">=" | "<" | "<=" | "=" | "==";

export type EnergyValidationRule = [
    operator:  ValidationRuleOperator,
    threshold: string,
    unit:      string
];

export interface IValidationRule<T> {
    rule:   T;
    level:  WarningLevel;
}

export interface IValidationRules {
    chargingSession?: {
        totalEnergy?: IValidationRule<EnergyValidationRule>;
    };
}

export interface IResult {
    status:         SessionVerificationResult,
    message:        string
}

export interface TarInfo {
    data:           ArrayBuffer|Uint8Array,
    mode:           number,
    mtime:          string,
    path:           string
    type:           string
}

export function isIFileInfo(obj: unknown): obj is IFileInfo {

    if (!chargyLib.isMandatoryJSONObject(obj))
        return false;

    const fileInfo = obj as Record<string, unknown>;

    return typeof fileInfo["name"] === 'string' &&
           (fileInfo["data"] instanceof ArrayBuffer || ArrayBuffer.isView(fileInfo["data"]));

}

export interface IFileInfo {
    name:           string,
    path?:          string | undefined,
    type?:          string | undefined,
    data?:          ArrayBuffer|Uint8Array | undefined,
    info?:          string | undefined,
    error?:         string | undefined,
    exception?:     unknown
}

export interface IChargingPeriod
{
    startTimestamp:                 string,
    stopTimestamp?:                 string,
    endTimestamp?:                  string,
    chargingTariffId:               string,
    activeChargingTariffElement?:   IChargingTariffElement,
    costs:                          IChargingCosts
}

export enum DayOfWeek
{
    Sunday     = 0,
    Monday     = 1,
    Tuesday    = 2,
    Wednesday  = 3,
    Thursday   = 4,
    Friday     = 5,
    Saturday   = 6
}

export interface ITariffRestriction {
    start_time?:            string           | undefined,
    end_time?:              string           | undefined,
    start_date?:            string           | undefined,
    end_date?:              string           | undefined,
    min_kwh?:               Decimal          | undefined,
    max_kwh?:               Decimal          | undefined,
    min_power?:             Decimal          | undefined,
    max_power?:             Decimal          | undefined,
    min_duration?:          number           | undefined,
    max_duration?:          number           | undefined,
    day_of_week?:           Array<DayOfWeek> | undefined
}

export interface IPriceComponent {
    type:                       string,
    price:                      Decimal,
    step_size:                  number
}

export interface IChargingTariffElement {
    price_components:           Array<IPriceComponent>,
    restrictions?:              ITariffRestriction | undefined
}

export interface IDisplayText {
    language:                   chargyLib.LanguageString,
    text:                       string
}

// OCPI v2.1.1 + extensions
export interface IChargingTariff {

    "@id":                      string;
    "@context"?:                string|Array<string>,
    country_code?:              string,
    party_id?:                  string,
    shortName?:                 chargyLib.I18NString;
    summary?:                   chargyLib.I18NString;
    tariff_alt_url?:            string,
    currency?:                  string,
    taxes?:                     Array<ITaxes>;
    elements?:                  Array<IChargingTariffElement>

    //energy_mix?:                IEnergyMix,

    not_before?:                string,
    not_after?:                 string,
    created?:                   string,
    last_updated?:              string,

    signatures?:                Array<ISignatureRS>

}

export interface IParkingTariff {

    "@id":                      string;
    "@context"?:                string|Array<string>,
    country_code?:              string,
    party_id?:                  string,
    description?:               chargyLib.I18NString;
    tariff_alt_text?:           Array<IDisplayText>,
    tariff_alt_url?:            string,
    currency?:                  string,
    taxes?:                     Array<ITaxes>;
    elements?:                  Array<IChargingTariffElement>

    not_before?:                string,
    not_after?:                 string,
    created?:                   string,
    last_updated?:              string,

    signatures?:                Array<ISignatureRS>

}

export type ShowPKIDetailsFunction = (pkiData: unknown) => void;

export type IssueReportPayload = {
    timestamp:                  string;
    chargyVersion:              string;
    platform:                   string;
    invalidCTR:                 boolean;
    InvalidStationData:         boolean;
    invalidSignatures:          boolean;
    invalidCertificates:        boolean;
    transparencenySoftwareBug:  boolean;
    DSGVO:                      boolean;
    BITV:                       boolean;
    description:                string;
    chargeTransparencyRecord?:  string;
    name:                       string;
    phone:                      string;
    eMail:                      string;
};

export interface IManufacturer
{
    "@context"?:                string;
    name:                       string | undefined;
    description?:               chargyLib.I18NString;
    contact?:                   IContact;
    support?:                   ISupport;
    privacyContact?:            IPrivacyContact;
    geoLocation?:               IGeoLocation;
    publicKeys?:                Array<IPublicKey>;
}

export interface IDeviceModel {
    "@context"?:                string;
    name?:                      string     | undefined;
    url?:                       string     | undefined;
}

export interface IHardware {
    revision?:                  string     | undefined;
    "@context"?:                string;
    url?:                       string     | undefined;
    serialNumber?:              string     | undefined;
}

export interface IFirmware {
    version?:                   string               | undefined;
    "@context"?:                string;
    releaseDate?:               string               | undefined;
    url?:                       string               | undefined;
    components?:                Array<IFirmwareComponent>;
    checksum?:                  string               | undefined;
    description?:               chargyLib.I18NString | undefined;
}

export interface IFirmwareComponent {
    "@id":                      string               | undefined;
    "@context"?:                string;
    description?:               chargyLib.I18NString | undefined;
    version:                    string               | undefined;
    releaseDate?:               string               | undefined;
    checksum:                   string               | undefined;
    url?:                       string               | undefined;
}


export function OIDInfo(data: string | chargyLib.IOIDInfo): string
{

    if (typeof data === "string")
        return data;

    if (chargyLib.isOIDInfo(data))
        return data.name;

    return "";

}

export interface IContainerInfos {
    chargingPools?:         Array<IChargingPool>     | undefined;
    chargingStations?:      Array<IChargingStation>  | undefined;
    EVSEs?:                 Array<IEVSE>             | undefined;
    connectors?:            Array<IConnector>        | undefined;
    chargingSessions?:      Array<IChargingSession>  | undefined;
    warnings?:              Array<IWarning>          | undefined;
}
