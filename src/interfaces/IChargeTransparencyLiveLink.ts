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

import type * as chargyInterfaces        from './chargyInterfaces'
import * as chargyLib                    from './chargyLib'
import type { IDocumentSignaturesResult } from '../DocumentSignatures'


export const ChargeTransparencyLiveLinkContext = "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0";


export function isConnector(data: unknown): data is IConnector {
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

// Whether one value of customHeaders is a provider that computes the header
// value per request, rather than the literal value to send.
export function isCustomHeaderValueProvider(data: unknown): data is ICustomHeaderValueProvider {

    return chargyLib.isMandatoryJSONObject(data) &&
           typeof data["valueProvider"] === "string" &&
           (data["parameters"] === undefined || chargyLib.isMandatoryJSONObject(data["parameters"]));

}

// Whether one value of customHeaders is one of the two things a header value
// may be: the literal string, or a provider computing it.
export function isCustomHeaderValue(data: unknown): data is CustomHeaderValue {
    return typeof data === "string" || isCustomHeaderValueProvider(data);
}

// Whether customHeaders is a well-formed set of header values. What a name and
// a value additionally have to look like before they may go into an actual
// request - HTTP has rules of its own about that - is the sending client's
// question, not this one.
export function isCustomHeaders(data: unknown): data is CustomHeaders {

    return chargyLib.isMandatoryJSONObject(data) &&
           Object.values(data).every(isCustomHeaderValue);

}

// Whether one entry of liveTransports is a well-formed transport. Exported so a
// consumer can drop the entries that are not, keeping the good ones, rather than
// discarding the whole live link over one bad transport.
export function isTransport(data: unknown): data is Transport {

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

    // The same for the custom headers: only https declares them, so only there
    // are they validated.
    if (type === "https"                    &&
        data["customHeaders"] !== undefined &&
        !isCustomHeaders(data["customHeaders"]))
    {
        return false;
    }

    return (data["url"]  === undefined || typeof data["url"] === "string") &&
           (data["urls"] === undefined || (Array.isArray(data["urls"]) && data["urls"].every(isTransportURL))) &&
           (data["totp"] === undefined || isTOTPConfig(data["totp"]));

}

export function IsAChargeTransparencyLiveLink(data: unknown): data is IChargeTransparencyLiveLink {

    // A live link is identified by its context alone. Everything below it is
    // optional, so a malformed optional field - a broken transport most of all -
    // must not turn the document into an unrecognised one that then fails as an
    // "unknown format". Each such field is read defensively where it is used,
    // and an entry that does not hold up is dropped there, not here: see
    // isConnector and isTransport for the per-field shape a reader can filter by.
    return chargyLib.isMandatoryJSONObject(data) &&
           data["@context"] === ChargeTransparencyLiveLinkContext;

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

    /**
     * How the signatures over this whole document came out, filled in when the
     * document was read.
     *
     * The signatures cover every property except their own, so this - like
     * every other property added after reading - must be set only *after* the
     * document has been verified. Adding it first would change the very bytes
     * that are verified.
     */
    signatureVerification?: IDocumentSignaturesResult;

    /**
     * Non-fatal findings about this document, e.g. that it is unsigned or that
     * a signature did not verify. None of these make the document unusable.
     */
    warnings?:      Array<chargyInterfaces.IWarning>;

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

    /**
     * Additional HTTP headers to send with every request to this transport,
     * e.g. an API key or a tenant selector its endpoint expects.
     *
     * They belong to this transport and to no other: a header meant for the
     * operator's polling endpoint has no business being sent to some other
     * transport's URLs. Like refresh, they are declared - and validated - on
     * https alone; the other two transports do not open a request a client
     * shapes header by header.
     */
    customHeaders?: CustomHeaders;
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

/**
 * The custom HTTP headers of a transport, by header name.
 *
 * The names are the header names as they are to be sent; HTTP compares them
 * case-insensitively, so a document that names one header twice in different
 * spellings names one header - which one wins is the sending client's rule,
 * not this format's.
 */
export type CustomHeaders = Record<string, CustomHeaderValue>;

/**
 * What a custom header carries: either the literal string to send, or a
 * provider that computes the value per request - a one-time password, say,
 * which would be stale the moment it was written into a document.
 */
export type CustomHeaderValue = string | ICustomHeaderValueProvider;

/**
 * A value computed per request rather than stated.
 *
 * Version 1.0 defines the shape, not the providers: what "TOTP" means, and
 * what its parameters are called, needs an external profile or agreement, the
 * same way the TOTP configuration does. ChargyCore validates the shape and
 * computes no values - a client that does not know a provider sends no header
 * for it rather than sending the description of one.
 */
export interface ICustomHeaderValueProvider {
    valueProvider:         string;
    parameters?:           chargyLib.JSONObject;
}
