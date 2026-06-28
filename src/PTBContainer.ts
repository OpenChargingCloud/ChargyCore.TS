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

import type { Chargy }                     from './chargy'
import { OCMF }                            from './OCMF'
import type * as chargeTransparencyRecord  from './interfaces/IChargeTransparencyRecord'
import * as chargyInterfaces               from './interfaces/chargyInterfaces'
import * as chargyLib                      from './interfaces/chargyLib'


export interface IPTBAddress {
    street:        string;
    houseNumber?:  string | undefined;
    zipCode?:      string | undefined;
    postalCode?:   string | undefined;
    town?:         string | undefined;
    city?:         string | undefined;
    country?:      string | undefined;
    [key: string]: unknown;
}

export interface IPTBGeoLocation {
    lat: number;
    lng: number;
}

export interface IPTBContainer {
    format:                "ptb";
    formatVersion?:        string | undefined;
    publicKey:             string;
    chargeboxIdentifier:   string;
    address:               IPTBAddress;
    geoLocation:           IPTBGeoLocation;
    ocmfBegin:             string;
    ocmfEnd:               string;
    [key: string]: unknown;
}

export interface IPTBValidationIssue {
    path:       string;
    message:    string;
}

export interface IPTBValidationError extends chargyInterfaces.ISessionCryptoResult {
    format:     "ptb";
    issues:     IPTBValidationIssue[];
}


const base64RegExp       = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const formatVersionRegExp = /^1(?:\.[0-9]+)?$/;


export class PTB {

    private readonly chargy: Chargy;

    constructor(chargy: Chargy) {
        this.chargy = chargy;
    }


    public async TryToParsePTBContainer(container: unknown)

        : Promise<chargeTransparencyRecord.IChargeTransparencyRecord |
                  chargyInterfaces.ISessionCryptoResult>

    {

        const validation = this.validateContainer(container);

        if (!validation.valid)
            return this.validationError(validation.issues);

        const ptbContainer  = validation.container;
        const containerInfos: chargyInterfaces.IContainerInfos = {
            chargingStations: [{
                "@id":         ptbContainer.chargeboxIdentifier,
                address:       this.normalizeAddress(ptbContainer.address),
                geoLocation:   {
                    lat: ptbContainer.geoLocation.lat,
                    lng: ptbContainer.geoLocation.lng
                },
                EVSEs: [{
                    "@id": ptbContainer.chargeboxIdentifier
                }]
            }]
        };

        return new OCMF(this.chargy).TryToParseOCMFDocuments(
            [ ptbContainer.ocmfBegin, ptbContainer.ocmfEnd ],
            ptbContainer.publicKey,
            "base64",
            containerInfos
        );

    }


    private validateContainer(container: unknown)

        : { valid: true;  container: IPTBContainer } |
          { valid: false; issues:   IPTBValidationIssue[] }

    {

        const issues: IPTBValidationIssue[] = [];

        if (!chargyLib.isMandatoryJSONObject(container))
            return {
                valid:  false,
                issues: [{
                    path:    "$",
                    message: "must be an object"
                }]
            };

        this.requireConstantString(container, "format", "ptb", issues);
        this.requireString        (container, "publicKey",            issues);
        this.requireString        (container, "chargeboxIdentifier",  issues);
        this.requireString        (container, "ocmfBegin",            issues);
        this.requireString        (container, "ocmfEnd",              issues);

        const formatVersion = container["formatVersion"];
        if (formatVersion !== undefined &&
            (typeof formatVersion !== "string" || !formatVersionRegExp.test(formatVersion)))
        {
            issues.push({
                path:    "$.formatVersion",
                message: "must match ^1(?:\\.[0-9]+)?$"
            });
        }

        const publicKey = container["publicKey"];
        if (typeof publicKey === "string" && publicKey.length > 0 && !base64RegExp.test(publicKey))
            issues.push({
                path:    "$.publicKey",
                message: "must be a base64 encoded string"
            });

        for (const propertyName of [ "ocmfBegin", "ocmfEnd" ])
        {
            const ocmfDocument = container[propertyName];

            if (typeof ocmfDocument === "string" &&
                (ocmfDocument.length < 10 || !ocmfDocument.startsWith("OCMF|")))
            {
                issues.push({
                    path:    "$." + propertyName,
                    message: "must be an unmodified OCMF record beginning with OCMF|"
                });
            }
        }

        const address = container["address"];
        if (!chargyLib.isMandatoryJSONObject(address))
            issues.push({
                path:    "$.address",
                message: "must be an object"
            });
        else
            this.validateAddress(address, issues);

        const geoLocation = container["geoLocation"];
        if (!chargyLib.isMandatoryJSONObject(geoLocation))
            issues.push({
                path:    "$.geoLocation",
                message: "must be an object"
            });
        else
            this.validateGeoLocation(geoLocation, issues);

        if (issues.length > 0)
            return {
                valid: false,
                issues
            };

        return {
            valid:     true,
            container: container as unknown as IPTBContainer
        };

    }


