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

import { Buffer }                           from 'buffer';
import { fileTypeFromBuffer }               from 'file-type';
import { Alfen, AlfenCrypt01 }              from './Alfen'
import { BSMCrypt01 }                       from './BSMCrypt01'
import { ChargeIT }                         from './chargeIT'
import { ChargePoint, ChargePointCrypt01 }  from './chargePoint'
import { EDL40Crypt01 }                     from './EDL40'
import { EMHCrypt01 }                       from './EMHCrypt01'
import { GDFCrypt01 }                       from './GDFCrypt01'
import { Mennekes, MennekesCrypt01 }        from './Mennekes'
import { OCMF, OCMFv1_x }                   from './OCMF'
import { PCDF, PCDFCrypt01, isPCDFText }    from './PCDF'
import { PTB }                              from './PTBContainer'
import { SAFEXML }                          from './SAFE_XML'
import { XMLContainer }                     from './XMLContainer'
import { OCPI }                             from './OCPI'
import * as chargyInterfaces                from './interfaces/chargyInterfaces'
import * as chargeTransparencyRecord        from './interfaces/IChargeTransparencyRecord'
import * as chargeTransparencyLiveLink      from './interfaces/IChargeTransparencyLiveLink'
import * as publicKeyInfo                   from './interfaces/IPublicKeyInfo'
import * as chargyLib                       from './interfaces/chargyLib'
import { readQRCodeTextFromImage }          from './qrCodeReader'
import { importPdfJs }                      from '#pdfjs-runtime'
import defaultValidationRules               from '../validationRules.json'
import seekBzip                             from 'seek-bzip';
import type moment                          from 'moment';

type DERPublicKey = {
    oids:      [number[], number[]];
    publicKey: {
        data:  ArrayBuffer | Uint8Array;
    };
};

type Asn1Builder = {
    bitstr(): Asn1Builder;
    int(): Asn1Builder;
    key(name: string): Asn1Builder;
    obj(...items: unknown[]): Asn1Builder;
    objid(): Asn1Builder;
    seq(): Asn1Builder;
    seqof(schema: unknown): Asn1Builder;
};

type Asn1Schema = {
    decode(data: Uint8Array | ArrayBuffer, encoding: string): unknown;
};

type PdfAttachment = {
    filename: string;
    content:  ArrayBuffer | Uint8Array;
};

function isPdfAttachment(value: unknown): value is PdfAttachment {

    if (!chargyLib.isMandatoryJSONObject(value))
        return false;

    return typeof value["filename"] === "string" &&
           (value["content"] instanceof ArrayBuffer || ArrayBuffer.isView(value["content"]));

}

type Asn1Module = {
    define: (name: string, body: (this: Asn1Builder) => void) => Asn1Schema;
};

type Base32Decode = (input: string, variant: "RFC3548" | "RFC4648" | "RFC4648-HEX" | "Crockford") => ArrayBuffer;

export type EllipticKeyPair = {
    verify(hash: string, signature: unknown): boolean;
};

export type EllipticCurve = {
    keyFromPublic(publicKey: string | { x: string; y: string }, encoding: string): EllipticKeyPair;
};

type EllipticModule = {
    ec: new (curve: string) => EllipticCurve;
};

type MomentModule = typeof moment;

export class Chargy {

    //#region Data

    public  readonly i18n:             chargyLib.I18NDictionary;
    public           uiLanguages:      chargyLib.LanguageStrings;
    public  readonly elliptic:         EllipticModule;
    public  readonly moment:           MomentModule;
    public  readonly asn1:             Asn1Module;
    public  readonly base32Decode:     Base32Decode;
    public  readonly showPKIDetails:   chargyInterfaces.ShowPKIDetailsFunction;
    public  readonly validationRules:  chargyInterfaces.IValidationRules;

    private chargingStationOperators  = new Array<chargyInterfaces.IChargingStationOperator>();
    private chargingPools             = new Array<chargyInterfaces.IChargingPool>();
    private chargingStations          = new Array<chargyInterfaces.IChargingStation>();
    private EVSEs                     = new Array<chargyInterfaces.IEVSE>();
    private meters                    = new Array<chargyInterfaces.IEnergyMeter>();
    private chargingSessions          = new Array<chargeTransparencyRecord.IChargingSession>();

    public  currentCTR                = {} as chargeTransparencyRecord.IChargeTransparencyRecord;
    public  internalCTR               = {} as chargeTransparencyRecord.IChargeTransparencyRecord;

    //#endregion

    constructor(i18n:             chargyLib.I18NDictionary,
                UILanguages:      chargyLib.LanguageStrings,
                elliptic:         EllipticModule,
                moment:           MomentModule,
                asn1:             Asn1Module,
                base32Decode:     Base32Decode,
                ShowPKIDetails:   chargyInterfaces.ShowPKIDetailsFunction,
                validationRules:  chargyInterfaces.IValidationRules = defaultValidationRules as chargyInterfaces.IValidationRules) {

        this.i18n             = i18n;
        this.uiLanguages      = this.NormalizeUILanguages(UILanguages);
        this.elliptic         = elliptic;
        this.moment           = moment;
        this.asn1             = asn1;
        this.base32Decode     = base32Decode;
        this.showPKIDetails   = ShowPKIDetails;
        this.validationRules  = validationRules;

    }


    private fileNameWithoutExtension(fileName: string): string {

        const lastSeparator = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
        const lastDot       = fileName.lastIndexOf('.');

        if (lastDot > lastSeparator)
            return fileName.substring(0, lastDot);

        return fileName;

    }

    //#region Public key methods...

        private PublicKeyIdFromFileName(fileName: string): string {

        return (fileName.includes('.')
                    ? fileName.substring(0, fileName.indexOf('.'))
                    : fileName).replace(/[-_]?public[-_]?key/i, "");

    }

    private TryToParseDERPublicKey(keyId:            string,
                                   publicKeyBuffer:  Buffer): publicKeyInfo.IPublicKeyLookup & { "@id": string, "@context": string } {

        // https://lapo.it/asn1js/ for a visual check...
        // https://github.com/indutny/asn1.js
        const ASN1_OIDs      = this.asn1.define('OIDs', function(this: Asn1Builder) {
            this.key('oid').objid()
        });

        const ASN1_PublicKey = this.asn1.define('PublicKey', function(this: Asn1Builder) {
            this.seq().obj(
                this.key('oids').seqof(ASN1_OIDs),
                this.key('publicKey').bitstr()
            );
        });

        const publicKeyDER   = ASN1_PublicKey.decode(publicKeyBuffer, 'der') as DERPublicKey;

        const KeyType_OID    = publicKeyDER.oids[0].join(".");
        let   KeyType        = "unknown";
        switch (KeyType_OID)
        {
            case "1.2.840.10045.2.1":
                KeyType      = "ecPublicKey";   // ANSI X9.62 public key type
                break;
        }

        const Curve_OID      = publicKeyDER.oids[1].join(".");
        let   Curve          = "unknown";
        switch (Curve_OID)
        {

            // Koblitz 224-bit curve
            case "1.3.132.0.32":
                Curve        = "secp224k1";
                break;

            // NIST/ANSI X9.62 named 256-bit elliptic curve used with SHA256
            case "1.2.840.10045.3.1.7":
                Curve        = "secp256r1";    // also: ANSI prime256v1, NIST P-256
                break;

            // NIST/ANSI X9.62 named 384-bit elliptic curve used with SHA384
            case "1.3.132.0.34":
                Curve        = "secp384r1";    // also: ANSI prime384v1, NIST P-384
                break;

            // NIST/ANSI X9.62 named 521-bit elliptic curve used with SHA512
            case "1.3.132.0.35":
                Curve        = "secp521r1";    // also: ANSI prime521v1, NIST P-521
                break;

        }

        return {
            "@id":       keyId,
            "@context":  "https://open.charging.cloud/contexts/CTR+json",
            publicKeys: [
                {
                    "@id":            keyId,
                    "@context":       "https://open.charging.cloud/contexts/publicKey+json",
                    "subject":        keyId,
                    type: {
                        oid:          KeyType_OID,
                        name:         KeyType
                    },
                    algorithm: {
                        oid:          Curve_OID,
                        name:         Curve
                    },
                    value:      chargyLib.buf2hex(publicKeyDER.publicKey.data),
                    certainty:  0
                }
            ]
        };

    }

    private IsHexEncodedPublicKeyFile(fileName:     string,
                                      textContent?: string): boolean {

        if (textContent == null)
            return false;

        const fileNameLower = fileName.toLowerCase();
        const publicKeyFile = fileNameLower.includes("publickey") ||
                              fileNameLower.includes("public-key") ||
                              fileNameLower.includes("public_key");
        const publicKeyHEX  = textContent.replace(/\s+/g, "");

        return publicKeyFile                    &&
               publicKeyHEX.length >= 80       &&
               publicKeyHEX.length % 2 === 0   &&
               publicKeyHEX.startsWith("30")   &&
               /^[0-9a-fA-F]+$/.test(publicKeyHEX);

    }

