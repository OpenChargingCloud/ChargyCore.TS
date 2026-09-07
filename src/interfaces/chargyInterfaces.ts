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


/**
 * JSON text representation of a quantity, including its unit and any stated
 * uncertainty, e.g. "22 kW" or "(230.00 ±0.12) V, k=2".
 * These aliases document meaning; they do not validate syntax or dimensions.
 * Parse and validate at the serialization boundary before doing arithmetic.
 */
export type MetrologicalText  = string;
export type Volt              = MetrologicalText;
export type Ampere            = MetrologicalText;
export type Watt              = MetrologicalText;
export type WattHour          = MetrologicalText;
export type Ohm               = MetrologicalText;
export type Meter             = MetrologicalText;
export type Second            = MetrologicalText;
export type Kelvin            = MetrologicalText;

/** ISO 8601 timestamp. A point in time, distinct from an elapsed duration. */
export type Timestamp         = string;
/** ISO 8601 duration retained for existing fields, e.g. "PT1H". */
export type ISO8601Duration   = string;
/** Calendar date without a time or UTC offset, e.g. "2026-09-06". */
export type CalendarDate      = string;
/** Local time of day; interpreting a tariff also requires its time zone. */
export type LocalTime         = string;

/** Numeric seconds in existing protocol/configuration fields; not mCBOR text. */
export type DurationSeconds   = number;
/** Geographic coordinates retain the existing numeric degree representation. */
export type Degrees           = number;
/** Legacy magnitude: its unit and decimal scale are stored separately. */
export type MeasurementMagnitude = Decimal;
export type UnitSymbol        = string;
/** Decimal exponent attached to a legacy measurement magnitude. */
export type DecimalScale      = number;
/** Fixed-unit OCPI restrictions, retained until a versioned migration. */
export type EnergyInKilowattHours = Decimal;
export type PowerInKilowatts      = Decimal;

export type PowerType = "AC"|"DC";



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
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:               chargyLib.I18NString                         | undefined;
    type?:                      string                                       | undefined;
    username?:                  string                                       | undefined;
    email?:                     string                                       | undefined;
}




export interface IKeyInfo
{
    keyId:                      string;
    keyType:                    string;
    curve:                      string;
    value:                      string;
}


/** A charging station operator */
export interface IChargingStationOperator
{

    "@id":                      string;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    name?:                      chargyLib.I18NString                         | undefined;
    description?:               chargyLib.I18NString                         | undefined;

    subCSOIds?:                 Array<string>                                | undefined;
    contact:                    IContact;
    support:                    ISupport;
    privacy:                    IPrivacyContact;
    geoLocation?:               IGeoLocation                                 | undefined;

    /** URLs to images / logos */
    imageURLs?:                 string[]                                     | undefined;

    chargingPools?:             Array<IChargingPool>                         | undefined;
    chargingStations?:          Array<IChargingStation>                      | undefined;
    EVSEs?:                     Array<IEVSE>                                 | undefined;

    chargingTariffs?:           Array<IChargingTariff>                       | undefined;
    parkingTariffs?:            Array<IParkingTariff>                        | undefined;

    publicKeys?:                Array<IPublicKey>                            | undefined;

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


/** The document signature shape consumed by verifyDocumentSignatures. */
export interface IDocumentSignature extends ISignature {
    keyId:                      string;
    algorithm:                  string;
    encodings:                  Array<string>;
    value:                      string;
    signedData?: {
        encodings?:             Array<string>;
        excludedProperties?:    Array<string>;
    };
}

export interface ISignatureRS extends ISignature
{
    r:                            string;
    s:                            string;
}


/** A charging pool */
export interface IChargingPool
{

    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    address?:                     IAddress                                     | undefined;
    geoLocation?:                 IGeoLocation                                 | undefined;

    publicKeys?:                  Array<IPublicKey>                            | undefined;


    // Internal references
    chargingStationOperatorId?:   string                                       | undefined;
    chargingStationOperator?:     IChargingStationOperator                     | undefined;
    chargingPoolId?:              string                                       | undefined;
    chargingPool?:                IChargingPool                                | undefined;
    chargingStationIds?:          Array<string>                                | undefined;
    chargingStations?:            Array<IChargingStation>                      | undefined;
    chargingTariffIds?:           Array<string>                                | undefined;
    chargingTariffs?:             Array<IChargingTariff>                       | undefined;

}


/** A local controller within a charging pool controlling multiple
 *  charging stations for e.g. load balancing.
 *  Can have its own energy meters e.g. at the grid connection point.
 */
export interface ILocalController
{

    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    manufacturer?:                IManufacturer                                | undefined;
    model?:                       IDeviceModel                                 | undefined;
    hardware?:                    IHardware                                    | undefined;
    firmware?:                    IFirmware                                    | undefined;
    legalCompliance?:             ILegalCompliance                             | undefined;

