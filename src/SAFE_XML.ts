/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 This file is part of ChargyCore <https://github.com/OpenChargingCloud/ChargyCore.TS>
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
import { Alfen }                           from './Alfen'
import { OCMF }                            from './OCMF'
import * as chargyInterfaces               from './interfaces/chargyInterfaces'
import type * as chargeTransparencyRecord  from './interfaces/IChargeTransparencyRecord'
import * as chargyLib                      from './interfaces/chargyLib'


// export interface ISAFEXMLConnectorContext {
//     "@id"?:              string;
//     type?:               string;
// }

// export interface ISAFEXMLEVSEContext {
//     "@id":               string;
//     description?:        chargyInterfaces.I18NString | undefined;
//     meters:              Array<chargyInterfaces.IEnergyMeter>;
//     connectors?:         Array<chargyInterfaces.IConnector> | undefined;
// }

// export interface ISAFEXMLChargingStationInfo {
//     "@id":               string;
//     description?:        chargyInterfaces.I18NString        | undefined;
//     firmware?:           chargyInterfaces.IFirmware;
//     geoLocation?:        chargyInterfaces.IGeoLocation      | undefined;
//     EVSEs?:              Array<ISAFEXMLEVSEContext>         | undefined;
// }

// export interface ISAFEXMLChargingStationContext {
//     chargingStation?:    ISAFEXMLChargingStationInfo;
//     EVSE?:               ISAFEXMLEVSEContext;
//     connector?:          chargyInterfaces.IConnector;
// }


// https://github.com/SAFE-eV/transparenzsoftware/blob/archive/XML_Format.md
export class SAFEXML {

    private readonly chargy: Chargy;

    constructor(chargy: Chargy) {
        this.chargy  = chargy;
    }


    public static ParseContainerInfos(XMLDocument:  Document,
                                      chargy:       Chargy)

        : chargyInterfaces.IContainerInfos |
          chargyInterfaces.ISessionCryptoResult