    private TryToGetDERPublicKeyHEX(fileName:     string,
                                    textContent?: string): string|undefined {

        if (textContent == null)
            return undefined;

        if (textContent.startsWith("-----BEGIN PUBLIC KEY-----") &&
            textContent.endsWith  ("-----END PUBLIC KEY-----"))
        {
            const publicKeyPEM = textContent.replace("-----BEGIN PUBLIC KEY-----", "").
                                             replace("-----END PUBLIC KEY-----",   "").
                                             split  ('\n').
                                             map    ((line) => line.trim()).
                                             filter ((line) => line !== '' && !line.startsWith('#')).
                                             join   ("");

            return chargyLib.buf2hex(Buffer.from(publicKeyPEM, 'base64'));
        }

        if (this.IsHexEncodedPublicKeyFile(fileName, textContent))
            return textContent.replace(/\s+/g, "");

        return undefined;

    }

    //#endregion

    //#region QR code image files...

    private normalizeMIMEType(mimeType?: string): string | undefined {

        return mimeType?.
                   split(";")[0]?.
                   trim().
                   toLowerCase();

    }

    private getQRCodeImageMIMETypeFromFileName(fileName: string): string | undefined {

        fileName = fileName.toLowerCase();

        if (fileName.endsWith(".png"))
            return "image/png";

        if (fileName.endsWith(".jpeg"))
            return "image/jpeg";

        if (fileName.endsWith(".jpg"))
            return "image/jpg";

        if (fileName.endsWith(".gif"))
            return "image/gif";

        if (fileName.endsWith(".webp"))
            return "image/webp";

        if (fileName.endsWith(".bmp"))
            return "image/bmp";

        if (fileName.endsWith(".svg"))
            return "image/svg+xml";

        return undefined;

    }

    private getQRCodeImageMIMEType(fileInfo:   chargyInterfaces.IFileInfo,
                                   mimeType?:  string): string | undefined {

        const detectedMIMEType  = this.normalizeMIMEType(mimeType);
        const declaredMIMEType  = this.normalizeMIMEType(fileInfo.type);
        const fileNameMIMEType  = this.getQRCodeImageMIMETypeFromFileName(fileInfo.name);

        if (this.isSupportedQRCodeImageFileType(detectedMIMEType))
            return detectedMIMEType;

        if (this.isSupportedQRCodeImageFileType(declaredMIMEType))
            return declaredMIMEType;

        if (fileNameMIMEType !== undefined)
            return fileNameMIMEType;

        return detectedMIMEType ?? declaredMIMEType;

    }

    private isSupportedQRCodeImageFileType(MIMEType?: string): boolean
    {

        switch (MIMEType)
        {

            case undefined:
                return false;

            case "image/png":
            case "image/jpeg":
            case "image/jpg":
            case "image/gif":
            case "image/webp":
            case "image/bmp":
            case "image/svg":
            case "image/svg+xml":
                return true;

        }

        return false;

    }

    private async expandQRCodeImageFiles(FileInfos: Array<chargyInterfaces.IFileInfo>)

        : Promise<Array<chargyInterfaces.IFileInfo>>

    {

        const expandedFileInfos = new Array<chargyInterfaces.IFileInfo>();

        for (const fileInfo of FileInfos)
        {

            const mimeType = this.getQRCodeImageMIMEType(fileInfo);

            if (fileInfo.data !=  null &&
                this.isSupportedQRCodeImageFileType(mimeType))
            {

                const qrText = await readQRCodeTextFromImage(
                                         fileInfo.data,
                                         mimeType
                                     );

                if (qrText != null)
                {

                    expandedFileInfos.push({
                        name:  this.textFileNameForQRCodeContent(fileInfo.name, qrText),
                        path:  fileInfo.path,
                        type:  "text/plain",
                        data:  new TextEncoder().encode(qrText),
                        info:  "Text extracted from QR code image"
                    });

                    continue;
                }

                expandedFileInfos.push({
                    name:       fileInfo.name,
                    path:       fileInfo.path,
                    type:       fileInfo.type,
                    data:       fileInfo.data,
                    exception:  "No QR code with charge transparency data found!"
                });

                continue;

            }

            expandedFileInfos.push(fileInfo);
        }

        return expandedFileInfos;

    }

    private textFileNameForQRCodeContent(fileName:  string,
                                         qrText:    string): string
    {

        const trimmedQRCodeText = qrText.trimStart();
        const baseFileName      = this.fileNameWithoutExtension(fileName);

        if (trimmedQRCodeText.startsWith("<?xml") || trimmedQRCodeText.startsWith("<"))
            return baseFileName + ".xml";

        if (trimmedQRCodeText.startsWith("{")     || trimmedQRCodeText.startsWith("["))
            return baseFileName + ".json";

        return baseFileName + ".txt";

    }

    //#endregion

    //#region i18n...

    public SetUILanguages(UILanguages: chargyLib.LanguageStrings): void {

        this.uiLanguages = this.NormalizeUILanguages(UILanguages);

    }


    private NormalizeUILanguages(UILanguages: chargyLib.LanguageStrings): chargyLib.LanguageStrings {

        const languages = new Array<chargyLib.LanguageString>();

        for (const language of UILanguages) {

            const normalized = language.trim();

            if (normalized.length > 0 &&
                !languages.includes(normalized))
            {
                languages.push(normalized);
            }

        }

        return languages.length > 0
                   ? languages
                   : [ "en" ];

    }


    private FindBestMultilanguageText(Text: chargyLib.I18NString): string | undefined {

        for (const language of this.uiLanguages) {

            const localLanguage = Text[language];

            if (localLanguage !== undefined)
                return localLanguage;

        }

        const english = Text["en"];
        if (english !== undefined)
            return english;

        return Object.values(Text).find(value => value !== undefined);

    }


    private CompleteMultilanguageText(Text:         chargyLib.I18NString | undefined,
                                      fallbackText: string): chargyLib.I18NString {

        const result: chargyLib.I18NString = {
            ...(Text ?? {})
        };

        const fallback = this.FindBestMultilanguageText(result) ?? fallbackText;

        for (const language of this.uiLanguages)
            result[language] ??= fallback;

        return result;

    }

    public GetLocalizedMessage(Text: string): string
    {

        const multiLanguage = this.i18n[Text];

        if (multiLanguage !== undefined)
        {

            const localizedMessage = this.FindBestMultilanguageText(multiLanguage);
            if (localizedMessage !== undefined)
                return localizedMessage;

        }

        return Text;

    }

    public GetMultilanguageText(Text: string): chargyLib.I18NString
    {

        const multiLanguage = this.i18n[Text];

        return this.CompleteMultilanguageText(multiLanguage, Text);

    }

    public GetLocalizedMessageWithParameter(Text:       string,
                                            Parameter:  string | number): string
    {

        const multiLanguage = this.i18n[Text];

        if (multiLanguage !== undefined)
        {

            const localizedMessage = this.FindBestMultilanguageText(multiLanguage);
            if (localizedMessage !== undefined)
                return localizedMessage.replace("%p", String(Parameter));

        }

        return Text.replace("%p", String(Parameter));

    }

    public GetMultilanguageTextWithParameter(Text:       string,
                                             Parameter:  string | number): chargyLib.I18NString
    {

        const multiLanguage = this.i18n[Text];

        const parameterizedText: chargyLib.I18NString = {};

        if (multiLanguage !== undefined)
        {

            for (const [language, message] of Object.entries(multiLanguage)) {

                if (message !== undefined)
                    parameterizedText[language] = message.replace("%p", String(Parameter));

            }

        }

        return this.CompleteMultilanguageText(parameterizedText, Text.replace("%p", String(Parameter)));

    }

    public GetLocalizedText(data: chargyLib.I18NString|undefined): string|undefined {

        if (data == null)
            return undefined;

        return this.FindBestMultilanguageText(data);

    }

    //#endregion

    //#region GetDevices...

    public GetChargingPool: chargyInterfaces.GetChargingPoolFunc = (Id: string) => {

        for (const chargingPool of this.chargingPools)
        {
            if (chargingPool["@id"] === Id)
                return chargingPool;
        }

        return null;

    }

    public GetChargingStation: chargyInterfaces.GetChargingStationFunc = (Id: string) => {

        for (const chargingStation of this.chargingStations)
        {
            if (chargingStation["@id"] === Id)
                return chargingStation;
        }

        return null;

    }

    public GetEVSE: chargyInterfaces.GetEVSEFunc = (Id: string) => {

        for (const evse of this.EVSEs)
        {
            if (evse["@id"] === Id)
                return evse;
        }

        return null;

    }