    /** URLs to images / logos */
    imageURLs?:                   string[]                                     | undefined;

    energyMeterIds?:              Array<string>                                | undefined;
    energyMeters?:                Array<IEnergyMeter>                          | undefined;
    temperaturSensorIds?:         Array<string>                                | undefined;
    temperaturSensors?:           Array<ITemperatureSensor>                    | undefined;

    publicKeys?:                  Array<IPublicKey>                            | undefined;


    // Internal references
    chargingStationOperatorId?:   string                                       | undefined;
    chargingStationOperator?:     IChargingStationOperator                     | undefined;
    chargingPoolId?:              string                                       | undefined;
    chargingPool?:                IChargingPool                                | undefined;

}


/** A charging station */
export interface IChargingStation
{

    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    manufacturer?:                IManufacturer                                | undefined;
    model?:                       IDeviceModel                                 | undefined;
    hardware?:                    IHardware                                    | undefined;
    firmware?:                    IFirmware                                    | undefined;
    legalCompliance?:             ILegalCompliance                             | undefined;

    /** The address of the charging station, when different from the charging pool */
    address?:                     IAddress                                     | undefined;

    /** The geographic position of the charging station, when different from the charging pool */
    geoLocation?:                 IGeoLocation                                 | undefined;

    /** URLs to images / logos */
    imageURLs?:                   string[]                                     | undefined;


    EVSEIds?:                     Array<string>                                | undefined;
    EVSEs?:                       Array<IEVSE>                                 | undefined;
    energyMeterIds?:              Array<string>                                | undefined;
    energyMeters?:                Array<IEnergyMeter>                          | undefined;
    chargingTariffIds?:           Array<string>                                | undefined;
    chargingTariffs?:             Array<IChargingTariff>                       | undefined;
    temperaturSensorIds?:         Array<string>                                | undefined;
    temperaturSensors?:           Array<ITemperatureSensor>                    | undefined;

    publicKeys?:                  Array<IPublicKey>                            | undefined;


    // Internal references
    chargingStationOperatorId?:   string                                       | undefined;
    chargingStationOperator?:     IChargingStationOperator                     | undefined;
    chargingPoolId?:              string                                       | undefined;
    chargingPool?:                IChargingPool                                | undefined;

}


/** A energy circuit within a charging station */
export interface IEVSE
{

    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    /** The power type, e.g. "AC" or "DC" */
    powerType?:                   PowerType                                    | undefined;

    /** The maximum electrical power as metrological value with unit, e.g. "22 kW" */
    maxPower?:                    Watt                                         | undefined;

    connectorIds?:                Array<string>                                | undefined;
    connectors?:                  Array<IConnector>                            | undefined;
    energyMeterIds?:              Array<string>                                | undefined;
    energyMeters?:                Array<IEnergyMeter>                          | undefined;
    chargingTariffIds?:           Array<string>                                | undefined;
    chargingTariffs?:             Array<IChargingTariff>                       | undefined;
    temperaturSensorIds?:         Array<string>                                | undefined;
    temperaturSensors?:           Array<ITemperatureSensor>                    | undefined;

    publicKeys?:                  Array<IPublicKey>                            | undefined;


    // Internal references
    chargingStationOperatorId?:   string                                       | undefined;
    chargingStationOperator?:     IChargingStationOperator                     | undefined;
    chargingPoolId?:              string                                       | undefined;
    chargingPool?:                IChargingPool                                | undefined;
    chargingStationId?:           string                                       | undefined;
    chargingStation?:             IChargingStation                             | undefined;

}


/** A engery meter */
export interface IEnergyMeter
{

    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    /** URLs to images / logos */
    imageURLs?:                   string[];

    manufacturer?:                IManufacturer                                | undefined;
    model?:                       IDeviceModel                                 | undefined;
    firmware?:                    IFirmware                                    | undefined;
    hardware?:                    IHardware                                    | undefined;
    legalCompliance?:             ILegalCompliance                             | undefined;

    /** The power type, e.g. "AC" or "DC" */
    powerType?:                   PowerType                                    | undefined;

    temperaturSensorIds?:         Array<string>                                | undefined;
    temperaturSensors?:           Array<ITemperatureSensor>                    | undefined;

