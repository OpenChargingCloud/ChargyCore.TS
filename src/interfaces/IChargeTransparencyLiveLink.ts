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

import * as chargyInterfaces  from './chargyInterfaces'
import * as chargyLib         from './chargyLib'


export const ChargeTransparencyLiveLinkContext = "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0";


function isConnector(data: unknown): data is IConnector {
    if (!chargyLib.isObject(data))
        return false;

    return [ "standard", "format", "powerType", "maxPower" ].
               every(key => data[key] === undefined || typeof data[key] === "string");
}

function isTransportURL(data: unknown): data is ITransportURL|string {

    if (typeof data === "string")
        return data.trim() !== "";

    return chargyLib.isObject(data) &&
           typeof data["url"] === "string" &&
           (data["priority"] === undefined || typeof data["priority"] === "number") &&
           (data["weight"]   === undefined || typeof data["weight"]   === "number");

}

function isTransport(data: unknown): data is Transport {

    if (!chargyLib.isObject(data))
        return false;

    const type = data["type"];

    if (type !== "https"     &&
        type !== "httpSSE"   &&
        type !== "websocket")
    {
        return false;
    }

    // Only https declares a refresh period, so only there is it validated.
    // On the other two it is an unknown property like any other.
    if (type === "https"                 &&
        data["refresh"]    !== undefined &&
        typeof data["refresh"] !== "number")
    {
        return false;
    }

    return (data["url"]  === undefined || typeof data["url"] === "string") &&
           (data["urls"] === undefined || (Array.isArray(data["urls"]) && data["urls"].every(isTransportURL))) &&
           (data["totp"] === undefined || isTOTPConfig(data["totp"]));

}

export function IsAChargeTransparencyLiveLink(data: unknown): data is IChargeTransparencyLiveLink {

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    return data["@context"]    === ChargeTransparencyLiveLinkContext &&
          (data["created"]     === undefined || data["created"]   === null || typeof data["created"]   === "string") &&
          (data["description"] === undefined || chargyLib.isI18NString(data["description"])) &&
          (data["imageURLs"]   === undefined || (Array.isArray(data["imageURLs"]) && data["imageURLs"].every(value => typeof value === "string"))) &&
          (data["geoLocation"] === undefined || chargyInterfaces.isGeoLocation(data["geoLocation"])) &&
          (data["connector"]   === undefined || isConnector(data["connector"])) &&
          (data["liveTransports"] === undefined || (Array.isArray(data["liveTransports"]) && data["liveTransports"].every(isTransport))) &&
          (data["signatures"]  === undefined ||  Array.isArray(data["signatures"]));

}

function isTOTPConfig(data: unknown): data is TOTPConfig {
    return chargyLib.isObject(data) &&
           typeof data["initialSharedSecret"] === "string" &&
           typeof data["timeStep"]            === "number";
}

export interface IChargeTransparencyLiveLink extends chargyLib.JSONObject {

    "@context": typeof ChargeTransparencyLiveLinkContext;

    /** ISO 8601 creation timestamp */
    created?:       string|null;

    /** Multi-language description */
    description?:   chargyLib.I18NString;

    /** URLs to images / logos */
    imageURLs?:     string[];

    /** Geographic position of the charging station */
    geoLocation?:   chargyInterfaces.IGeoLocation;

    /** Technical connector data */
    connector?:     IConnector;

    /** Available transport methods for live data */
    liveTransports?: Transport[];

    /** Digital signatures (currently empty or extendable) */
    signatures?:    chargyInterfaces.ISignature[];

}

/** Connector information */
export interface IConnector {
    standard?:             string;
    format?:               string;
    powerType?:            string;
    maxPower?:             string;
}



/** Union type for the different transport variants */
export type Transport =
  | TransportHTTPS
  | TransportHTTPSSE
  | TransportWebsocket;


export interface ITransport {
    url?:  string;
    urls?: Array<ITransportURL|string>;
    totp?: TOTPConfig;
}

export interface TransportHTTPS     extends ITransport {
    type: "https";

    /**
     * How often to ask for the document again, in seconds.
     *
     * This belongs to https alone: a websocket or a server-sent event stream
     * delivers a new document when there is one, and if either ever needs a
     * period of its own it will mean something else than asking again. Absent
     * means: do not poll.
     */
    refresh?: number;
}

export interface TransportHTTPSSE   extends ITransport {
    type: "httpSSE";
}

export interface TransportWebsocket extends ITransport {
    type: "websocket";
}

export interface ITransportURL {
    url:                   string;
    priority?:             number;
    weight?:               number;
}

/** Time-based One-Time Password configuration */
export interface TOTPConfig {
    initialSharedSecret:   string;
    timeStep:              number;
}