    public GetMeter: chargyInterfaces.GetMeterFunc = (Id: string) => {

        for (const meter of this.meters)
        {
            if (meter["@id"] === Id)
                return meter;
        }

        return null;

    }

    //#endregion


    //#region CheckMeterPublicKeySignature(...)

    public async CheckMeterPublicKeySignature(chargingStation:  chargyInterfaces.IChargingStation | null | undefined,
                                              evse:             chargyInterfaces.IEVSE            | null | undefined,
                                              meter:            chargyInterfaces.IEnergyMeter     | null | undefined,
                                              publicKey:        publicKeyInfo.   IPublicKey       | null | undefined,
                                              signature:        unknown): Promise<string>
    {

        // For now: Do not enforce this feature!
        if (chargingStation == null || evse == null || meter == null || publicKey == null || signature == null)
            return "";// "<i class=\"fas fa-exclamation-circle\"></i> Unbekannter Public Key!";

        // Some of the signed legacy property names (softwareVersion, sockets,
        // vendor, ...) are not part of the current interfaces, but must be
        // kept, as they are part of the signed data structure!
        const chargingStationView  = chargingStation as unknown as chargyLib.JSONObject;
        const evseView             = evse            as unknown as chargyLib.JSONObject;
        const meterView            = meter           as unknown as chargyLib.JSONObject;
        const signatureView        = chargyLib.asJSONObject(signature) ?? {};

        try
        {

            const toCheck = {

                "@id":                  chargingStation["@id"],
                "description":          chargingStation.description,
                "geoLocation":          chargingStation.geoLocation,
                "address":              chargingStation.address,
                "softwareVersion":      chargingStationView["softwareVersion"],

                "EVSE": {
                    "@id":                      evse["@id"],
                    "description":              evse.description,
                    "sockets":                  evseView["sockets"],

                    "energyMeter": {
                        "@id":                      meter["@id"],
                        "vendor":                   meterView["vendor"],
                        "model":                    meter.model,
                        "firmware": {
                            "version":              meter.firmware?.version
                        },
                        "signatureFormat":          meter.signatureFormat,

                        "publicKey": {
                            "algorithm":                publicKey.algorithm,
                            "format":                   publicKey.format,
                            "value":                    publicKey.value,

                            "signature": {
                                "signer":                   signatureView["signer"],
                                "timestamp":                signatureView["timestamp"],
                                "comment":                  signatureView["comment"],
                                "algorithm":                signatureView["algorithm"],
                                "format":                   signatureView["format"]
                            }

                        }

                    }

                }

            };

            //ToDo: Checking the timestamp might be usefull!

            const sha256value = await chargyLib.sha256(JSON.stringify(toCheck));

            const result      = new this.elliptic.ec('secp256r1').
                                        keyFromPublic(chargyLib.asString(signatureView["publicKey"]) ?? "", 'hex').
                                        verify       (sha256value,
                                                      signatureView["signature"]);

            if (result)
                return "<i class=\"fas fa-check-circle\"></i>" + String(signatureView["signer"]);


        }
        catch
        {
            console.log("Error verifying public key signature!");
        }

        return "<i class=\"fas fa-times-circle\"></i>" + String(signatureView["signer"]);

    }

    //#endregion

    //#region (private) decompressFiles(FileInfos)

    private async decompressFiles(FileInfos: Array<chargyInterfaces.IFileInfo>): Promise<Array<chargyInterfaces.IFileInfo>> {

        //#region Initial checks

        if (FileInfos.length == 0)
            return FileInfos;

        //#endregion

        let archiveFound:      boolean;
        let expandedFileInfos: chargyInterfaces.IFileInfo[];

        do
        {

            archiveFound      = false;
            expandedFileInfos = new Array<chargyInterfaces.IFileInfo>();

            for (const FileInfo of FileInfos)
            {

                if (FileInfo.data != null && FileInfo.data.byteLength > 0)
                {

                    try
                    {

                        const filetype  = await fileTypeFromBuffer   (FileInfo.data);
                        const mimeType  = this.getQRCodeImageMIMEType(FileInfo, filetype?.mime);

                        if (this.isSupportedQRCodeImageFileType(mimeType))
                        {
                            expandedFileInfos.push({
                                                    name:  FileInfo.name,
                                                    data:  FileInfo.data,
                                                    type:  FileInfo.type ?? mimeType,
                                                    info:  "QR code image file"
                                                });
                            continue;
                        }

                        else if (FileInfo.name.endsWith(".chargy"))
                        {
                            expandedFileInfos.push({
                                                    name:       FileInfo.name,
                                                    data:       FileInfo.data,
                                                    info:       ".chargy file"
                                                });
                            continue;
                        }

                        else if (mimeType === "text/xml" ||
                                 mimeType === "application/xml")
                        {
                            expandedFileInfos.push({
                                                  name:  FileInfo.name,
                                                  data:  FileInfo.data,
                                                  info:  "XML file"
                                              });
                            continue;
                        }

                        else if (mimeType === "text/json" ||
                                 mimeType === "application/json")
                        {
                            expandedFileInfos.push({
                                                  name:  FileInfo.name,
                                                  data:  FileInfo.data,
                                                  info:  "JSON file"
                                              });
                            continue;
                        }

                        else if (mimeType === "application/zip"     ||
                                 mimeType === "application/x-bzip2" ||
                                 mimeType === "application/gzip"    ||
                                 mimeType === "application/x-tar")
                        {

                            try
                            {

                                const compressedFiles = await this.extractArchive(
                                                                  FileInfo.name,
                                                                  FileInfo.data,
                                                                  mimeType
                                                              );

                                if (compressedFiles.length == 0)
                                    continue;

                                archiveFound = true;

                                //#region A single compressed file without a path/filename, e.g. within bz2

                                if (compressedFiles.length == 1)// && compressedFiles[0].path == null)
                                {
                                    expandedFileInfos.push({
                                                          name:  FileInfo.name.substring(0, FileInfo.name.lastIndexOf('.')),
                                                          data:  compressedFiles[0]?.data
                                                      });
                                    continue;
                                }

                                //#endregion

                                //#region A chargepoint compressed archive file

                                let CTRfile: chargyLib.JSONObject | null = null;
                                let dataFile       = "";
                                let signatureFile  = "";

                                if (compressedFiles.length >= 2)
                                {

                                    for (const file of compressedFiles)
                                    {
                                        if (file.type === "file")
                                        {
                                            switch (file.path)
                                            {

                                                case "secrrct":
                                                {
                                                    try
                                                    {
                                                        dataFile = new TextDecoder('utf-8').decode(file.data);
                                                    }
                                                    catch (exception)
                                                    {
                                                        console.debug("Invalid chargepoint 'secrrct' file: " + (exception instanceof Error ? exception.message : String(exception)));
                                                    }
                                                }
                                                break;

                                                case "secrrct.sign":
                                                {
                                                    try
                                                    {
                                                        signatureFile = chargyLib.buf2hex(file.data);
                                                    }
                                                    catch (exception)
                                                    {
                                                        console.debug("Invalid chargepoint 'secrrct.sign' file: " + (exception instanceof Error ? exception.message : String(exception)));
                                                    }
                                                }
                                                break;

                                            }
                                        }

                                    }

                                    if (dataFile.     length > 0 &&
                                        signatureFile.length > 0)
                                    {
                                        try
                                        {

                                            const parsedCTRFile: unknown = JSON.parse(dataFile);
                                            if (!chargyLib.isMandatoryJSONObject(parsedCTRFile))
                                                throw new Error("Invalid chargepoint 'secrrct' JSON file!");

                                            CTRfile           = parsedCTRFile;

                                            // Save the 'original' JSON with whitespaces for later signature verification!
                                            CTRfile["original"]  = btoa(dataFile);
                                            CTRfile["signature"] = signatureFile;

                                            expandedFileInfos.push({
                                                name: FileInfo.name,
                                                data: new TextEncoder().encode(JSON.stringify(CTRfile))
                                            });

                                        }
                                        catch (exception)
                                        {
                                            console.debug("Could not parse chargepoint 'secrrct' file: " + (exception instanceof Error ? exception.message : String(exception)));
                                        }
                                        continue;
                                    }

                                }

                                //#endregion

                                //#region Multiple files

                                for (const compressedFile of compressedFiles)
                                {
                                    if (compressedFile.type === "file")
                                    {
                                        expandedFileInfos.push({
                                            name: compressedFile.path.substring(compressedFile.path.lastIndexOf('/') + 1),// ?? FileInfo.name,
                                            data: compressedFile.data
                                        });
                                    }
                                }

                                //#endregion

                            }
                            catch (exception) {
                                console.log("Error decompressing files: " + (exception instanceof Error ? exception.message : String(exception)));
                            }

                            continue;

                        }

                        // expandedFileInfos.push({
                        //                       name:  FileInfo.name,
                        //                       data:  FileInfo.data
                        //                   });

                        expandedFileInfos.push({
                                              name:       FileInfo.name,
                                              data:       FileInfo.data,
                                              exception:  "Unknown file type!"
                                          });
                        continue;

                    }
                    catch (exception)
                    {
                        expandedFileInfos.push({
                                              name:       FileInfo.name,
                                              data:       FileInfo.data,
                                              exception:  exception
                                          });
                    }

                }

            }

            if (archiveFound)
                FileInfos = expandedFileInfos;

        }
        while (archiveFound);

        return expandedFileInfos;

    }