    signatureInfos?:              ISignatureInfos                              | undefined;
    signatureFormat?:             string                                       | undefined;
    publicKeys?:                  Array<IPublicKey>                            | undefined;


    // Internal references
    chargingPoolId?:              string                                       | undefined;
    chargingPool?:                IChargingPool                                | undefined;
    chargingStationId?:           string                                       | undefined;
    chargingStation?:             IChargingStation                             | undefined;
    EVSEId?:                      string                                       | undefined;
    EVSE?:                        IEVSE                                        | undefined;
    cableId?:                     string                                       | undefined;
    cable?:                       ICable                                       | undefined;

}


/** A charging connector */
export interface IConnector {

    /** The internal id of the connector, e.g. used by OCPI */
    "@id"?:                       string                                       | undefined;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;

    /** The visible label of the connector */
    visibleLabel?:                string                                       | undefined;

    standard?:                    string                                       | undefined;
    format?:                      string                                       | undefined;
    /** Legacy connector designation used by existing importers. */
    type?:                        string                                       | undefined;
    /** Retain provider-specific power-type names on legacy connectors. */
    powerType?:                   string                                       | undefined;

    /** The metrological power with unit, e.g. "22 kW" */
    maxPower?:                    Watt;

    temperaturSensors?:           Array<ITemperatureSensor>                    | undefined;
    cable?:                       ICable                                       | undefined;

}

export function isConnector(data: unknown): data is IConnector {

    if (!chargyLib.isObject(data))
        return false;

    return [ "standard", "format", "powerType", "maxPower" ].
               every(key => data[key] === undefined || typeof data[key] === "string");

}


/** A charging cable, maybe with a plug full of (ISO 15118-20) electronics */
export interface ICable {

    "@id"?:                       string                                       | undefined;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    /** URLs to images / logos */
    imageURLs?:                   string[];

    manufacturer?:                IManufacturer                                | undefined;
    model?:                       IDeviceModel                                 | undefined;
    firmware?:                    IFirmware                                    | undefined;
    hardware?:                    IHardware                                    | undefined;
    legalCompliance?:             ILegalCompliance                             | undefined;

    /** Quantity text for native documents; numeric metres from legacy importers. */
    length?:                      Meter | number                               | undefined;
    /** Quantity text, or the unmodified magnitude of a foreign import format. */
    resistance?:                  Ohm | number                                 | undefined;
    /** Unit accompanying a legacy numeric resistance; foreign formats retain their spelling. */
    resistanceUnit?:              UnitSymbol                                   | undefined;
    lossCompensation?:            string                                       | undefined;
    lossCompensationId?:          string                                       | undefined;

    temperaturSensors?:           Array<ITemperatureSensor>                    | undefined;

}


/** Native quantity-text cable profile, without a second unit field. */
export interface IMetrologicalCable extends ICable {
    length?:         Meter | undefined;
    resistance?:     Ohm   | undefined;
    resistanceUnit?: never;
}


/** A temperature sensor */
export interface ITemperatureSensor {

    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:                 chargyLib.I18NString                         | undefined;

    /** URLs to images / logos */
    imageURLs?:                   string[];

    manufacturer?:                IManufacturer                                | undefined;
    model?:                       IDeviceModel                                 | undefined;
    firmware?:                    IFirmware                                    | undefined;
    hardware?:                    IHardware                                    | undefined;
    legalCompliance?:             ILegalCompliance                             | undefined;

    chargingStationId?:           string                                       | undefined;
    chargingStation?:             IChargingStation                             | undefined;
    EVSEId?:                      string                                       | undefined;
    EVSE?:                        IEVSE                                        | undefined;
    cableId?:                     string                                       | undefined;
    cable?:                       ICable                                       | undefined;

