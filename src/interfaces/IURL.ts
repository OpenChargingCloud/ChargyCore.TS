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

import isURL from "is-url-superb";

import * as chargyLib from "./chargyLib";


export const URLContext = "https://open.charging.cloud/contexts/URL";

export type URLResolver = (url: IURL) => IURL | Promise<IURL>;


export function IsValidURL(value: string): boolean {

    if (!isURL(value))
        return false;

    const protocol = new URL(value).protocol;

    return protocol === "http:" || protocol === "https:";

}

export function IsAURL(data: unknown): data is IURL {

    if (!chargyLib.isMandatoryJSONObject(data))
        return false;

    return data["@context"]   === URLContext &&
           typeof data["url"] === "string" &&
           IsValidURL(data["url"]) &&
          (data["method"]     === undefined || typeof data["method"]     === "string") &&
          (data["acceptType"] === undefined || typeof data["acceptType"] === "string") &&
          (data["actions"]    === undefined ||
              (Array.isArray(data["actions"]) && data["actions"].every(action => typeof action === "string"))) &&
          (data["serviceTypes"] === undefined ||
              (Array.isArray(data["serviceTypes"]) && data["serviceTypes"].every(serviceType => typeof serviceType === "string"))) &&
          (data["serviceData"] === undefined || chargyLib.isMandatoryJSONObject(data["serviceData"]));

}

export interface IURL extends chargyLib.JSONObject {

    "@context":     typeof URLContext;
    url:            string;
    method?:        string;
    acceptType?:    string;
    actions?:       Array<string>;
    serviceTypes?:  Array<string>;
    serviceData?:   chargyLib.JSONObject;

}