    private async extractArchive(fileName:  string,
                                 data:      ArrayBuffer | Uint8Array,
                                 mimeType:  string): Promise<Array<chargyInterfaces.TarInfo>> {

        const archiveData = this.toUint8Array(data);

        if (mimeType === "application/zip")
            return this.extractZipArchive(archiveData);

        if (mimeType === "application/x-tar")
            return this.extractTarArchive(archiveData);

        if (mimeType === "application/gzip") {
            const decompressed = await this.decompressStream(archiveData, "gzip");
            const tarFiles     = this.extractTarArchive(decompressed);

            return tarFiles.length > 0
                       ? tarFiles
                       : [{
                             data:  Buffer.from(decompressed),
                             mode:  0,
                             mtime: "",
                             path:  fileName.substring(0, fileName.lastIndexOf('.')),
                             type:  "file"
                         }];
        }

        if (mimeType === "application/x-bzip2") {
            const decompressed = this.toUint8Array(seekBzip.decode(Buffer.from(archiveData)));
            const tarFiles     = this.extractTarArchive(decompressed);

            return tarFiles.length > 0
                       ? tarFiles
                       : [{
                             data:  Buffer.from(decompressed),
                             mode:  0,
                             mtime: "",
                             path:  fileName.substring(0, fileName.lastIndexOf('.')),
                             type:  "file"
                         }];
        }

        return [];

    }

    private extractTarArchive(data: Uint8Array): Array<chargyInterfaces.TarInfo> {

        const files = new Array<chargyInterfaces.TarInfo>();

        for (let offset = 0; offset + 512 <= data.byteLength;) {

            const header = data.subarray(offset, offset + 512);

            if (header.every(byte => byte === 0))
                break;

            const name = this.readTarString(header, 0,   100);
            const size = this.readTarOctal (header, 124, 12);

            if (name.length === 0 || size < 0)
                break;

            const prefix    = this.readTarString(header, 345, 155);
            const path      = prefix.length > 0 ? prefix + "/" + name : name;
            const typeFlag  = String.fromCharCode(chargyLib.getArrayElement(header, 156, "Missing tar header type flag"));
            const dataStart = offset + 512;
            const dataEnd   = dataStart + size;

            if (dataEnd > data.byteLength)
                break;

            if (typeFlag !== "5")
                files.push({
                    data:  Buffer.from(data.subarray(dataStart, dataEnd)),
                    mode:  this.readTarOctal(header, 100, 8),
                    mtime: this.readTarOctal(header, 136, 12).toString(),
                    path,
                    type:  "file"
                });

            offset += 512 + Math.ceil(size / 512) * 512;

        }

        return files;

    }

    private async extractZipArchive(data: Uint8Array): Promise<Array<chargyInterfaces.TarInfo>> {

        const files = new Array<chargyInterfaces.TarInfo>();
        const view  = new DataView(data.buffer, data.byteOffset, data.byteLength);

        const endOfCentralDirectory = this.findZipEndOfCentralDirectory(data);

        if (endOfCentralDirectory < 0)
            return files;

        const entryCount             = view.getUint16(endOfCentralDirectory + 10, true);
        let centralDirectoryOffset   = view.getUint32(endOfCentralDirectory + 16, true);

        for (let index = 0; index < entryCount && centralDirectoryOffset + 46 <= data.byteLength; index++) {

            if (view.getUint32(centralDirectoryOffset, true) !== 0x02014b50)
                break;

            const compression        = view.getUint16(centralDirectoryOffset + 10, true);
            const compressedSize     = view.getUint32(centralDirectoryOffset + 20, true);
            const uncompressedSize   = view.getUint32(centralDirectoryOffset + 24, true);
            const fileNameLength     = view.getUint16(centralDirectoryOffset + 28, true);
            const extraLength        = view.getUint16(centralDirectoryOffset + 30, true);
            const commentLength      = view.getUint16(centralDirectoryOffset + 32, true);
            const localHeaderOffset  = view.getUint32(centralDirectoryOffset + 42, true);
            const pathStart          = centralDirectoryOffset + 46;
            const pathEnd            = pathStart + fileNameLength;

            if (pathEnd > data.byteLength ||
                localHeaderOffset + 30 > data.byteLength ||
                view.getUint32(localHeaderOffset, true) !== 0x04034b50)
                break;

            const localNameLength    = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLength   = view.getUint16(localHeaderOffset + 28, true);
            const dataStart          = localHeaderOffset + 30 + localNameLength + localExtraLength;
            const dataEnd          = dataStart + compressedSize;

            if (dataEnd > data.byteLength)
                break;

            const path           = new TextDecoder("utf-8").decode(data.subarray(pathStart, pathEnd));
            const compressedData = data.subarray(dataStart, dataEnd);

            if (!path.endsWith("/")) {

                let fileData: Uint8Array;

                if (compression === 0)
                    fileData = compressedData;

                else if (compression === 8)
                    fileData = await this.decompressStream(compressedData, "deflate-raw");

                else
                    fileData = new Uint8Array(0);

                if (compression === 0 || compression === 8)
                    files.push({
                        data:  Buffer.from(fileData),
                        mode:  0,
                        mtime: "",
                        path,
                        type:  "file"
                    });

                if (uncompressedSize > 0 && fileData.byteLength !== uncompressedSize)
                    console.debug("Unexpected ZIP entry size for '" + path + "'!");

            }

            centralDirectoryOffset = pathEnd + extraLength + commentLength;

        }

        return files;

    }