    signatureInfos?:              ISignatureInfos                              | undefined;
    signatureFormat?:             string                                       | undefined;
    publicKeys?:                  Array<IPublicKey>                            | undefined;

}



export interface IConformity {
    certificateId:              string;
    url?:                       string;
    notBefore:                  Timestamp;
    notAfter:                   Timestamp;
    officialSoftware?:          Array<ITransparencySoftware>;  // The transparency software that is officially part of the charging station.
    compatibleSoftware?:        Array<ITransparencySoftware>;  // Other transparency softwares, that can verify the transparency record, but are not officially part of the charging station.
    freeText:                   string;
}

export interface ICalibration {
    certificateId:              string;
    url?:                       string;
    notBefore:                  Timestamp;
    notAfter:                   Timestamp;
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
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    description:                chargyLib.I18NString;
    chargingTariffs:            Array<IChargingTariff>;
    publicKeys?:                Array<IPublicKey>;
}

export interface ITaxes
{
    "@id":                      string;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:               chargyLib.I18NString;
    percentage:                 number;
}

export interface IMediationService
{
    "@id":                      string;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    description:                chargyLib.I18NString;
    publicKeys?:                Array<IPublicKey>;
}



export interface IChargingProduct
{
    "@id":                      string;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
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
    begin:                      Timestamp;
    end?:                       Timestamp;
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
    timestamp?:                 Timestamp;
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
    secp521r1   = "secp521r1"
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
    code?:       string;   // Stable, language-neutral identifier (the i18n key) the GUI can branch on.
    details?:    string;   // Optional raw technical detail (e.g. an exception message); not localized.
}

export function CreateError(message:  chargyLib.I18NString,
                            level:    ErrorLevel = ErrorLevel.high,
                            code?:    string,
                            details?: string): IError {

    const error: IError = {
        level:   level,
        message: message
    };

    if (code !== undefined)
        error.code = code;

    if (details !== undefined)
        error.details = details;

    return error;

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
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    city:                       string                                       | undefined;
    street?:                    string                                       | undefined;
    houseNumber?:               string                                       | undefined;
    floorLevel?:                string                                       | undefined;
    postalCode:                 string                                       | undefined;
    country:                    string                                       | undefined;
    comment?:                   chargyLib.I18NString                         | undefined;
}

export interface IGeoLocation {
    lat:                        Degrees;
    lng:                        Degrees;
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
    timestamp:      Timestamp,
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
    path?:          string                   | undefined,
    type?:          string                   | undefined,
    data?:          ArrayBuffer | Uint8Array | undefined,
    info?:          string                   | undefined,
    error?:         string                   | undefined,
    exception?:     unknown
}

export interface IChargingPeriod
{
    startTimestamp:                 Timestamp,
    stopTimestamp?:                 Timestamp,
    endTimestamp?:                  Timestamp,
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
    start_time?:                LocalTime             | undefined,
    end_time?:                  LocalTime             | undefined,
    start_date?:                CalendarDate          | undefined,
    end_date?:                  CalendarDate          | undefined,
    min_kwh?:                   EnergyInKilowattHours | undefined,
    max_kwh?:                   EnergyInKilowattHours | undefined,
    min_power?:                 PowerInKilowatts      | undefined,
    max_power?:                 PowerInKilowatts      | undefined,
    min_duration?:              DurationSeconds       | undefined,
    max_duration?:              DurationSeconds       | undefined,
    day_of_week?:               Array<DayOfWeek>      | undefined
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
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    country_code?:              string,
    party_id?:                  string,
    shortName?:                 chargyLib.I18NString;
    summary?:                   chargyLib.I18NString;
    tariff_alt_url?:            string,
    currency?:                  string,
    taxes?:                     Array<ITaxes>;
    elements?:                  Array<IChargingTariffElement>

    //energy_mix?:                IEnergyMix,

    not_before?:                Timestamp,
    not_after?:                 Timestamp,
    created?:                   Timestamp,
    last_updated?:              Timestamp,

    signatures?:                Array<ISignatureRS>

}

export interface IParkingTariff {

    "@id":                      string;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    country_code?:              string,
    party_id?:                  string,
    description?:               chargyLib.I18NString;
    tariff_alt_text?:           Array<IDisplayText>,
    tariff_alt_url?:            string,
    currency?:                  string,
    taxes?:                     Array<ITaxes>;
    elements?:                  Array<IChargingTariffElement>

    not_before?:                Timestamp,
    not_after?:                 Timestamp,
    created?:                   Timestamp,
    last_updated?:              Timestamp,

    signatures?:                Array<ISignatureRS>

}

export type ShowPKIDetailsFunction = (pkiData: unknown) => void;

export type IssueReportPayload = {
    timestamp:                  Timestamp;
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
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    name:                       string                                       | undefined;
    url?:                       string                                       | undefined;
    description?:               chargyLib.I18NString;
    contact?:                   IContact;
    support?:                   ISupport;
    privacyContact?:            IPrivacyContact;
    geoLocation?:               IGeoLocation;
    publicKeys?:                Array<IPublicKey>;
}

export interface IDeviceModel {
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    name?:                      string                                       | undefined;
    url?:                       string                                       | undefined;
}

export interface IHardware {
    revision?:                  string                                       | undefined;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    url?:                       string                                       | undefined;
    serialNumber?:              string                                       | undefined;
}

export interface IFirmware {
    version?:                   string                                       | undefined;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    releaseDate?:               string                                       | undefined;
    url?:                       string                                       | undefined;
    components?:                Array<IFirmwareComponent>;
    checksum?:                  string                                       | undefined;
    description?:               chargyLib.I18NString                         | undefined;
}

export interface IFirmwareComponent {
    "@id":                      string                                       | undefined;
    "@context"?:                LinkedDataContext | Array<LinkedDataContext> | undefined;
    description?:               chargyLib.I18NString                         | undefined;
    version:                    string                                       | undefined;
    releaseDate?:               string                                       | undefined;
    checksum:                   string                                       | undefined;
    url?:                       string                                       | undefined;
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


export interface ITimeSource {

