import type {
    Chargy,
    I18NDictionary,
    IValidationRules,
    SignedJSONMessage
} from "@open-charging-cloud/chargy-core";

type ChargyConstructorArguments = ConstructorParameters<typeof Chargy>;

export type ModuleRequire = (id: string) => unknown;

export type ChargyTestDependencies = {
    elliptic:      ChargyConstructorArguments[2];
    moment:        ChargyConstructorArguments[3];
    asn1:          ChargyConstructorArguments[4];
    base32Decode:  ChargyConstructorArguments[5];
};

export function loadChargyTestDependencies(requireModule: ModuleRequire): ChargyTestDependencies {

    return {
        elliptic:      requireModule("elliptic")      as ChargyConstructorArguments[2],
        moment:        requireModule("moment")        as ChargyConstructorArguments[3],
        asn1:          requireModule("asn1.js")       as ChargyConstructorArguments[4],
        base32Decode:  requireModule("base32-decode") as ChargyConstructorArguments[5]
    };

}

export function parseI18NDictionary(json: string): I18NDictionary {
    const parsed: unknown = JSON.parse(json);
    return parsed as I18NDictionary;
}

export function parseValidationRules(json: string): IValidationRules {
    const parsed: unknown = JSON.parse(json);
    return parsed as IValidationRules;
}

export function parseJSONRecord(json: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(json);
    return parsed as Record<string, unknown>;
}

export function parseSignedJSONMessage(json: string): SignedJSONMessage {
    const parsed: unknown = JSON.parse(json);
    return parsed as SignedJSONMessage;
}