    {

        const containerInfos:chargyInterfaces.IContainerInfos = {};

        const chargingStationElements = chargyLib.getElementsByLocalName(XMLDocument, "chargingStation");

        if (chargingStationElements.length == 0)
            return containerInfos;

        if (chargingStationElements.length > 1)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   chargy.GetMultilanguageText("Only one chargingStation element is allowed within the given SAFE XML container!"),
                certainty: 0
            }
        }

        if (chargingStationElements[0] === undefined)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   chargy.GetMultilanguageText("The chargingStation element within the given SAFE XML container is invalid!"),
                certainty: 0
            }
        }

        const chargingStationElement  = chargingStationElements[0];

        //#region chargingStationId

        const chargingStationId       = chargingStationElement.getAttribute("id")?.trim();

        if (chargingStationId === undefined ||
            chargingStationId.length == 0)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   chargy.GetMultilanguageText("The chargingStation identifier within the given SAFE XML container is invalid!"),
                certainty: 0
            }
        }

        //#endregion

        const chargingStation:  chargyInterfaces.IChargingStation = {
                                    "@id":  chargingStationId
                                };

        containerInfos.chargingStations  = [ chargingStation ];

        //#region description

        const description = chargyLib.parseDescription(chargingStationElement);
        if (description !== undefined)
            chargingStation.description = description;

        //#endregion

        //#region firmware

        const firmware = chargyLib.getDirectChildByLocalName(chargingStationElement, "firmware");
        if (firmware !== undefined)
        {

            chargingStation.firmware = {};

            const firmwareVersion         = chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(firmware, "version"));
            if (firmwareVersion !== undefined)
                chargingStation.firmware.version  = firmwareVersion;

            const firmwareChecksum        = chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(firmware, "checksum"));
            if (firmwareChecksum !== undefined)
                chargingStation.firmware.checksum = firmwareChecksum;

            if (Object.keys(chargingStation.firmware).length === 0)
                delete chargingStation.firmware;

        }

        //#endregion

        //#region geoLocation

        const geoLocationElement = chargyLib.getDirectChildByLocalName(chargingStationElement, "geoLocation");
        if (geoLocationElement !== undefined)
        {

            const latitude     = Number.parseFloat(chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(geoLocationElement, "latitude"))  ?? "");
            const longitude    = Number.parseFloat(chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(geoLocationElement, "longitude")) ?? "");

            const geoLocation  = Number.isFinite(latitude) && Number.isFinite(longitude)
                                        ? { lat: latitude, lng: longitude }
                                        : undefined;

            if (geoLocation !== undefined)
                chargingStation.geoLocation  = geoLocation;

        }

        //#endregion


        //#region EVSE

        const evseElements  = chargyLib.getElementsByLocalName(chargingStationElement, "EVSE");

        if (evseElements.length > 1)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   chargy.GetMultilanguageText("Only one EVSE element is allowed within the given SAFE XML chargingStation element!"),
                certainty: 0
            }
        }

        if (evseElements[0] === undefined)
        {
            return {
                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                message:   chargy.GetMultilanguageText("The EVSE element within the given SAFE XML chargingStation element is invalid!"),
                certainty: 0
            }
        }

        const evseElement  = evseElements[0];
        const evseId       = evseElement.getAttribute("id")?.trim();

        if (evseId      !== undefined &&
            evseId.length > 0)
        {

            const evse:  chargyInterfaces.IEVSE =  {
                                "@id":  evseId
                            };

            chargingStation.EVSEs = [ evse ];


            const evseDescription = chargyLib.parseDescription(evseElement);
            if (evseDescription     !== undefined)
                evse.description  = evseDescription;


            //#region connector

            const connectorElements  = chargyLib.getElementsByLocalName(evseElement, "connector");

            if (connectorElements.length > 1)
            {
                return {
                    status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                    message:   chargy.GetMultilanguageText("Only one connector element is allowed within the given SAFE XML EVSE element!"),
                    certainty: 0
                }
            }

            if (connectorElements[0] === undefined)
            {
                return {
                    status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                    message:   chargy.GetMultilanguageText("The connector element within the given SAFE XML EVSE element is invalid!"),
                    certainty: 0
                }
            }

            const connectorElement = connectorElements[0];

            const connector: chargyInterfaces.IConnector | undefined  = {};

            const connectorId    = connectorElement.getAttribute("id")?.trim();
            if (connectorId != null && connectorId.length > 0)
                connector["@id"] = connectorId;


            const connectorType  = chargyLib.getTrimmedTextContent(chargyLib.getDirectChildByLocalName(connectorElement, "type"));
            if (connectorType !== undefined && connectorType.length > 0)
                connector.type   = connectorType;

            if (Object.keys(connector).length > 0)
                evse.connectors = [ connector ];

            //#endregion

        }

        //#endregion


        return containerInfos;

    }

    //#region tryToParseSAFEXML(XMLDocument)

    public async tryToParseSAFEXML(XMLDocument: Document)

        : Promise<chargeTransparencyRecord.IChargeTransparencyRecord |
                  chargyInterfaces.        ISessionCryptoResult>

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
            //         <firmwareVersion>3.0.25.2089</firmwareVersion>
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

                const safeXMLContext  = SAFEXML.ParseContainerInfos(
                                            XMLDocument,
                                            this.chargy
                                        );

                if (chargyInterfaces.isISessionCryptoResult1(safeXMLContext))
                    return safeXMLContext;


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
                            certainty: 0
                        }

                    const signedDataFormat = signedData.attributes.getNamedItem("format")?.  value.trim().toLowerCase() ?? "";

                    if (commonSignedDataFormat === "" && signedDataFormat !== "")
                        commonSignedDataFormat = signedDataFormat;
                    else if (signedDataFormat !== commonSignedDataFormat)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different signed data formats within the given XML container!"),
                            certainty: 0
                        }


                    const signedDataEncoding = signedData.attributes.getNamedItem("encoding")?.value.trim().toLowerCase() ?? "";

                    if (commonSignedDataEncoding === "" && signedDataEncoding !== "")
                        commonSignedDataEncoding = signedDataEncoding;
                    else if (signedDataEncoding !== commonSignedDataEncoding)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different signed data encodings within the given XML container!"),
                            certainty: 0
                        }


                    const signedDataValue = signedData.textContent.trim();

                    if (chargyLib.IsNullOrEmpty(signedDataValue))
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("The signed data value within the given XML container must not be empty!"),
                            certainty: 0
                        }


                    const publicKeyEncoding  = publicKey?.attributes.getNamedItem("encoding")?.value.trim().toLowerCase() ?? "";

                    if (commonPublicKeyEncoding === "" && publicKeyEncoding !== "")
                        commonPublicKeyEncoding = publicKeyEncoding;
                    else if (publicKeyEncoding !== commonPublicKeyEncoding)
                        return {
                            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                            message:   this.chargy.GetMultilanguageText("Invalid mixture of different public key encodings within the given XML container!"),
                            certainty: 0
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
                            certainty: 0
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
                                certainty: 0
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
                                status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
                                message:   this.chargy.GetMultilanguageText("UnknownOrInvalidChargingSessionFormat"),
                                certainty: 0
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
                certainty: 0
            }
        }

        return {
            status:    chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
            message:   this.chargy.GetMultilanguageText("UnknownOrInvalidChargingSessionFormat"),
            certainty: 0
        }

    }

    //#endregion

}
