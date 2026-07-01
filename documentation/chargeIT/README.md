# chargeIT Container Format

The chargeIT mobility container is a **JSON envelope for a single charging
session**. It bundles the signed meter values of one session together with the
place, charging-station and meter metadata that the bare signed values do not
carry. The signed values themselves are **not** a chargeIT invention — the
container transports [BSM-WS36A](../BSM/README.md), [EMHCrypt01](../EMH/README.md)
or [ALFEN](../Alfen/README.md) signed meter values and only adds context around
them.

There are **two container variants**:

- the **old** format, which carries no top-level format identifier, and
- the **new** format, identified by a `charging-station-json` `@context`.

Both are handled by `ChargeIT.TryToParseChargeITContainerFormat(...)` in
[`src/chargeIT.ts`](../../src/chargeIT.ts).

## Detection and Routing

| Container | How it is recognised |
|-----------|----------------------|
| New | Top-level `@context` starts with `.../contexts/charging-station-json-v0` or `-v1` (namespaces `lichtblick.de`, `eneco.com`, `chargeit-mobility.com`). Routed directly to the chargeIT parser. |
| Old | No recognised top-level `@context`. Because the format carries no identifier, Chargy runs it as one **candidate** among several parsers (chargeIT, ChargePoint, OCPI) and keeps the result with the highest certainty (see below). |

Inside either container, the **inner** signed meter value's `@context` selects
the actual meter/signature format:

| Signed value `@context` | Meter format |
|-------------------------|--------------|
| `.../contexts/bsm-ws36a-json-v0` / `-v1` (`lichtblick.de`, `eneco.com`, `chargeit-mobility.com`) | [BSM-WS36A](../BSM/README.md) |
| starts with `ALFEN` (or legacy `"format": "ALFEN"`) | [ALFEN](../Alfen/README.md) (the ALFEN line is taken from the value's `payload`) |
| *(no `@context`)* — the old chargeIT meter value format | [EMHCrypt01](../EMH/README.md) |

A container must contain **at least two** signed meter values (start & stop).

## Variant A — Old chargeIT container format

No top-level `@context`. The session metadata lives in `placeInfo`; the readings
in `signedMeterValues`.

```jsonc
{
  "placeInfo": {
    "evseId": "DE*BDO*74778874*1",
    "address": {
      "street":  "Musterstraße 12",
      "zipCode": "74789",
      "town":    "Musterstadt"
    },
    "geoLocation": { "lat": 48.035131, "lon": 10.50635 }
  },
  "signedMeterValues": [
    { /* signed meter value 1 (EMH, BSM or ALFEN) */ },
    { /* signed meter value 2 */ }
  ]
}
```

When the signed values carry no `@context` they are the old chargeIT (EMH) meter
values; their per-value structure (`meterInfo`, `contract`, `measuredValue`,
`additionalInfo`, `signature`, …) is documented in the
[EMHCrypt01 format](../EMH/README.md#container-structure). When they carry a
`bsm-ws36a-json` context they are [BSM](../BSM/README.md) snapshots instead.

## Variant B — New chargeIT container format

Identified by a top-level `charging-station-json` `@context`. The metadata is
split into `chargePointInfo`, `chargingStationInfo` and (optionally) `meterInfo`,
and the session gets an explicit `@id`.

```jsonc
{
  "@context": "https://www.chargeit-mobility.com/contexts/charging-station-json-v1",
  "@id":      "29596515-a37d-433c-a217-4be8e9d090ed",

  "chargePointInfo": {
    "evseId": "DE*BDO*E8025334492*2",
    "placeInfo": {
      "geoLocation": { "lat": 48.03552, "lon": 10.50669 },
      "address": { "street": "Breitenbergstr. 2", "town": "Mindelheim", "zipCode": "87719" }
    }
  },

  "chargingStationInfo": {
    "manufacturer":              "chargeIT mobility GmbH",
    "type":                      "CIT Ladesäule online",
    "serialNumber":              "2020-24-T-042",
    "controllerSoftwareVersion": "v1.2.34",
    "compliance":                "See https://…/type-examination-certificate.pdf"
  },

  "signedMeterValues": [
    { "@context": "https://www.chargeit-mobility.com/contexts/bsm-ws36a-json-v1", /* … */ },
    { "@context": "https://www.chargeit-mobility.com/contexts/bsm-ws36a-json-v1", /* … */ }
  ]
}
```

`chargingStationInfo` additionally recognises optional legal-metrology fields:
`complianceURL`, `conformity`, `conformityURL`, `conformityCertificateId`,
`calibration`, `calibrationURL`, `calibrationCertificateId`. An optional
top-level `meterInfo` (`meterId`, `manufacturer`, `manufacturerURL`, `model`,
`modelURL`, `hardwareVersion`, …) may be present here or inside the individual
signed meter values.

## Certainty-based Selection

Because the old container has no format identifier, the parser does not simply
succeed or fail — it counts structural checks and returns a **certainty** score:

```text
certainty = (numberOfFormatChecks − errors − secondaryErrors) / numberOfFormatChecks
```

`numberOfFormatChecks` starts at `14 + 2 × 39` (container fields plus the two
mandatory signed meter values) and grows by 39 per additional value. Chargy runs
the context-less JSON through the chargeIT, ChargePoint and OCPI parsers and
keeps the best-matching result. Structural problems are collected as `errors`
(and `warnings`) with localized messages via `i18n.json` keys such as
`MissingOrInvalidPlaceInfo`, `MissingOrInvalidEVSEId`, `MissingOrInvalidAddress`,
`MissingOrInvalidGeoLocation` and the per-value
`MissingOrInvalid_SignedMeterValue_*` keys.

## Transport

The container is plain JSON and is accepted as a `.chargy` or `.json` file, and —
like every Chargy input — from archive formats (`zip`, `tar`, `tar.gz`,
`tar.bz2`) or embedded in a PDF/A-3 document.

> Note: the container holds exactly **one** charging session. A collection of
> several sessions uses the separate *Chargy* container
> (`@context` `.../contexts/CTR+json`), not this format.

## Test Fixtures

```text
tests/fixtures/chargeIT/chargeIT-Testdata-02.chargy                                  (old container, EMH values)
tests/fixtures/chargeIT/chargeIT-Testdata-02.{zip,tar,tar.gz,tar.bz2}                (same, archived)
tests/fixtures/chargeIT/BSM/bsm-ws36a-good.json                                      (old container, BSM values)
tests/fixtures/chargeIT/new_container_format/bsm-ws36a-good-new-style-header.json    (new container, BSM values)
tests/fixtures/chargeIT/new_container_format/bsm-ws36a-good-with-non-zero-scale-factors.json
tests/fixtures/chargeIT/new_container_format/ev-charging-chargy-with-display-format-hints.json
```

They are exercised by `tests/chargeIT.tests.ts` (old container incl. all archive
variants, `chargeIT BSM Tests`, and `chargeIT New Container Format Tests`).

## References and Related Formats

- Implementation: [`src/chargeIT.ts`](../../src/chargeIT.ts)
- Carried meter formats: [BSM-WS36A](../BSM/README.md),
  [EMHCrypt01](../EMH/README.md), [ALFEN](../Alfen/README.md)
- The multi-session [Chargy container](../../README.md#supported-data-representations)
  is a different envelope.
