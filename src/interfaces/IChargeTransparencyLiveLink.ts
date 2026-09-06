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

import * as chargyInterfaces              from './chargyInterfaces'
import * as chargyLib                     from './chargyLib'
import type { IDocumentSignaturesResult } from '../DocumentSignatures'


export const ChargeTransparencyLiveLinkContext = "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0";

/** A charging transparency live link document,
 *  which is a single still ongoing charging session
 *  with links to receive live updates on energy metering data
 *  and legally relevant events like errors, power reductions
 *  or tariff changes. */
export interface IChargeTransparencyLiveLink extends chargyLib.JSONObject {

    "@context":                    chargyInterfaces.LinkedDataContext | Array<chargyInterfaces.LinkedDataContext> | undefined;

    /** Multi-language description */
    description?:                  chargyLib.I18NString;


    /** The (legal) time source used */
    timeSource?:                   chargyInterfaces.ITimeSource;

    /** The timestamp of the document creation (ISO 8601) */
    created:                       chargyInterfaces.Timestamp;

    /** The timestamp of the last document update (ISO 8601) */
    lastUpdated?:                  chargyInterfaces.Timestamp | undefined;

    /** The way document reference ids are generated within this document, default: [ "SHA-256", "hex" ] */
    docRefIdGeneration?:           Array<string>              | undefined;

    /** The reference identification (crypto hash) of the document that was updated */
    updates?:                      string                     | undefined;


    /** The charging station operator */
    chargingStationOperator?:      chargyInterfaces.IChargingStationOperator;

    /** The charging station */
    chargingStation?:              chargyInterfaces.IChargingStation;

    /** The charging session identification at the station/operator */
    chargingSessionId?:            string;


    /** The e-mobility provider */
    eMobilityProvider?:            chargyInterfaces.IEMobilityProvider;

    /** EV driver contract information */
    contract?:                     chargyInterfaces.IContract;


    /** Available transport methods for live transparency data */
    liveTransports:                Array<LiveTransports>;

    /** Signed metering values */
    signedMeterValues?:            ISignedMeterValues                                 | undefined;

    /** Charging periods define tariffs and costs. Start-/stop timestamps should match a signed metering value timestamp. */
    chargingPeriods?:              Array<chargyInterfaces.IChargingPeriod>            | undefined;

    /** Legally relevant log messages, e.g. time sync, grid power reduction, ... */
    legallyRelevantLogMessages?:   Array<chargyInterfaces.ILegallyRelevantLogMessage> | undefined;

    /** Support messages between e.g. the EV driver and the CPO */
    supportMessages?:              Array<chargyInterfaces.ISupportMessage>            | undefined;



    /** The way crypto key ids are generated within this document */
    keyIdGeneration?:              Array<string>                                      | undefined;  // [ "SubjectPublicKeyInfo", "DER", "SHA-256", "hex" ]

    /** Digital document signatures, e.g. signed by the charging station operator */
    signatures?:                   Array<chargyInterfaces.IDocumentSignature>         | undefined;



    // Chargy internals!

    /**
     * Non-fatal findings about this document, e.g. that it is unsigned or that
     * a signature did not verify. None of these make the document unusable.
     */
    warnings?:                     Array<chargyInterfaces.IWarning>;

    /**
     * How the signatures over this whole document came out, filled in when the
     * document was read.
     *
     * The signatures cover every property except their own, so this - like
     * every other property added after reading - must be set only *after* the
     * document has been verified. Adding it first would change the very bytes
     * that are verified.
     */
    signatureVerification?:        IDocumentSignaturesResult;

}

export function IsAChargeTransparencyLiveLink(data: unknown): data is IChargeTransparencyLiveLink {

    // A live link is recognised by its context and by the properties every one
    // of them has: when it was created, and where its updates can be fetched.
    // Nothing optional is validated here, so a malformed optional field - a
    // broken transport most of all - must not turn the document into an
    // unrecognised one that then fails as an "unknown format". Each such field
    // is read defensively where it is used, and an entry that does not hold up
    // is dropped there, not here: see chargyInterfaces.isConnector and
    // isLiveTransport for the per-field shape a reader can filter by.
    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    if (data["created"] === undefined || typeof data["created"] !== "string")
        return false;

    if (!Array.isArray(data["liveTransports"]))
        return false;

    const context = data["@context"];
    return context === ChargeTransparencyLiveLinkContext ||
           (Array.isArray(context) && context.every(value => typeof value === "string") &&
            context.includes(ChargeTransparencyLiveLinkContext));

}


/** Union type for the different transport variants */
export type LiveTransports = TransportHTTPS   |
                             TransportHTTPSSE |
                             TransportWebsocket;

export interface ILiveTransport {

    urls?:  Array<chargyInterfaces.URL|chargyInterfaces.IURL> | undefined;
    totp?:  chargyInterfaces.TOTPConfig                       | undefined;

    /**
     * Additional HTTP headers to send with every request to this transport,
     * e.g. an API key or a tenant selector its endpoint expects.
     *
     * Every transport can carry them: an https poll, the opening request of a
     * server-sent event stream, and the handshake of a websocket are all HTTP
     * requests, and all three can face an endpoint that expects a header.
     *
     * They belong to the transport that states them and to no other: a header
     * meant for the operator's polling endpoint has no business being sent to
     * some other transport's URLs.
     */
    customHeaders?:  CustomHeaders | undefined;

}

export interface TransportHTTPS     extends ILiveTransport {

    type: "https";

    /**
     * How often to ask for the document again, in seconds.
     *
     * This belongs to https alone: a websocket or a server-sent event stream
     * delivers a new document when there is one, and if either ever needs a
     * period of its own it will mean something else than asking again.
     *
     * Absent means defaultRefreshSeconds - an https transport is there to be
     * asked, and a document that names one without saying how often still
     * wants its readers to see what the session does next.
     */
    refresh?: chargyInterfaces.DurationSeconds;

}

export interface TransportHTTPSSE   extends ILiveTransport {
    type: "httpSSE";
}

export interface TransportWebsocket extends ILiveTransport {
    type: "websocket";
}

// Whether one entry of liveTransports is a well-formed transport. Exported so a
// consumer can drop the entries that are not, keeping the good ones, rather than
// discarding the whole live link over one bad transport.
export function isLiveTransport(data: unknown): data is LiveTransports {

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
    if (type === "https"                     &&
               data["refresh"] !== undefined &&
        typeof data["refresh"] !== "number")
    {
        return false;
    }

    return (data["urls"] === undefined || (Array.isArray(data["urls"]) && data["urls"].every(chargyInterfaces.isURL))) &&
           (data["totp"] === undefined || chargyInterfaces.isTOTPConfig(data["totp"])) &&
           (data["customHeaders"] === undefined || isCustomHeaders(data["customHeaders"]));

}


/**
 * How often an https transport is asked again when it does not say, in
 * seconds. A charging session that is still running changes every few seconds,
 * so "it did not say" means "the usual period", not "never ask again".
 *
 * A client is expected to clamp what a document states rather than obey it -
 * this default is what it uses when there is nothing to clamp.
 */
export const defaultRefreshSeconds = 10;


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


/** Textual signed meter records, e.g. encodings [ "OCMF", "plain" ]. */
export interface ISignedMeterValues {
    encodings:   Array<string>;
    values:      Array<string>;
}