    private validateAddress(address: chargyLib.JSONObject,
                            issues:  IPTBValidationIssue[]): void
    {

        this.requireString(address, "street", issues, "$.address");

        for (const propertyName of [ "houseNumber", "zipCode", "postalCode", "town", "city", "country" ])
        {
            const propertyValue = address[propertyName];

            if (propertyValue !== undefined && typeof propertyValue !== "string")
                issues.push({
                    path:    "$.address." + propertyName,
                    message: "must be a string"
                });

            else if ((propertyName === "town" || propertyName === "city") && propertyValue === "")
                issues.push({
                    path:    "$.address." + propertyName,
                    message: "must be a non-empty string"
                });
        }

        const town = address["town"];
        const city = address["city"];

        if ((typeof town !== "string" || town.length === 0) &&
            (typeof city !== "string" || city.length === 0))
        {
            issues.push({
                path:    "$.address",
                message: "must contain a non-empty town or city"
            });
        }

    }


    private validateGeoLocation(geoLocation: chargyLib.JSONObject,
                                issues:      IPTBValidationIssue[]): void
    {

        const latitude  = geoLocation["lat"];
        const longitude = geoLocation["lng"];

        if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)
            issues.push({
                path:    "$.geoLocation.lat",
                message: "must be a number between -90 and 90"
            });

        if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
            issues.push({
                path:    "$.geoLocation.lng",
                message: "must be a number between -180 and 180"
            });

        for (const propertyName of Object.keys(geoLocation))
            if (propertyName !== "lat" && propertyName !== "lng")
                issues.push({
                    path:    "$.geoLocation." + propertyName,
                    message: "is not allowed"
                });

    }


    private requireString(json:          chargyLib.JSONObject,
                          propertyName:  string,
                          issues:        IPTBValidationIssue[],
                          parentPath:    string = "$"       ): void
    {

        const value = json[propertyName];

        if (typeof value !== "string" || value.length === 0)
            issues.push({
                path:    parentPath + "." + propertyName,
                message: "must be a non-empty string"
            });

    }


    private requireConstantString(json:          chargyLib.JSONObject,
                                  propertyName:  string,
                                  expectedValue: string,
                                  issues:        IPTBValidationIssue[]): void
    {

        if (json[propertyName] !== expectedValue)
            issues.push({
                path:    "$." + propertyName,
                message: "must equal " + expectedValue
            });

    }


    private normalizeAddress(address: IPTBAddress): chargyInterfaces.IAddress {

        return {
            city:         address.city       ?? address.town,
            street:       address.street,
            houseNumber:  address.houseNumber,
            postalCode:   address.postalCode ?? address.zipCode,
            country:      address.country
        };

    }


    private validationError(issues: IPTBValidationIssue[]): IPTBValidationError {

        return {
            format:     "ptb",
            status:     chargyInterfaces.SessionVerificationResult.InvalidSessionFormat,
            message:    this.chargy.GetMultilanguageText("Invalid PTB OCMF container!"),
            certainty:  1,
            issues,
            errors:     issues.map(issue => chargyInterfaces.CreateError(
                this.chargy.GetMultilanguageText(issue.path + " " + issue.message)
            ))
        };

    }

}
