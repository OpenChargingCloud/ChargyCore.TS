/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Chargy Desktop App <https://github.com/OpenChargingCloud/ChargyDesktopApp>
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

import type { Chargy }                     from './chargy'
import { Alfen }                      from './Alfen'
import { OCMF }                       from './OCMF'
import * as chargyInterfaces          from './interfaces/chargyInterfaces'
import type * as chargeTransparencyRecord  from './interfaces/IChargeTransparencyRecord'
import * as chargyLib                 from './chargyLib'


export interface ISAFEXMLEVSEContext {
    "@id":         string;
    description?: chargyInterfaces.IMultilanguageText | undefined;
    meters:       Array<chargyInterfaces.IMeter>;
    connector?:   chargyInterfaces.IConnector & { "@id"?: string | undefined } | undefined;
}

export interface ISAFEXMLChargingStationInfo {
    "@id":             string;
    description?:      chargyInterfaces.IMultilanguageText | undefined;
    firmwareVersion?:  string | undefined;
    softwareVersion?:  string | undefined;
    geoLocation?:      chargyInterfaces.IGeoLocation | undefined;
    EVSE?:             ISAFEXMLEVSEContext | undefined;
}

export interface ISAFEXMLChargingStationContext {
    ChargingStationId?: string | undefined;
    EVSEId?:            string | undefined;
    chargingStation?:   ISAFEXMLChargingStationInfo | undefined;
    EVSE?:              ISAFEXMLEVSEContext | undefined;
    connector?:         chargyInterfaces.IConnector & { "@id"?: string | undefined } | undefined;
}

// https://github.com/SAFE-eV/transparenzsoftware/blob/archive/XML_Format.md
export class SAFEXML {

    private readonly chargy: Chargy;

    constructor(chargy: Chargy) {
        this.chargy  = chargy;
    }


