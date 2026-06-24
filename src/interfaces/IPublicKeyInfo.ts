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

import      * as chargyLib         from './chargyLib'
import type * as chargyInterfaces  from './chargyInterfaces'


export enum PublicKeyFormats {
    DER         = "DER",
    XY          = "XY"
}

export function IsAPublicKeyLookup(data: unknown): data is IPublicKeyLookup
{

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    // if (!chargyInterfaces.isString(data["begin"]))  return false;
    // if (!chargyInterfaces.isString(data["end"]))    return false;

    return Array.isArray(data["publicKeys"]);

}

export interface IPublicKeyLookup extends chargyLib.JSONObject
{
    publicKeys:                 Array<IPublicKey>;
    status?:                    chargyInterfaces.SessionVerificationResult;
}





export function IsAPublicKey(data: unknown): data is IPublicKey
{

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    //if (typeof JSONObject["@id"]      !== "string") return false;

    if (data["@context"] !== undefined &&
       !chargyLib.isStringOrStringArray(data["@context"])) {
       return false;
    }

    if (!isPublicKeySubject(data["subject"]))
        return false;

    if (data["value"] !== undefined &&
       !chargyLib.isString(data["value"])) {
        return false;
    }

    if (data["value"] === undefined &&
       (data["x"]     === undefined ||
        data["y"]     === undefined)) {
        return false;
    }

    if (data["value"] !== undefined &&
       !chargyLib.isStringOrOIDInfo(data["algorithm"])) {
        return false;
    }

    if (data["certainty"] !== undefined &&
        (typeof data["certainty"] !== "number" ||
        !Number.isFinite(data["certainty"]))) {
        return false;
    }

    if (data["type"] !== undefined &&
        !chargyLib.isStringOrOIDInfo(data["type"])) {
        return false;
    }

    if (data["encoding"] !== undefined &&
        typeof data["encoding"] !== "string") {
        return false;
    }

    if (data["signatures"] !== undefined &&
       (!Array.isArray(data["signatures"]) ||
        !data["signatures"].every(IsAPublicKeySignature))) {
        return false;
    }

    return true;

}

export function isPublicKeySubject(data: unknown): boolean {

    if (data === undefined)
        return true;

    if (chargyLib.isStringOrStringArray(data))
        return true;

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    return Object.values(data).every(value =>
        typeof value === "string" ||
        chargyLib.isStringOrStringArray(value)
    );

}




export function IsAPublicKeySignature(data: unknown): data is IPublicKeySignature
{

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    if (!chargyLib.isOptionalString(data["@id"]))
        return false;

    if (data["@context"] !== undefined &&
       !chargyLib.isStringOrStringArray(data["@context"]))
        return false;

    if (!chargyLib.isOptionalStringOrOIDInfo(data["algorithm"]))
        return false;

    if (!chargyLib.isOptionalString(data["format"]))
        return false;

    if (!chargyLib.isOptionalString(data["encoding"]))
        return false;

    if (data["value"] !== undefined &&
       !chargyLib.isString(data["value"]))
        return false;

    if (data["publicKey"] !== undefined &&
       !chargyLib.isEncodedValue(data["publicKey"]))
        return false;

    if (data["signature"] !== undefined &&
       !chargyLib.isEncodedValue(data["signature"]))
        return false;

    if (!chargyLib.isOptionalString(data["timestamp"]))
        return false;

    if (!chargyLib.isOptionalString(data["issuer"]))
        return false;

    if (!chargyLib.isOptionalString(data["signer"]))
        return false;

    if (!chargyLib.isOptionalString(data["notBefore"]))
        return false;

    if (!chargyLib.isOptionalString(data["notAfter"]))
        return false;

    if (!chargyLib.isOptionalStringArray(data["keyUsage"]))
        return false;

    if (data["operations"] !== undefined &&
       !chargyLib.isMandatoryJSONObject(data["operations"]))
        return false;

    if (data["comment"] !== undefined &&
       !chargyLib.isMandatoryJSONObject(data["comment"]))
        return false;

    return data["value"]     !== undefined ||
           data["signature"] !== undefined ||
           data["algorithm"] !== undefined ||
           data["timestamp"] !== undefined ||
           data["issuer"]    !== undefined ||
           data["signer"]    !== undefined ||
           data["keyUsage"]  !== undefined;

}




export interface IPublicKey extends chargyLib.JSONObject
{
    "@context"?:                string | Array<string>                        | undefined;
    subject?:                   string | Array<string> | chargyLib.JSONObject | undefined;
    algorithm:                  string | chargyLib.IOIDInfo;
    type?:                      string | chargyLib.IOIDInfo;
    format?:                    string                                        | undefined;     // e.g. "DER" | "rs"
    encoding?:                  string                                        | undefined;     // e.g. "hex" | "base64"
    value:                      string;
    signatures?:                Array<IPublicKeySignature>;
    certainty?:                 number                                        | undefined;
}

// export interface IPublicKeyInfo extends chargyLib.JSONObject
// {
//     "@id"?:                     string; // Just for merging with IChargeTransparencyRecord!
//     "@context":                 string;
//     subject?:                   string; // |any
//     type?:                      string|chargyInterfaces.IOIDInfo;
//     algorithm:                  string|chargyInterfaces.IOIDInfo;
//     value:                      string;
//     encoding?:                  string;
//     signatures?:                Array<IPublicKeysignature>;
//     certainty?:                 number;
// }

export interface IPublicKeyXY extends IPublicKey
{
    x:  string;
    y:  string;
}

export function IsAPublicKeyXY(data: unknown): data is IPublicKeyXY
{

    if (!IsAPublicKey(data))
        return false;

    if (!chargyLib.isString(data["x"])) {
        return false;
    }

    if (!chargyLib.isString(data["y"])) {
        return false;
    }

    return true;

}



export interface IPublicKeySignature extends chargyLib.JSONObject
{
    "@id"?:                     string | undefined;
    "@context"?:                string | Array<string> | undefined;
    algorithm?:                 string | chargyLib.IOIDInfo | undefined;
    format?:                    string        | undefined;     // e.g. "DER" | "rs"
    encoding?:                  string        | undefined;     // e.g. "hex" | "base64"
    value?:                     string        | undefined;
    publicKey?:                 string | {
        format?:                string        | undefined;
        encoding?:              string        | undefined;
        value:                  string;
    } | undefined;
    signature?:                 string | {
        format?:                string        | undefined;
        encoding?:              string        | undefined;
        value:                  string;
    } | undefined;
    timestamp?:                 string        | undefined;
    issuer?:                    string        | undefined;
    signer?:                    string        | undefined;
    notBefore?:                 string        | undefined;
    notAfter?:                  string        | undefined;
    keyUsage?:                  Array<string> | undefined;
    operations?:                chargyLib.JSONObject | undefined;
    comment?:                   chargyLib.JSONObject | undefined;
}