    private async decompressStream(data: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {

        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        const stream = new Blob([ buffer ]).stream().pipeThrough(new DecompressionStream(format));
        return new Uint8Array(await new Response(stream).arrayBuffer());

    }

    private findZipEndOfCentralDirectory(data: Uint8Array): number {

        const view      = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const maxOffset = Math.max(0, data.byteLength - 65557);

        for (let offset = data.byteLength - 22; offset >= maxOffset; offset--)
            if (view.getUint32(offset, true) === 0x06054b50)
                return offset;

        return -1;

    }

    private toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {

        return data instanceof Uint8Array
                   ? data
                   : new Uint8Array(data);

    }

    private readTarString(data: Uint8Array, offset: number, length: number): string {

        let end = offset;

        while (end < offset + length && data[end] !== 0)
            end++;

        return new TextDecoder("utf-8").decode(data.subarray(offset, end)).trim();

    }

    private readTarOctal(data: Uint8Array, offset: number, length: number): number {

        const value = this.readTarString(data, offset, length).replace(/\0/g, "").trim();
        return value.length > 0 ? parseInt(value, 8) : 0;

    }

    //#endregion

    //#region DetectAndConvertContentFormat(FileInfos)

    public async DetectAndConvertContentFormat(FileInfos: Array<chargyInterfaces.IFileInfo>)

        : Promise<chargeTransparencyRecord.  IChargeTransparencyRecord   |
                  chargeTransparencyLiveLink.IChargeTransparencyLiveLink |
                  publicKeyInfo.             IPublicKey                  |
                  chargyInterfaces.          ISessionCryptoResult> {

        //#region Initial checks

        if (FileInfos.length == 0)
            return {
                status:    chargyInterfaces.SessionVerificationResult.NoChargeTransparencyRecordsFound,
                message:   this.GetMultilanguageText("No charge transparency records found!"),
                certainty: 0
            }

        let expandedFiles    = new Array<chargyInterfaces.IFileInfo>();
        const processedFiles = new Array<chargeTransparencyRecord.IExtendedFileInfo>();

        //#endregion

        //#region Process PDF/A-3 and compressed files

        if (FileInfos.length > 0)
        {
            for (const fileInfo of FileInfos)
            {

                //#region Process PDF/A-3 attachments

                if (fileInfo.type === "application/pdf" || fileInfo.name.endsWith(".pdf"))
                {

                    const pdfjsLib     = await importPdfJs();

                    const pdfDocument  = fileInfo.data
                                            ? await pdfjsLib.getDocument({ data: fileInfo.data }).promise
                                            : fileInfo.path != null && fileInfo.path.length > 0
                                                  ? await pdfjsLib.getDocument({ url: fileInfo.path }).promise
                                                  : null;

                    if (pdfDocument !== null)
                    {
                        try
                        {

                            const attachmentsUnknown: unknown = await pdfDocument.getAttachments();

                            if (chargyLib.isMandatoryJSONObject(attachmentsUnknown))
                                Object.values(attachmentsUnknown).forEach(attachmentUnknown => {

                                    if (!isPdfAttachment(attachmentUnknown))
                                        return;

                                    const attachment = attachmentUnknown;

                                    if (attachment.filename.endsWith('.chargy'))
                                        expandedFiles.push({
                                            name:  attachment.filename,
                                            path:  FileInfos[0]?.path,
                                            type:  "application/chargy",
                                            data:  attachment.content,
                                            info:  "A CHARGY file extracted from a PDF/A-3 or newer attachment"
                                        });

                                    else if (attachment.filename.endsWith('.xml'))
                                        expandedFiles.push({
                                            name:  attachment.filename,
                                            path:  FileInfos[0]?.path,
                                            type:  "application/xml",
                                            data:  attachment.content,
                                            info:  "A XML file extracted from a PDF/A-3 or newer attachment"
                                        });

                                    else if (attachment.filename.endsWith('.json'))
                                        expandedFiles.push({
                                            name:  attachment.filename,
                                            path:  FileInfos[0]?.path,
                                            type:  "application/json",
                                            data:  attachment.content,
                                            info:  "A JSON file extracted from a PDF/A-3 or newer attachment"
                                        });

                                    else if (attachment.filename.endsWith('.csv'))
                                        expandedFiles.push({
                                            name:  attachment.filename,
                                            path:  FileInfos[0]?.path,
                                            type:  "text/csv",
                                            data:  attachment.content,
                                            info:  "A CSV file extracted from a PDF/A-3 or newer attachment"
                                        });

                                });

                        } catch (error) {
                            console.error(`Error extracting PDF/A-3 attachments: ${String(error)}`);
                        }
                    }

                }

                //#endregion

                else
                    expandedFiles.push(fileInfo);

            }
        }

        //#endregion

        expandedFiles = await this.decompressFiles(expandedFiles);
        expandedFiles = await this.expandQRCodeImageFiles(expandedFiles);

        const publicKeyHEXLookup = new Map<string, string>();

        for (const expandedFile of expandedFiles)
        {

            let textContent = new TextDecoder('utf-8').decode(expandedFile.data).trim();

            // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
            // conversion translates it to FEFF (UTF-16 BOM)
            if (textContent.charCodeAt(0) === 0xFEFF)
                textContent = textContent.substring(1);

            const publicKeyHEX = this.TryToGetDERPublicKeyHEX(expandedFile.name, textContent);

            if (publicKeyHEX != null)
                publicKeyHEXLookup.set(this.PublicKeyIdFromFileName(expandedFile.name), publicKeyHEX);

        }

        //#region Process JSON/XML/text files

        for (const expandedFile of expandedFiles)
        {

            const processedFile  = expandedFile as chargeTransparencyRecord.IExtendedFileInfo;
            let textContent      = new TextDecoder('utf-8').decode(expandedFile.data).trim();

            // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
            // conversion translates it to FEFF (UTF-16 BOM)
            if (textContent.charCodeAt(0) === 0xFEFF)
                textContent = textContent.substring(1);

            //#region XML processing...

            if (textContent.startsWith("<?xml") || textContent.startsWith("<"))
            {
                try
                {

                    const XMLDocument = new DOMParser().parseFromString(textContent, "text/xml");

                    //#region XML namespace found...

                    const xmlns = XMLDocument.lookupNamespaceURI(null);
                    if (xmlns != null)
                    {

                        switch (xmlns)
                        {

                            case "http://www.mennekes.de/Mennekes.EdlVerification.xsd":
                                processedFile.result = await new Mennekes(this).tryToParseMennekesXML(XMLDocument);
                                break;

                            case "http://transparenz.software/schema/2018/07":
                            case "https://open.charging.cloud/CTR/2020/01":
                                // try
                                // {
                                    processedFile.result = await new SAFEXML(this).tryToParseSAFEXML(XMLDocument);
                                // }
                                // catch (exception)
                                // {
                                //     processedFile.result = {
                                //         status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                                //         exception:  exception,
                                //         certainty:  0
                                //     };
                                // }

                                // if (processedFile.result.status !== undefined &&
                                //     processedFile.result.status !== chargyInterfaces.SessionVerificationResult.Unvalidated)
                                // {
                                //     processedFile.result = await new XMLContainer(this).tryToParseXMLContainer(XMLDocument);
                                // }

                                break;

                            // The SAFE transparency software v1.0 does not understand its own
                            // XML namespace. Therefore we have to guess the format.
                            case "":
                                if (XMLDocument.documentElement.localName === "ChargingProcess" ||
                                    XMLDocument.documentElement.localName === "Billing")
                                {
                                    processedFile.result = await new Mennekes(this).tryToParseMennekesXML(XMLDocument);
                                    break;
                                }

                                // if (XMLDocument.documentElement?.nodeName  === "values" ||
                                //     XMLDocument.documentElement?.localName === "values")
                                // {
                                //     processedFile.result = await new XMLContainer(this).tryToParseXMLContainer(XMLDocument);
                                //     break;
                                // }

                                processedFile.result = await new SAFEXML(this).tryToParseSAFEXML(XMLDocument);

                                if (processedFile.result.status != null &&
                                    processedFile.result.status !== chargyInterfaces.SessionVerificationResult.Unvalidated &&
                                    chargyLib.getElementsByLocalName(XMLDocument, "chargingStation").length === 0)
                                {
                                    processedFile.result = new XMLContainer(this).tryToParseXMLContainer(XMLDocument);
                                }

                                break;

                        }

                    }

                    //#endregion

                    //#region ..., or plain XML.

                    else
                    {

                        // The SAFE transparency software v1.0 does not understand its own
                        // XML namespace. Therefore we have to guess the format.
                        if (XMLDocument.documentElement.localName === "ChargingProcess" ||
                            XMLDocument.documentElement.localName === "Billing")
                            processedFile.result = await new Mennekes(this).tryToParseMennekesXML(XMLDocument);
                        else
                            processedFile.result = await new SAFEXML(this).tryToParseSAFEXML(XMLDocument);

                        // Maybe another XML format, e.g. the XML container format?
                        if (processedFile.result.status === chargyInterfaces.SessionVerificationResult.InvalidSessionFormat &&
                            chargyLib.getElementsByLocalName(XMLDocument, "chargingStation").length === 0)
                        {
                            processedFile.result = new XMLContainer(this).tryToParseXMLContainer(XMLDocument);
                        }

                    }

                    //#endregion

                } catch (exception)
                {
                    processedFile.result = {
                        status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                        message:    this.GetMultilanguageText("UnknownOrInvalidXMLChargeTransparencyFormat"),
                        exception:  exception,
                        certainty:  0
                    }
                }
            }

            //#endregion

            //#region OCMF processing

            else if (textContent.startsWith("OCMF"))
            {

                const publicKeyHEX = publicKeyHEXLookup.get(this.PublicKeyIdFromFileName(processedFile.name))
                                         ?? (publicKeyHEXLookup.size === 1
                                                 ? publicKeyHEXLookup.values().next().value
                                                 : undefined);

                processedFile.result = await new OCMF(this).TryToParseOCMFDocument(
                                                 textContent,
                                                 publicKeyHEX,
                                                 publicKeyHEX != null ? "hex" : undefined
                                             );

            }

            else if (textContent.startsWith("\"OCMF") && textContent.endsWith("\""))
            {

                const publicKeyHEX = publicKeyHEXLookup.get(this.PublicKeyIdFromFileName(processedFile.name))
                                         ?? (publicKeyHEXLookup.size === 1
                                                 ? publicKeyHEXLookup.values().next().value
                                                 : undefined);

                processedFile.result = await new OCMF(this).TryToParseOCMFDocument(
                                                 textContent.substring(1, textContent.length - 1),
                                                 publicKeyHEX,
                                                 publicKeyHEX != null ? "hex" : undefined
                                             );

            }

            //#endregion

            //#region PCDF processing

            else if (isPCDFText(textContent))
            {

                const publicKeyHEX = publicKeyHEXLookup.get(this.PublicKeyIdFromFileName(processedFile.name))
                                         ?? (publicKeyHEXLookup.size === 1
                                                 ? publicKeyHEXLookup.values().next().value
                                                 : undefined);

                processedFile.result = await new PCDF(this).TryToParsePCDFDocument(
                                                 textContent,
                                                 publicKeyHEX
                                             );

            }

            //#endregion

            //#region ALFEN processing

            else if (textContent.startsWith("AP;"))
                processedFile.result = new Alfen(this).TryToParseALFENFormat(textContent, {});

            else if (textContent.startsWith("\"AP;") && textContent.endsWith("\""))
                processedFile.result = new Alfen(this).TryToParseALFENFormat(textContent.substring(1, textContent.length - 1), {});

            //#endregion

            //#region Public key processing (PEM format)

            else if (textContent.startsWith("-----BEGIN PUBLIC KEY-----") &&
                     textContent.endsWith  ("-----END PUBLIC KEY-----"))
            {

                try
                {

                    const keyId          = this.PublicKeyIdFromFileName(processedFile.name);

                    const publicKeyPEM   = textContent.replace("-----BEGIN PUBLIC KEY-----", "").
                                                    replace("-----END PUBLIC KEY-----",   "").
                                                    split  ('\n').
                                                    map    ((line) => line.trim()).
                                                    filter ((line) => line !== '' && !line.startsWith('#')).
                                                    join   ("");

                    processedFile.result = this.TryToParseDERPublicKey(
                        keyId,
                        Buffer.from(publicKeyPEM, 'base64')
                    );

                }
                catch (exception)
                {
                    processedFile.result = {
                        status:     chargyInterfaces.SessionVerificationResult.InvalidPublicKey,
                        message:    this.GetMultilanguageText("UnknownOrInvalidPublicKeyFormat"),
                        exception:  exception,
                        certainty: 0
                    }
                }

            }

            //#endregion

            //#region Public key processing (HEX encoded DER format)

            else if (this.IsHexEncodedPublicKeyFile(processedFile.name, textContent))
            {

                try
                {

                    processedFile.result = this.TryToParseDERPublicKey(
                        this.PublicKeyIdFromFileName(processedFile.name),
                        Buffer.from(textContent.replace(/\s+/g, ""), 'hex')
                    );

                }
                catch (exception)
                {
                    processedFile.result = {
                        status:     chargyInterfaces.SessionVerificationResult.InvalidPublicKey,
                        message:    this.GetMultilanguageText("UnknownOrInvalidPublicKeyFormat"),
                        exception:  exception,
                        certainty: 0
                    }
                }

            }

            //#endregion

            //#region JSON processing

            else if (textContent.startsWith("{") && textContent.endsWith("}"))
            {
                try
                {

                    const JSONContent: unknown = JSON.parse(textContent);

                    if (JSONContent === null || typeof JSONContent !== "object" || !chargyLib.isMandatoryJSONObject(JSONContent))
                        throw new Error("Parsed JSON content is not a JSON object!");


                    const JSONContext = JSONContent["@context"];//?.trim().toString() ?? "";

                    if (chargeTransparencyLiveLink.IsAChargeTransparencyLiveLink(JSONContent))
                    {

                        JSONContent.timestamp ??= new Date().toISOString();

                        processedFile.result = JSONContent;

                    }

                    else if (JSONContent["format"] === "ptb")
                        processedFile.result = await new PTB(this).TryToParsePTBContainer(JSONContent);

                    else if (chargyLib.isMandatoryString(JSONContext))
                    {

                        if (JSONContext.startsWith("https://open.charging.cloud/contexts/CTR+json"))
                            processedFile.result = JSONContent as chargeTransparencyRecord.IChargeTransparencyRecord;

                        else if (JSONContext.startsWith("https://open.charging.cloud/contexts/publicKey+json"))
                            processedFile.result = JSONContent as publicKeyInfo.IPublicKey;

                        else if (JSONContext.startsWith("https://www.lichtblick.de/contexts/charging-station-json") ||
                                 JSONContext.startsWith("https://www.eneco.com/contexts/charging-station-json")     ||
                                 JSONContext.startsWith("https://www.chargeit-mobility.com/contexts/charging-station-json"))
                        {
                            processedFile.result = new ChargeIT(this).TryToParseChargeITContainerFormat(JSONContent);
                        }

                    }

                    // Some formats do not provide any context or format identifiers...
                    else
                    {

                        const results = [
                            new ChargeIT(this).   TryToParseChargeITContainerFormat(JSONContent),
                            new ChargePoint(this).TryToParseChargepointFormat      (JSONContent),
                            await new OCPI(this). tryToParseOCPIFormat             (JSONContent)
                        ];

                        //#region Filter and sort results

                        const filteredResults = results.filter((ctr) => {

                            // At this point we currently only know whether the CTR data format is correct,
                            // but NOT whether the crypto signatures are correct!
                            return chargyInterfaces.isISessionCryptoResult1(ctr);// &&
                                //ctr.status === chargyInterfaces.SessionVerificationResult.Unvalidated;

                        });

                        const sortedResults = filteredResults.sort((ctr1, ctr2) => {

                            if (ctr1.certainty > ctr2.certainty) {
                                return -1;
                            }

                            if (ctr1.certainty < ctr2.certainty) {
                                return 1;
                            }

                            return 0;

                        });

                        if (sortedResults.length >= 1 && sortedResults[0])
                            processedFile.result = sortedResults[0];

                        //#endregion

                    }

                }
                catch (exception) {
                    processedFile.result = {
                        status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                        message:    this.GetMultilanguageText("UnknownOrInvalidJSONChargeTransparencyFormat"),
                        exception:  exception,
                        certainty:  0
                    }
                }
            }

            //#endregion


            // if (processedFile.result == undefined) {
            //     processedFile.result = {
            //         status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
            //         message:   this.GetMultilanguageText("UnknownOrInvalidChargeTransparencyRecord"),
            //         certainty: 0
            //     }
            // }

            processedFiles.push(processedFile);

        }

        //#endregion


        //#region If a single CTR had been found...

        if (processedFiles.length == 1)
        {

            const processedFile = chargyLib.getFirstArrayElement(processedFiles, "Missing processed file");

            if (chargeTransparencyRecord.IsAChargeTransparencyRecord(processedFile.result))
                return this.processChargeTransparencyRecord(processedFile.result);

            if (chargeTransparencyLiveLink.IsAChargeTransparencyLiveLink(processedFile.result))
                return processedFile.result;

            if (publicKeyInfo.IsAPublicKeyLookup(processedFile.result))
                return {
                    status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                    message:    this.GetMultilanguageText("UnknownOrInvalidChargeTransparencyRecord"),
                    certainty:  0
                };

            // Can only be an ISessionCryptoResult/error message!
            return processedFile.result;

        }

        //#endregion

        //#region If multiple CTR had been found => Merge them into a single CTR!

        else if (processedFiles.length > 1)
        {

            const mergedCTR:chargeTransparencyRecord.IChargeTransparencyRecord = {
                "@id":      "",
                "@context": "",
                certainty:   0
            };

            for (const processedFile of processedFiles)
            {

                const processedFileResult = processedFile.result;

                if (chargeTransparencyRecord.IsAChargeTransparencyRecord(processedFileResult))
                {

                    if (mergedCTR["@id"] === "")
                        mergedCTR["@id"] = processedFileResult["@id"];

                    if (mergedCTR["@context"] === "")
                        mergedCTR["@context"] = processedFileResult["@context"];

                    if (processedFileResult.begin != null &&
                        processedFileResult.begin.length > 0 &&
                        (mergedCTR.begin == null || mergedCTR.begin.length === 0 || mergedCTR.begin > processedFileResult.begin))
                        mergedCTR.begin = processedFileResult.begin;

                    if (processedFileResult.end != null &&
                        processedFileResult.end.length > 0 &&
                        (mergedCTR.end == null || mergedCTR.end.length === 0 || mergedCTR.end < processedFileResult.end))
                        mergedCTR.end = processedFileResult.end;

                    mergedCTR.description ??= processedFileResult.description;

                    //ToDo: Is this a really good idea? Or should we fail, whenever this information is different?
                    mergedCTR.contracts ??= processedFileResult.contracts;


                    if (!mergedCTR.chargingStationOperators)
                        mergedCTR.chargingStationOperators = processedFileResult.chargingStationOperators;
                    else if (processedFileResult.chargingStationOperators)
                        for (const chargingStationOperator of processedFileResult.chargingStationOperators)
                            mergedCTR.chargingStationOperators.push(chargingStationOperator);

                    if (!mergedCTR.chargingPools)
                        mergedCTR.chargingPools = processedFileResult.chargingPools;
                    else if (processedFileResult.chargingPools)
                        for (const chargingPool of processedFileResult.chargingPools)
                            mergedCTR.chargingPools.push(chargingPool);

                    if (!mergedCTR.chargingStations)
                        mergedCTR.chargingStations = processedFileResult.chargingStations;
                    else if (processedFileResult.chargingStations)
                        for (const chargingStation of processedFileResult.chargingStations)
                            mergedCTR.chargingStations.push(chargingStation);

                    // publicKeys

                    if (!mergedCTR.chargingSessions)
                        mergedCTR.chargingSessions = processedFileResult.chargingSessions;
                    else if (processedFileResult.chargingSessions)
                        for (const chargingSession of processedFileResult.chargingSessions)
                            mergedCTR.chargingSessions.push(chargingSession);

                    if (!mergedCTR.eMobilityProviders)
                        mergedCTR.eMobilityProviders = processedFileResult.eMobilityProviders;
                    else if (processedFileResult.eMobilityProviders)
                        for (const eMobilityProvider of processedFileResult.eMobilityProviders)
                            mergedCTR.eMobilityProviders.push(eMobilityProvider);

                    if (!mergedCTR.mediationServices)
                        mergedCTR.mediationServices = processedFileResult.mediationServices;
                    else if (processedFileResult.mediationServices)
                        for (const mediationService of processedFileResult.mediationServices)
                            mergedCTR.mediationServices.push(mediationService);

                }

                else if (publicKeyInfo.IsAPublicKey(processedFileResult))
                {

                    mergedCTR.publicKeys ??= new Array<publicKeyInfo.IPublicKey>();

                    mergedCTR.publicKeys.push(processedFileResult);

                }

                else if (publicKeyInfo.IsAPublicKeyLookup(processedFileResult))
                {

                    mergedCTR.publicKeys ??= new Array<publicKeyInfo.IPublicKey>();

                    for (const publicKey of processedFileResult.publicKeys)
                        mergedCTR.publicKeys.push(publicKey);

                }

                else
                {

                    mergedCTR.invalidDataSets ??= new Array<chargeTransparencyRecord.IExtendedFileInfo>();

                    mergedCTR.invalidDataSets.push(processedFile);

                }

            }

            if (chargeTransparencyRecord.IsAChargeTransparencyRecord(mergedCTR))
                return this.processChargeTransparencyRecord(mergedCTR);

        }

        //#endregion

        return {
            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
            message:   this.GetMultilanguageText("No charge transparency records found!"),
            certainty: 0
        }

    }

    //#endregion

    //#region (private) processChargeTransparencyRecord(CTR)

    private async processChargeTransparencyRecord(CTR: chargeTransparencyRecord.IChargeTransparencyRecord): Promise<chargeTransparencyRecord.IChargeTransparencyRecord|chargyInterfaces.ISessionCryptoResult>
    {

        //#region Initial checks

        if (!chargeTransparencyRecord.IsAChargeTransparencyRecord(CTR))
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   this.GetMultilanguageText("UnknownOrInvalidJSONChargeTransparencyFormat"),
                certainty: 0
            }

        //#endregion

        //#region Data

        this.chargingStationOperators  = [];
        this.chargingPools             = [];
        this.chargingStations          = [];
        this.EVSEs                     = [];
        this.meters                    = [];
        this.chargingSessions          = [];

        //#endregion

        //ToDo: Verify @context

        try
        {

            // We operate on an agumented copy of the data!
            this.internalCTR  = chargeTransparencyRecord.CloneCTR(CTR);
            this.currentCTR   = CTR;

            //#region Process operators (pools, stations, evses, tariffs, ...)

            if (this.internalCTR.chargingStationOperators)
            {

                for (const chargingStationOperator of this.internalCTR.chargingStationOperators)
                {

                    this.chargingStationOperators.push(chargingStationOperator);

                    if (chargingStationOperator.chargingPools) {

                        for (const chargingPool of chargingStationOperator.chargingPools)
                        {

                            this.chargingPools.push(chargingPool);

                            if (chargingPool.chargingStations)
                            {

                                for (const chargingStation of chargingPool.chargingStations)
                                {

                                    this.chargingStations.push(chargingStation);

                                    for (const EVSE of chargingStation.EVSEs ?? [])
                                    {

                                        EVSE.chargingStation    = chargingStation;
                                        EVSE.chargingStationId  = chargingStation["@id"];

                                        this.EVSEs.push(EVSE);

                                        for (const meter of EVSE.energyMeters ?? [])
                                        {

                                            meter.EVSE               = EVSE;
                                            meter.EVSEId             = EVSE["@id"];

                                            meter.chargingStation    = chargingStation;
                                            meter.chargingStationId  = chargingStation["@id"];

                                            this.meters.push(meter);

                                        }

                                    }

                                }

                            }

                        }

                    }

                    if (chargingStationOperator.chargingStations)
                    {

                        for (const chargingStation of chargingStationOperator.chargingStations)
                        {

                            this.chargingStations.push(chargingStation);

                            for (const EVSE of chargingStation.EVSEs ?? [])
                            {

                                EVSE.chargingStation    = chargingStation;
                                EVSE.chargingStationId  = chargingStation["@id"];

                                this.EVSEs.push(EVSE);

                                for (const meter of EVSE.energyMeters ?? [])
                                {

                                    meter.EVSE               = EVSE;
                                    meter.EVSEId             = EVSE["@id"];

                                    meter.chargingStation    = chargingStation;
                                    meter.chargingStationId  = chargingStation["@id"];

                                    this.meters.push(meter);

                                }

                            }

                        }

                    }

                    if (chargingStationOperator.EVSEs) {

                        for (const EVSE of chargingStationOperator.EVSEs)
                        {

                            // EVSE.chargingStation    = chargingStation;
                            // EVSE.chargingStationId  = chargingStation["@id"];

                            this.EVSEs.push(EVSE);

                            for (const meter of EVSE.energyMeters ?? [])
                            {

                                meter.EVSE               = EVSE;
                                meter.EVSEId             = EVSE["@id"];

                                // meter.chargingStation    = chargingStation;
                                // meter.chargingStationId  = chargingStation["@id"];

                                this.meters.push(meter);

                            }

                        }

                    }

                }

            }

            //#endregion

            //#region Process pools     (       stations, evses, tariffs, ...)

            if (this.internalCTR.chargingPools) {

                for (const chargingPool of this.internalCTR.chargingPools)
                {

                    this.chargingPools.push(chargingPool);

                    if (chargingPool.chargingStations)
                    {

                        for (const chargingStation of chargingPool.chargingStations)
                        {

                            this.chargingStations.push(chargingStation);

                            for (const EVSE of chargingStation.EVSEs ?? [])
                            {

                                EVSE.chargingStation    = chargingStation;
                                EVSE.chargingStationId  = chargingStation["@id"];

                                this.EVSEs.push(EVSE);

                                for (const meter of EVSE.energyMeters ?? [])
                                {

                                    meter.EVSE               = EVSE;
                                    meter.EVSEId             = EVSE["@id"];

                                    meter.chargingStation    = chargingStation;
                                    meter.chargingStationId  = chargingStation["@id"];

                                    this.meters.push(meter);

                                }

                            }

                        }

                    }

                }

            }

            //#endregion

            //#region Process stations  (                 evses, tariffs, ...)

            if (this.internalCTR.chargingStations) {

                for (const chargingStation of this.internalCTR.chargingStations)
                {

                    this.chargingStations.push(chargingStation);

                    for (const EVSE of chargingStation.EVSEs ?? [])
                    {

                        EVSE.chargingStation    = chargingStation;
                        EVSE.chargingStationId  = chargingStation["@id"];

                        this.EVSEs.push(EVSE);

                        for (const meter of EVSE.energyMeters ?? [])
                        {

                            meter.EVSE               = EVSE;
                            meter.EVSEId             = EVSE["@id"];

                            meter.chargingStation    = chargingStation;
                            meter.chargingStationId  = chargingStation["@id"];

                            this.meters.push(meter);

                        }

                    }

                    if (chargingStation.energyMeters) {

                        for (const meter of chargingStation.energyMeters ?? [])
                        {

                            meter.chargingStation    = chargingStation;
                            meter.chargingStationId  = chargingStation["@id"];

                            this.meters.push(meter);

                        }

                    }

                }

            }

            //#endregion

            if (this.internalCTR.chargingSessions)
            {
                for (const chargingSession of this.internalCTR.chargingSessions)
                {
                    chargingSession.ctr                = this.internalCTR;
                    chargingSession.verificationResult = await this.processChargingSession(chargingSession);
                    this.chargingSessions.push(chargingSession);
                }
            }

            return this.internalCTR;

        }
        catch (exception)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   this.GetMultilanguageText("Exception occured: " + (exception instanceof Error ? exception.message : String(exception))),
                certainty:  0
            }
        }

    }

    //#endregion

    //#region (private) hasInplausibleChargingSessionTotalEnergyMeasurement(chargingSession)

    private hasInplausibleChargingSessionTotalEnergyMeasurement(chargingSession: chargeTransparencyRecord.IChargingSession): boolean
    {

        for (const measurement of chargingSession.measurements ?? [])
        {

            if (measurement.name !== "ENERGY_TOTAL" ||
                measurement.values.length < 2)
            {
                continue;
            }

            const firstValue = measurement.values.at(0);
            const lastValue  = measurement.values.at(-1);

            if (firstValue === undefined ||
                lastValue  === undefined)
            {
                continue;
            }

            const firstValueKWh = this.measurementValueInKWh(measurement, firstValue);
            const lastValueKWh  = this.measurementValueInKWh(measurement, lastValue);

            if (firstValueKWh == null ||
                lastValueKWh  == null)
            {
                continue;
            }

            if (this.isInplausibleChargingSessionTotalEnergy(lastValueKWh - firstValueKWh))
                return true;

        }

        return false;

    }

    private isInplausibleChargingSessionTotalEnergy(totalEnergyKWh: number): boolean
    {

        const totalEnergyRule = this.validationRules.chargingSession?.totalEnergy?.rule;

        if (totalEnergyRule == null)
            return false;

        const [ operator, thresholdValue, thresholdUnit ] = totalEnergyRule;
        const thresholdKWh = this.energyValueInKWh(thresholdValue, thresholdUnit);

        if (thresholdKWh == null)
            return false;

        switch (operator)
        {

            case ">":
                return totalEnergyKWh > thresholdKWh;

            case ">=":
                return totalEnergyKWh >= thresholdKWh;

            case "<":
                return totalEnergyKWh < thresholdKWh;

            case "<=":
                return totalEnergyKWh <= thresholdKWh;

            case "=":
            case "==":
                return totalEnergyKWh === thresholdKWh;

            default:
                return false;

        }

    }

    private energyValueInKWh(value: string | number, unit: string): number | undefined
    {

        const numericValue = typeof value === "number"
                                 ? value
                                 : Number.parseFloat(value);

        if (!Number.isFinite(numericValue))
            return undefined;

        switch (unit.trim().toLowerCase())
        {

            case "wh":
                return numericValue / 1000;

            case "kwh":
                return numericValue;

            case "mwh":
                return numericValue * 1000;

            default:
                return undefined;

        }

    }

    private measurementValueInKWh(measurement:      chargeTransparencyRecord.IMeasurement,
                                  measurementValue: chargeTransparencyRecord.IMeasurementValue): number | undefined
    {

        const value = measurementValue.value.toNumber();

        if (!Number.isFinite(value))
            return undefined;

        const unit = measurement.unit?.trim().toLowerCase();

        if (unit === "kwh")
            return value;

        if (unit === "wh" ||
            measurement.unitEncoded === 30)
        {
            return value / 1000;
        }

        return undefined;

    }

    private getChargingSessionTotalEnergyWarningLevel(): chargyInterfaces.WarningLevel
    {

        return this.validationRules.chargingSession?.totalEnergy?.level ??
               chargyInterfaces.WarningLevel.low;

    }

    private addChargeTransparencyRecordWarning(CTR:     chargeTransparencyRecord.IChargeTransparencyRecord | undefined,
                                               warning: chargyInterfaces.IWarning): void
    {

        if (CTR == null)
            return;

        CTR.warnings ??= [];

        if (!CTR.warnings.some(existingWarning => this.isSameWarning(existingWarning, warning)))
            CTR.warnings.push(warning);

    }

    private isSameWarning(left:  chargyInterfaces.IWarning,
                          right: chargyInterfaces.IWarning): boolean
    {

        return left.level   === right.level &&
               left.message === right.message;

    }

    //#endregion

    //#region (private) processChargingSession(chargingSession)

    private async processChargingSession(chargingSession: chargeTransparencyRecord.IChargingSession): Promise<chargyInterfaces.ISessionCryptoResult>
    {

        //ToDo: Verify @id exists
        //ToDo: Verify @context
        //ToDo: Verify begin & end
        //ToDo: Verify chargingStationOperatorId  => set chargingStationOperator
        //ToDo: Verify chargingPoolId             => set chargingPool
        //ToDo: Verify chargingStationId          => set chargingStation
        //ToDo: Verify EVSEId                     => set EVSE
        //ToDo: Verify meterId                    => set meter
        //ToDo: Verify tariffId                   => set tariff
        //ToDo: Verify measurements exists & count >= 1

        let verificationResult: chargyInterfaces.ISessionCryptoResult;

        switch (chargingSession["@context"])
        {

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/GDFCrypt01+json":
                chargingSession.method = new GDFCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/EMHCrypt01+json":
                chargingSession.method = new EMHCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/OCMFv1.0+json":
                chargingSession.method = new OCMFv1_x(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/ChargePointCrypt01+json":
                chargingSession.method = new ChargePointCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/AlfenCrypt01+json":
                chargingSession.method = new AlfenCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/MennekesCrypt01+json":
                chargingSession.method = new MennekesCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/PCDF+json":
                chargingSession.method = new PCDFCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/EDL40+json":
                chargingSession.method = new EDL40Crypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            case "https://open.charging.cloud/contexts/SessionSignatureFormats/bsm-ws36a-v0+json":
                chargingSession.method = new BSMCrypt01(this);
                verificationResult = await chargingSession.method.VerifyChargingSession(chargingSession);
                break;

            default:
                verificationResult = {
                    status:    chargyInterfaces.SessionVerificationResult.UnknownSessionFormat,
                    message:   this.GetMultilanguageText("UnknownOrInvalidChargingSessionFormat"),
                    certainty: 0
                }
                break;

        }

        if (verificationResult.status === chargyInterfaces.SessionVerificationResult.ValidSignature &&
            this.hasInplausibleChargingSessionTotalEnergyMeasurement(chargingSession))
        {

            this.addChargeTransparencyRecordWarning(
                chargingSession.ctr,
                {
                    level:   this.getChargingSessionTotalEnergyWarningLevel(),
                    message: this.GetMultilanguageText("InplausibleTotalEnergyMeasurementWarning")
                }
            );

            return {
                ...verificationResult,
                status: chargyInterfaces.SessionVerificationResult.InplausibleMeasurement
            };

        }

        return verificationResult;

    }

    //#endregion




    public MergeChargeTransparencyRecords(CTRs: Array<chargeTransparencyRecord.IChargeTransparencyRecord>): chargeTransparencyRecord.IChargeTransparencyRecord
    {

        const mergedCTR:chargeTransparencyRecord.IChargeTransparencyRecord = {
            "@id":       "",
            "@context":  "",
            certainty:    0
        };

        for (const ctr of CTRs)
        {

            //Note: the CTRs might have different @context values and additional context/format specific data!

            if (mergedCTR["@id"] === "")
                mergedCTR["@id"] = ctr["@id"];

            if (mergedCTR["@context"] === "")
                mergedCTR["@context"] = ctr["@context"];

            if (ctr.begin        != null &&
                ctr.begin.length  > 0 &&
                (mergedCTR.begin == null || mergedCTR.begin.length === 0 || mergedCTR.begin > ctr.begin))
                 mergedCTR.begin  = ctr.begin;

            if (ctr.end          != null &&
                ctr.end.  length  > 0 &&
                (mergedCTR.end   == null || mergedCTR.end.  length === 0 || mergedCTR.end   < ctr.end))
                 mergedCTR.end    = ctr.end;

            mergedCTR.description ??= ctr.description;

            //ToDo: Is this a really good idea? Or should we fail, whenever this information is different?
            mergedCTR.contracts ??= ctr.contracts;


            if (!mergedCTR.chargingStationOperators)
                mergedCTR.chargingStationOperators = ctr.chargingStationOperators;
            else if (ctr.chargingStationOperators)
                for (const chargingStationOperator of ctr.chargingStationOperators)
                    mergedCTR.chargingStationOperators.push(chargingStationOperator);

            if (!mergedCTR.chargingPools)
                mergedCTR.chargingPools = ctr.chargingPools;
            else if (ctr.chargingPools)
                for (const chargingPool of ctr.chargingPools)
                    mergedCTR.chargingPools.push(chargingPool);

            if (!mergedCTR.chargingStations)
                mergedCTR.chargingStations = ctr.chargingStations;
            else if (ctr.chargingStations)
                for (const chargingStation of ctr.chargingStations)
                    mergedCTR.chargingStations.push(chargingStation);

            // publicKeys

            if (!mergedCTR.chargingSessions)
                mergedCTR.chargingSessions = ctr.chargingSessions;
            else if (ctr.chargingSessions)
                for (const chargingSession of ctr.chargingSessions)
                    mergedCTR.chargingSessions.push(chargingSession);

            if (!mergedCTR.eMobilityProviders)
                mergedCTR.eMobilityProviders = ctr.eMobilityProviders;
            else if (ctr.eMobilityProviders)
                for (const eMobilityProvider of ctr.eMobilityProviders)
                    mergedCTR.eMobilityProviders.push(eMobilityProvider);

            if (!mergedCTR.mediationServices)
                mergedCTR.mediationServices = ctr.mediationServices;
            else if (ctr.mediationServices)
                for (const mediationService of ctr.mediationServices)
                    mergedCTR.mediationServices.push(mediationService);

        }

        return mergedCTR;

    }

}
