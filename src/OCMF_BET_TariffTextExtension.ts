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

import Decimal from 'decimal.js';
import type {
    IChargingTariff,
    IChargingTariffElement,
    IPriceComponent
} from './interfaces/chargyInterfaces';


export type OCMFBonnTariffCode = "001" | "002" | "003";

export interface IOCMFBonnTariffBase {
    raw:            string;
    code:           OCMFBonnTariffCode;
    currency:       "EUR";
    startFeeCents:  number;
}

export interface IOCMFBonnTariff001 extends IOCMFBonnTariffBase {
    code:                           "001";
    energyFeeCentsPerKWh:           number;
    blockingFeeCentsPerMinute:      number;
    blockingFeeStartMinute:         number;
}

export interface IOCMFBonnTariff002 extends IOCMFBonnTariffBase {
    code:                           "002";
    energyFeeCentsPerKWh:           number;
    blockingFeeCentsPerMinute:      number;
    blockingFeeStartsAfterCharging: true;
}

export interface IOCMFBonnTariff003 extends IOCMFBonnTariffBase {
    code:                           "003";
    timeFeeCentsPerMinute:          number;
}

export type IOCMFBonnTariff = IOCMFBonnTariff001 |
                              IOCMFBonnTariff002 |
                              IOCMFBonnTariff003;


export class OCMFBonnTariffParseError extends Error {

    public readonly tariffText: string;

    constructor(tariffText: string,
                message:    string)
    {
        super(message);
        this.name       = "OCMFBonnTariffParseError";
        this.tariffText = tariffText;
    }

}


function parseCents(value:      string,
                    tariffText: string,
                    fieldName:  string): number
{

    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))
        throw new OCMFBonnTariffParseError(tariffText, `${fieldName} must be a non-negative decimal number`);

    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue))
        throw new OCMFBonnTariffParseError(tariffText, `${fieldName} is outside the supported numeric range`);

    return parsedValue;

}


export function parseOCMFBonnTariffText(tariffText: string): IOCMFBonnTariff {

    const fields = tariffText.split(";");
    const code   = fields[0];

    if (fields[1] !== "EUR")
        throw new OCMFBonnTariffParseError(tariffText, "currency must be EUR");

    switch (code)
    {

        case "001":
            if (fields.length !== 6)
                throw new OCMFBonnTariffParseError(tariffText, "profile 001 must contain six fields");
            return {
                raw:                        tariffText,
                code,
                currency:                   "EUR",
                startFeeCents:              parseCents(fields[2] ?? "", tariffText, "W"),
                energyFeeCentsPerKWh:       parseCents(fields[3] ?? "", tariffText, "X"),
                blockingFeeCentsPerMinute:  parseCents(fields[4] ?? "", tariffText, "Y"),
                blockingFeeStartMinute:     parseCents(fields[5] ?? "", tariffText, "Z")
            };

        case "002":
            if (fields.length !== 5)
                throw new OCMFBonnTariffParseError(tariffText, "profile 002 must contain five fields");
            return {
                raw:                               tariffText,
                code,
                currency:                          "EUR",
                startFeeCents:                     parseCents(fields[2] ?? "", tariffText, "W"),
                energyFeeCentsPerKWh:              parseCents(fields[3] ?? "", tariffText, "X"),
                blockingFeeCentsPerMinute:         parseCents(fields[4] ?? "", tariffText, "Y"),
                blockingFeeStartsAfterCharging:    true
            };

        case "003":
            if (fields.length !== 4)
                throw new OCMFBonnTariffParseError(tariffText, "profile 003 must contain four fields");
            return {
                raw:                    tariffText,
                code,
                currency:               "EUR",
                startFeeCents:          parseCents(fields[2] ?? "", tariffText, "W"),
                timeFeeCentsPerMinute:  parseCents(fields[3] ?? "", tariffText, "X")
            };

        default:
            throw new OCMFBonnTariffParseError(tariffText, "unknown Bonn tariff profile");

    }

}


export function tryParseOCMFBonnTariffText(tariffText: string): IOCMFBonnTariff | undefined {

    try {
        return parseOCMFBonnTariffText(tariffText);
    }
    catch (error)
    {
        if (error instanceof OCMFBonnTariffParseError)
            return undefined;
        throw error;
    }

}


function priceComponent(type:     string,
                        price:    Decimal,
                        stepSize: number): IPriceComponent
{
    return {
        type,
        price,
        step_size: stepSize
    };
}


function eurosFromCents(cents: number): Decimal {
    return new Decimal(cents).dividedBy(100);
}


function eurosPerHourFromCentsPerMinute(cents: number): Decimal {
    return eurosFromCents(cents).times(60);
}


export function ocmfBonnTariffToChargingTariff(tariff: IOCMFBonnTariff): IChargingTariff {

    const baseComponents = new Array<IPriceComponent>(
        priceComponent("FLAT", eurosFromCents(tariff.startFeeCents), 1)
    );
    const elements       = new Array<IChargingTariffElement>();

    switch (tariff.code)
    {

        case "001":
            baseComponents.push(priceComponent("ENERGY", eurosFromCents(tariff.energyFeeCentsPerKWh), 1));
            elements.push(
                { price_components: baseComponents },
                {
                    price_components: [
                        priceComponent("PARKING_TIME", eurosPerHourFromCentsPerMinute(tariff.blockingFeeCentsPerMinute), 60)
                    ],
                    restrictions: {
                        min_duration: tariff.blockingFeeStartMinute * 60
                    }
                }
            );
            break;

        case "002":
            baseComponents.push(priceComponent("ENERGY", eurosFromCents(tariff.energyFeeCentsPerKWh), 1));
            elements.push(
                { price_components: baseComponents },
                {
                    price_components: [
                        priceComponent("PARKING_TIME", eurosPerHourFromCentsPerMinute(tariff.blockingFeeCentsPerMinute), 60)
                    ]
                }
            );
            break;

        case "003":
            baseComponents.push(priceComponent("TIME", eurosPerHourFromCentsPerMinute(tariff.timeFeeCentsPerMinute), 60));
            elements.push({ price_components: baseComponents });
            break;

    }

    return {
        "@id":    tariff.raw,
        currency: tariff.currency,
        elements
    };

}