    "@context"?:           LinkedDataContext | Array<LinkedDataContext> | undefined;
    isLegalTime?:          boolean                                      | undefined,
    authority?:            string                                       | undefined,
    accuracy?:             Second                                       | undefined, // Absolute time-error bound, e.g. "2 ms"; legacy text may use "+-2 ms".
    stratum?:              number                                       | undefined, // 2
    syncInterval?:         ISO8601Duration                              | undefined, // "PT1H"
    lastSynchronization?:  Timestamp                                    | undefined, // "2026-08-28T11:14:27Z"
    minServers?:           number                                       | undefined, // 2
    autoConfURL?:          string                                       | undefined, // "https://time.ptb.de/files/ptb-ntp-services.json"

    servers:               Array<ITimeServer>; 

}

export interface ITimeServer {

    "@context"?:           LinkedDataContext | Array<LinkedDataContext> | undefined;
    server:                URL, // "nts://ptbtime1.ptb.de"
    //ToDo: What when NTS-KE server != NTP+NTS server?
    priority?:             number                                       | undefined,
    weight?:               number                                       | undefined

}

export interface ILegallyRelevantLogMessage
{
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    chargingSession?:             IChargingSession                             | undefined;
    timestamp:                    Timestamp;
    code?:                        string                                       | undefined;
    data?:                        chargyLib.JSONObject                         | undefined;
    text?:                        chargyLib.I18NString                         | undefined;
    signatures?:                  Array<ISignature|ISignatureRS>               | undefined;
}

export interface ISupportMessage
{
    "@id":                        string;
    "@context"?:                  LinkedDataContext | Array<LinkedDataContext> | undefined;
    chargingSession?:             IChargingSession                             | undefined;
    timestamp:                    Timestamp;
    text?:                        chargyLib.I18NString                         | undefined;
    data?:                        chargyLib.JSONObject                         | undefined;
    signatures?:                  Array<ISignature|ISignatureRS>               | undefined;
}


/** Time-based One-Time Password configuration
 *  see also: https://github.com/OpenChargingCloud/TOTP.TS
 *            https://www.npmjs.com/package/@open-charging-cloud/totp
 */
export interface TOTPConfig {
    sharedSecret:                 string                         | undefined;
    timeStep?:                    DurationSeconds                | undefined;
    validityTime?:                DurationSeconds                | undefined;
    totpLength?:                  number                         | undefined;
    alphabet?:                    string                         | undefined;
    timestamp?:                   Timestamp                      | undefined;
    hashAlgorithm?:               string                         | undefined;
}

export function isTOTPConfig(data: unknown): data is TOTPConfig {
    return chargyLib.isObject(data) &&
                                                   typeof data["sharedSecret"]  === "string"  &&
           (data["timeStep"]      === undefined || typeof data["timeStep"]      === "number") &&
           (data["validityTime"]  === undefined || typeof data["validityTime"]  === "number") &&
           (data["totpLength"]    === undefined || typeof data["totpLength"]    === "number") &&
           (data["alphabet"]      === undefined || typeof data["alphabet"]      === "string") &&
           (data["timestamp"]     === undefined || typeof data["timestamp"]     === "string") &&
           (data["hashAlgorithm"] === undefined || typeof data["hashAlgorithm"] === "string");
}


export type URL = string;

export interface IURL {
    url:                          URL;
    priority?:                    number | undefined;
    weight?:                      number | undefined;
}

export function isURL(data: unknown): data is IURL|URL {

    if (typeof data === "string")
        return data.trim() !== "";

    return chargyLib.isObject(data) &&
                                              typeof data["url"]      === "string"  &&
           (data["priority"] === undefined || typeof data["priority"] === "number") &&
           (data["weight"]   === undefined || typeof data["weight"]   === "number");

}


export type LinkedDataContext = string;