    public static ParseChargingStationContext(XMLDocument: Document): ISAFEXMLChargingStationContext {

        const chargingStationElement = chargyLib.getElementsByLocalName(XMLDocument, "chargingStation").at(0);

        if (chargingStationElement === undefined)
            return {};

        const chargingStationAttributeId = chargingStationElement.getAttribute("id")?.trim();
        const chargingStationId          = chargingStationAttributeId != null && chargingStationAttributeId.length > 0
                                               ? chargingStationAttributeId
                                               : chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(chargingStationElement, "id"));
        const softwareVersion     = chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(chargingStationElement, "softwareVersion"));
        const geoLocationElement  = chargyLib.getDirectChildByLocalName(chargingStationElement, "geoLocation");

        const latitude            = Number.parseFloat(chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(geoLocationElement ?? chargingStationElement, "latitude"))  ?? "");
        const longitude           = Number.parseFloat(chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(geoLocationElement ?? chargingStationElement, "longitude")) ?? "");

        const geoLocation         = Number.isFinite(latitude) && Number.isFinite(longitude)
                                        ? { lat: latitude, lng: longitude }
                                        : undefined;

        if (chargyLib.getDirectChildByLocalName(chargingStationElement, "EVSEs") !== undefined)
            throw new Error("The SAFE chargingStation XML element must contain EVSE directly and no EVSEs container element!");

        const evseElements = chargyLib.getDirectChildrenByLocalName(chargingStationElement, "EVSE");

        if (evseElements.length > 1)
            throw new Error("The SAFE chargingStation XML element must not contain more than one EVSE element!");

        const evseElement       = evseElements.at(0);
        const evseAttributeId   = evseElement?.getAttribute("id")?.trim();
        const evseTextId        = chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(evseElement ?? chargingStationElement, "id"));
        const evseId            = evseAttributeId != null && evseAttributeId.length > 0
                                      ? evseAttributeId
                                      : evseTextId ?? "";
        const connectorElements = evseElement !== undefined
                                      ? chargyLib.getDirectChildrenByLocalName(evseElement, "connector")
                                      : [];

        if (connectorElements.length > 1)
            throw new Error("The SAFE EVSE XML element must not contain more than one connector element!");

        const connectorElement = connectorElements.at(0);
        const connectorId      = connectorElement?.getAttribute("id")?.trim();
        const connectorType    = chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(connectorElement ?? evseElement ?? chargingStationElement, "type"));
        const connector        = connectorType != null && connectorType.length > 0
                                     ? { "@id": connectorId, type: connectorType, looses: 0 }
                                     : undefined;

        const parsedEVSE: ISAFEXMLEVSEContext | undefined = evseElement !== undefined
                                                                ? {
                                                                      "@id":         evseId,
                                                                      "description": chargyLib.parseDescription(evseElement),
                                                                      "meters":      [],
                                                                      "connector":   connector
                                                                  }
                                                                : undefined;

        const chargingStation: ISAFEXMLChargingStationInfo = {
            "@id":              chargingStationId ?? "",
            "description":      chargyLib.parseDescription(chargingStationElement),
            "firmwareVersion":  softwareVersion,
            "softwareVersion":  softwareVersion,
            "geoLocation":      geoLocation,
            "EVSE":             parsedEVSE
        };

        return {
            "ChargingStationId":  chargingStationId,
            "EVSEId":             parsedEVSE?.["@id"],
            "chargingStation":    chargingStation,
            "EVSE":               parsedEVSE,
            "connector":          parsedEVSE?.connector
        };

    }

    //#region tryToParseSAFEXML(XMLDocument)

    public async tryToParseSAFEXML(XMLDocument: Document) : Promise<chargeTransparencyRecord.IChargeTransparencyRecord|chargyInterfaces.ISessionCryptoResult>
    {

        // The SAFE transparency software v1.0 does not understand its own
        // XML namespace. Therefore we have to guess the format.

        try
        {

            // <?xml version="1.0" encoding="UTF-8"?>
            // <values>
            //
            //     <chargingStation id="DE*GEF*STATION*CI*TESTS*1*A" xmlns="https://open.charging.cloud/CTR/2020/01">
            //
            //         <description language="en">
            //            GraphDefined Charging Station - CI-Tests Pool 1 / Station A
            //         </description>
            //         <softwareVersion>3.0.25.2089</softwareVersion>
            //
            //         <geoLocation>
            //            <latitude>50.387945</latitude>
            //            <longitude>10.4304</longitude>
            //         </geoLocation>
            //
            //         <EVSE id="DE*GEF*EVSE*CI*TESTS*1*A*1">
            //            <description language="en">
            //               GraphDefined EVSE - CI-Tests Pool 1 / Station A / EVSE 1
            //            </description>
            //            <connector id="1">
            //               <type>Type-2</type>
            //            </connector>
            //         </EVSE>
            //
            //     </chargingStation>
            //
            //     <value transactionId="..." context="Transaction.Begin">
            //         <signedData format="..." encoding="...">...</signedData>
            //         <publicKey encoding="...">...</publicKey>
            //     </value>
            //
            //     <value transactionId="..." context="Transaction.End">
            //         <signedData format="..." encoding="...">...</signedData>
            //         <publicKey encoding="...">...</publicKey>
            //     </value>
            //
            // </values>

            if (XMLDocument.documentElement.nodeName  === "values" ||
                XMLDocument.documentElement.localName === "values")
            {

                const safeXMLContext = SAFEXML.ParseChargingStationContext(XMLDocument);

                const signedDataValues          = new Array<string>();

                let   commonSignedDataFormat    = "";
                let   commonSignedDataEncoding  = "";
                let   commonPublicKeyEncoding   = "";
                let   commonPublicKey           = "";

                for (const value of chargyLib.getElementsByLocalName(XMLDocument, "value"))
                {

                    // The public key might be null or empty for some formats!
                    const publicKey   = chargyLib.getElementsByLocalName(value, "publicKey")[0];
                    const signedData  = chargyLib.getElementsByLocalName(value, "signedData")[0];

                    if (signedData == null)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Each value within the given XML container must contain signed data!"),
                            certainty:  0
                        }

                    const signedDataFormat = signedData.attributes.getNamedItem("format")?.  value.trim().toLowerCase() ?? "";

                    if (commonSignedDataFormat === "" && signedDataFormat !== "")
                        commonSignedDataFormat = signedDataFormat;
                    else if (signedDataFormat !== commonSignedDataFormat)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different signed data formats within the given XML container!"),
                            certainty:  0
                        }


                    const signedDataEncoding = signedData.attributes.getNamedItem("encoding")?.value.trim().toLowerCase() ?? "";

                    if (commonSignedDataEncoding === "" && signedDataEncoding !== "")
                        commonSignedDataEncoding = signedDataEncoding;
                    else if (signedDataEncoding !== commonSignedDataEncoding)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different signed data encodings within the given XML container!"),
                            certainty:  0
                        }


                    const signedDataValue = signedData.textContent.trim();

                    if (chargyLib.IsNullOrEmpty(signedDataValue))
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("The signed data value within the given XML container must not be empty!"),
                            certainty:  0
                        }


                    const publicKeyEncoding  = publicKey?.attributes.getNamedItem("encoding")?.value.trim().toLowerCase() ?? "";

                    if (commonPublicKeyEncoding === "" && publicKeyEncoding !== "")
                        commonPublicKeyEncoding = publicKeyEncoding;
                    else if (publicKeyEncoding !== commonPublicKeyEncoding)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different public key encodings within the given XML container!"),
                            certainty:  0
                        }

                    // if (commonPublicKeyEncoding !== ""    &&
                    //     commonPublicKeyEncoding !== "hex" &&
                    //     commonPublicKeyEncoding !== "plain" )
                    //     return {
                    //         status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                    //         message:   chargyInterfaces.CreateMultilanguageText("Unkown public key encoding within the given XML container!"),
                    //         certainty:  0
                    //     }


                    const publicKeyValue  = publicKey?.textContent.trim().replace(/\s+/g, "") ?? "";

                    if (commonPublicKey === "" && publicKeyValue !== "")
                        commonPublicKey = publicKeyValue;
                    else if (publicKeyValue !== commonPublicKey)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different public keys within the given XML container!"),
                            certainty:  0
                        }

                    switch (commonSignedDataEncoding)
                    {

                        case "":
                        case "plain":
                            signedDataValues.push(Buffer.from(signedDataValue, 'utf8').toString().trim());
                            break;

                        case "base32":
                            signedDataValues.push(Buffer.from(this.chargy.base32Decode(signedDataValue, 'RFC4648')).toString().trim());
                            break;

                        case "base64":
                            signedDataValues.push(Buffer.from(signedDataValue, 'base64').toString().trim());
                            break;

                        case "hex": // Some people put whitespaces, '-' or ':' into the hex format!
                            signedDataValues.push(Buffer.from(signedDataValue.replace(/[^a-fA-F0-9]/g, ''), 'hex').toString().trim());
                            break;

                        default:
                            return {
                                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                                message:   this.chargy.GetMultilanguageText("Unkown signed data encoding within the given SAFE XML!"),
                                certainty:  0
                            }

                    }

                }

                if (signedDataValues.length > 0)
                {

                    switch (commonSignedDataFormat)
                    {

                        case "alfen":
                            return new Alfen(this.chargy).
                                       TryToParseALFENFormat(
                                           signedDataValues,
                                           safeXMLContext
                                       );

                        case "ocmf":
                            return await new OCMF(this.chargy).
                                             TryToParseOCMFDocuments(
                                                 signedDataValues,
                                                 commonPublicKey,
                                                 commonPublicKeyEncoding,
                                                 safeXMLContext
                                             );

                        default:
                            return {
                                status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                                message:    this.chargy.GetMultilanguageText("UnknownOrInvalidChargingSessionFormat"),
                                certainty:  0
                            }

                    }
                }

            }

        }
        catch (exception)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   this.chargy.GetMultilanguageText("Exception occured: " + (exception instanceof Error ? exception.message : String(exception))),
                certainty:  0
            }
        }

        return {
            status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
            message:    this.chargy.GetMultilanguageText("UnknownOrInvalidChargingSessionFormat"),
            certainty:  0
        }

    }

    //#endregion

}
