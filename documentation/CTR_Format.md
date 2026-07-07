# Charge Transparency Record (CTR) Format

**Status:** Draft specification of a long-standing implementation format  
**Version:** 0.1  
**Primary context:** `https://open.charging.cloud/contexts/CTR+json`  
**Common file extension:** `.chargy`

## 1. Introduction

The Charge Transparency Record (CTR) is a JSON-based exchange and processing
format for transparent e-mobility charging data. It combines one or more
charging sessions with signed measurements and the metadata required to
interpret and verify them.

CTR has been used by Chargy implementations for many years. This document is
marked as a draft because the implemented format predates a complete standalone
specification and contains conventions that still require consolidation.

The goals of this document are to:

- describe the currently implemented CTR object model;
- distinguish portable wire data from in-memory and verifier-generated data;
- define recommended serialization and reference rules;
- explain how source-specific signatures fit into the common model;
- provide a stable basis for schemas, contexts, and future revisions; and
- identify legacy variations and unresolved design decisions explicitly.

CTR is not a signature algorithm. It is a common envelope and normalized data
model capable of carrying measurements signed in different vendor or standard
formats.

### 1.1 Consumer and user-experience motivation

The primary user of Chargy is not necessarily a metrology expert, charging
station vendor, or cryptographer. It is the EV driver who wants to understand
and verify a charging invoice.

That distinction is fundamental to CTR. Most meter and vendor formats answer a
narrow technical question:

> Is this particular measurement payload cryptographically intact according to
> its source-specific signature scheme?

The consumer's question is broader:

> Can I understand and verify why I was invoiced this amount for this charging
> process?

A valid start or stop reading is necessary evidence in many charging scenarios,
but it is not a complete consumer answer. The driver also needs the relationship
between measurements, charging session, station, EVSE, authorization, tariff,
time, parking, calculated costs, operator, and invoice.

CTR exists to assemble those otherwise fragmented facts into one common,
vendor-independent representation that transparency software can explain.

### 1.2 Invoice-first workflow

Consumer charging invoices are commonly delivered as PDF documents, often as a
monthly invoice containing multiple charging sessions. The intended primary UX
is therefore invoice-first rather than file-format-first:

1. The driver receives an invoice as a PDF/A-3 document.
2. The driver opens or drops that document into Chargy.
3. Chargy extracts the embedded `.chargy`, JSON, XML, or other transparency
   evidence from the PDF attachment layer.
4. Chargy parses the source evidence into CTR or reads an embedded CTR directly.
5. Chargy verifies signatures, keys, pagination, consistency, and applicable
   validation rules.
6. Chargy presents the result in terms meaningful to the driver: charging
   location, session interval, measured energy, applicable tariff and costs,
   detected problems, and the relationship to the invoice.

PDF/A-3 is particularly suitable for this workflow because the human-readable
invoice and its machine-readable evidence can travel as one document. The PDF
remains the familiar presentation and archival artifact; the embedded CTR or
source data provides deterministic input for transparency software.

ChargyCore currently extracts supported attachments from PDF/A-3 documents and
validates the contained transparency data. Complete semantic reconciliation of
every visible invoice line, tax item, discount, roaming fee, and embedded CTR is
an intended higher-level workflow and depends on sufficiently precise invoice
and tariff mappings. This document does not claim that every PDF invoice is
already machine-verifiable merely because it contains a CTR.

### 1.3 From signature verification to invoice transparency

CTR enables several layers of consumer verification:

| Layer | Consumer question | Typical evidence |
|---|---|---|
| Presentation | What is the operator charging me for? | Human-readable PDF invoice. |
| Session identity | Which charging process does the item refer to? | Session, station, EVSE, authorization, and time references. |
| Measurement integrity | Were the relevant meter values altered? | Original payload, signatures, public keys, and signature profile. |
| Measurement completeness | Are start, stop, and required intermediate records present? | Pagination, counters, chains, and format-specific rules. |
| Tariff application | Which price components and periods were applied? | Tariff, charging periods, taxes, parking, and cost components. |
| Invoice reconciliation | Does the invoiced amount follow from the evidence? | Mapped invoice lines, measurements, tariff calculations, and rounding rules. |
| Explanation | What failed, and what does it mean for me? | Structured verifier results rendered in clear language. |

This layered model avoids a misleading binary UX. A meter signature can be
valid while the wrong tariff was applied, a session was assigned to the wrong
contract, required evidence is missing, or an invoice calculation is incorrect.
Conversely, descriptive metadata can be incomplete while the signed meter value
itself remains cryptographically valid. Chargy SHOULD communicate these outcomes
separately.

### 1.4 Why one common CTR model improves UX

Without CTR, the user interface would need to expose the terminology and data
layout of every vendor format. That would force drivers to understand OBIS
codes, signature encodings, source-specific status bits, raw scalers, container
boundaries, and public-key formats before they could assess an invoice.

CTR provides a common semantic layer so that Chargy can:

- display different source formats consistently;
- group measurements into complete charging sessions;
- associate technical identifiers with understandable station and operator
  information;
- distinguish measured quantities from billed quantities;
- show which data was signed and which data is descriptive;
- explain missing or invalid evidence without requiring cryptographic expertise;
- retain original source bytes for expert verification and disputes; and
- support accessibility and localization independently of the meter format.

The original evidence remains authoritative for signature verification. CTR is
the normalized explanation and correlation layer around that evidence, not a
replacement that discards source-specific details.

### 1.5 AFIR open data as consumer context

[Regulation (EU) 2023/1804](https://eur-lex.europa.eu/eli/reg/2023/1804/oj),
the Alternative Fuels Infrastructure Regulation (AFIR), strengthens the
consumer-information context around publicly accessible charging. Its pricing
rules require relevant ad hoc price information to be available before a
charging session. Article 20 also establishes access to static and dynamic data
about alternative-fuels infrastructure.

Depending on the applicable data profile, this includes information such as:

- geographic location and opening hours;
- charging-station operator contact information;
- operator and infrastructure identifiers;
- connector type and AC/DC classification;
- maximum station and charging-point power;
- operational status and current availability;
- ad hoc price; and
- whether supplied electricity is reported as 100% renewable.

[Commission Implementing Regulation (EU) 2025/655](https://eur-lex.europa.eu/eli/reg_impl/2025/655/oj)
adds format, accessibility, quality, and update-frequency specifications,
including the use of the DATEX II alternative-fuels data model.

This information is highly relevant to the EV-driver experience. It can help
Chargy explain where charging occurred, which physical connector and operator
were involved, what capabilities were advertised, and which public price
information may have been available.

AFIR data and CTR nevertheless serve different primary timelines:

| Data | Primary use |
|---|---|
| AFIR static and dynamic data | Discovery, comparison, and information before or during charging. |
| CTR transaction evidence | Retrospective explanation and verification of a completed charging process and invoice. |

Dynamic AFIR data retrieved after a charging session does not necessarily prove
what was displayed or applicable at the time of charging. If AFIR-derived data
is included in a CTR, a future profile SHOULD record at least its source,
retrieval time, observation time, dataset identifier or version, and whether it
was merely informative or part of the contractual tariff evidence.

The integration of AFIR open data into CTR and Chargy's consumer-facing
verification workflow is work in progress. Current CTR fields already provide
useful homes for station location, operator, connector, power-related metadata,
and tariffs, but a complete normative mapping to AFIR and DATEX II has not yet
been defined. Implementations MUST NOT present current open data as historical
or signed transaction evidence unless its provenance and applicable time are
demonstrated.

### 1.6 Intended UX outcome

The successful result of CTR processing should not merely be a green signature
icon. Chargy should enable the driver to answer, in understandable language:

- Where and when did I charge?
- Which charging station, EVSE, connector, operator, and provider were involved?
- Which meter produced the values?
- How much energy, time, or parking was measured and billed?
- Which tariff and price components were applied?
- Do the invoice totals follow from the available evidence and rounding rules?
- Which evidence was cryptographically protected?
- Is any required measurement, event, key, or metadata missing?
- Did a fault or significant condition affect the charging process?
- What can and cannot be concluded from the verification result?

This consumer-oriented explanation is the principal reason for the richer CTR
model. Cryptographic verification is an essential mechanism; understandable
invoice transparency is the product experience.

## 2. Conformance Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear
in all capitals.

This document describes both existing practice and recommendations for a future
normative profile. Text explicitly labelled as legacy or runtime-only is not a
wire-format requirement.

## 3. Scope

CTR can represent:

- one or more charging sessions;
- charging-station, EVSE, connector, and meter topology;
- signed start, intermediate, and stop measurements;
- public keys and signature metadata;
- operators, e-mobility providers, contracts, and authorizations;
- tariffs, charging periods, costs, and parking information;
- transparency software and support information;
- source-format-specific extensions; and
- verification results produced by Chargy.

CTR does not prescribe:

- one mandatory meter signature algorithm;
- one mandatory public-key infrastructure;
- one tariff or roaming protocol;
- the legal validity of a charging transaction; or
- a guarantee that source data was correct before it was signed.

## 4. Processing Layers

The same TypeScript object family is currently used at several processing
stages. A portable specification needs to distinguish them.

### 4.1 Source CTR

A JSON document supplied to Chargy using the CTR context. It contains portable
source evidence and descriptive metadata. It MUST NOT contain DOM elements,
class instances, circular references, exceptions, or binary file handles.

### 4.2 Normalized CTR

A common CTR representation produced by an adapter after parsing OCMF, SAFE,
EDL40, ChargePoint, PCDF, or another supported source format. It can preserve
source-specific fields needed for later cryptographic verification.

### 4.3 Verified CTR

A normalized CTR enriched with verification status, warnings, errors, linked
objects, and other derived information. These fields describe a particular
verification run and are not original evidence from the charging device.

Applications MUST NOT treat a serialized verification result as a replacement
for independently verifying the underlying evidence.

## 5. Format Identification

A native CTR document SHOULD use:

```json
{
  "@context": "https://open.charging.cloud/contexts/CTR+json"
}
```

`@context` MAY be an array when extensions are used. Consumers MUST preserve
unknown contexts and SHOULD use them to select the correct semantic and
cryptographic profile.

Nested objects can use more specific contexts, especially for meter or session
signature formats:

```json
{
  "@context": "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/OCMFv1.0+json"
}
```

A context identifier MUST NOT require a network request during verification.
Implementations SHOULD ship the context definitions and profiles they support.

## 6. JSON Representation

CTR uses JSON objects, arrays, strings, booleans, finite numbers, and `null`.
Portable documents MUST NOT contain JavaScript-specific values such as
`undefined`, `NaN`, `Infinity`, `BigInt`, functions, or cyclic objects.

### 6.1 Timestamps

Timestamps SHOULD use RFC 3339 with an explicit `Z` or numeric UTC offset:

```text
2026-07-04T15:42:31.421+02:00
2026-07-04T13:42:31.421Z
```

Timestamp precision MUST NOT imply an accuracy that the underlying clock cannot
provide. Time-source and quality metadata are specified in
[CTR Time Synchronization Sources](CTR_Time_Synchronization_Sources.md).

### 6.2 Decimal values

Measurement and price values SHOULD be serialized as decimal strings when exact
decimal reproduction matters:

```json
{
  "value": "86.600"
}
```

Consumers MAY accept JSON numbers for compatibility but MUST avoid silent
binary floating-point changes when reconstructing signed input.

### 6.3 Internationalized strings

Internationalized text is represented as an object keyed by language tag:

```json
{
  "de": "Bezogene Energiemenge",
  "en": "Imported energy"
}
```

Applications SHOULD use BCP 47 language tags. Machine decisions MUST NOT depend
on localized text.

## 7. Object Model Overview

```text
Charge Transparency Record
├── parties and contracts
├── charging infrastructure
│   └── charging station
│       └── EVSE
│           ├── connector
│           └── energy meter
├── public keys
├── tariffs
├── charging sessions
│   ├── authorization
│   ├── charging periods and costs
│   ├── measurements
│   │   └── measurement values and signatures
│   ├── parking
│   └── legally relevant events
└── optional verifier-generated results
```

Objects form an entity graph even when serialized as nested JSON. Stable IDs
are therefore important for references, merging, and deduplication.

## 8. Minimal CTR

The current Chargy recognizer identifies a CTR-like object by the presence of
`begin` and `chargingSessions`. The TypeScript model additionally defines
`@id`, `@context`, and `certainty`. For a portable native CTR, this draft
recommends the following minimum instead:

```json
{
  "@id": "urn:ctr:example-123",
  "@context": "https://open.charging.cloud/contexts/CTR+json",
  "begin": "2026-07-04T13:00:00Z",
  "end": "2026-07-04T14:00:00Z",
  "chargingSessions": [
    {
      "@id": "urn:charging-session:example-123",
      "begin": "2026-07-04T13:00:00Z",
      "end": "2026-07-04T14:00:00Z",
      "measurements": []
    }
  ]
}
```

For this draft profile:

- `@id`, `@context`, `begin`, and `chargingSessions` SHOULD be present;
- `chargingSessions` SHOULD contain at least one session;
- `end` MAY be absent for an open or incomplete record; and
- `certainty` is a parser result and SHOULD NOT be required from a producer.

## 9. Top-Level Properties

| Property | Source/Wire | Description |
|---|---:|---|
| `@id` | RECOMMENDED | Stable identifier of the CTR. |
| `@context` | RECOMMENDED | CTR context or array of contexts. |
| `begin` | RECOMMENDED | Earliest time covered by the record. |
| `end` | OPTIONAL | End of the covered interval. |
| `description` | OPTIONAL | Internationalized description. |
| `contracts` | OPTIONAL | Contracts referenced by sessions. |
| `chargingStationOperators` | OPTIONAL | Charging-station operators and contact metadata. |
| `chargingPools` | OPTIONAL | Charging pools or sites. |
| `chargingStations` | OPTIONAL | Stations, EVSEs, connectors, and meters. |
| `chargingTariffs` | OPTIONAL | Tariffs referenced by sessions or infrastructure. |
| `publicKeys` | OPTIONAL | Keys needed to verify signatures. |
| `chargingSessions` | RECOMMENDED | Charging sessions contained in the CTR. |
| `eMobilityProviders` | OPTIONAL | E-mobility providers. |
| `mediationServices` | OPTIONAL | Consumer mediation or dispute services. |
| `legallyRelevantLogMessages` | DRAFT EXTENSION | Canonical event store described by the log specification. |
| `legallyRelevantLogStreams` | DRAFT EXTENSION | Integrity-protected log-stream manifests. |
| `timeSynchronizations` | DRAFT EXTENSION | Current synchronization state for relevant clocks. |
| `timeQualityPolicies` | DRAFT EXTENSION | Policies used to classify clock quality. |
| `verificationResult` | DERIVED | Overall verifier result. |
| `warnings` | DERIVED | Non-fatal verifier findings. |
| `errors` | DERIVED | Verifier errors. |
| `status` | DERIVED | Summary verification status. |
| `certainty` | DERIVED | Parser confidence, normally in the interval 0 to 1. |
| `invalidDataSets` | RUNTIME | Input files or fragments that could not be processed. |

The current TypeScript interface does not yet contain all draft extension
properties. Their appearance in this table reserves their intended top-level
placement; it is not an implementation claim.

## 10. Identifiers and References

### 10.1 Identifiers

`@id` values SHOULD be globally unique URIs or stable identifiers within the
producer's namespace. Consumers MUST compare them as exact strings unless a
specific identifier profile defines canonicalization.

### 10.2 Wire references

Portable CTR documents SHOULD refer to related objects by ID:

```json
{
  "chargingStationId": "urn:station:DE*ABC*E123",
  "EVSEId": "DE*ABC*E123*1",
  "meterId": "urn:meter:240008S"
}
```

### 10.3 Hydrated runtime references

Chargy can add direct object references after parsing, such as
`chargingStation`, `EVSE`, `meter`, `Connector`, `chargingSession`, or `ctr`.
Those references can be cyclic and MUST NOT be serialized, hashed, or signed.

### 10.4 Legacy embedding

Historical CTR documents often embed station, EVSE, and meter objects in one
another. Consumers SHOULD accept this representation. A future canonical wire
profile SHOULD define one authoritative location per entity and use IDs for all
other relationships.

## 11. Charging Infrastructure

The infrastructure graph normally follows:

```text
charging station operator
└── charging pool
    └── charging station
        └── EVSE
            ├── connector
            └── energy meter
```

### 11.1 Charging station

A station can provide:

- manufacturer, model, hardware, and firmware information;
- legal-compliance and calibration metadata;
- address and geographic coordinates;
- operator and pool references;
- EVSE and meter references;
- tariffs; and
- public keys.

### 11.2 EVSE

An EVSE has a stable `@id` and can reference its station, pool, meters,
connectors, tariffs, and public keys.

### 11.3 Connector

A connector can describe its identifier, connector type, cable, resistance,
and loss-compensation information. Connector metadata is descriptive unless a
signature profile explicitly includes it in signed input.

### 11.4 Energy meter

An energy meter has a stable `@id` and may provide:

- manufacturer, model, hardware, and firmware information;
- legal-compliance metadata;
- station and EVSE relationships;
- signature profile metadata; and
- one or more public keys.

## 12. Charging Session

### 12.1 Session example

```json
{
  "@id": "urn:charging-session:4711",
  "@context": "https://open.charging.cloud/contexts/SessionSignatureFormats/OCMFv1.0+json",
  "begin": "2026-07-04T13:00:00Z",
  "end": "2026-07-04T14:00:00Z",
  "internalSessionId": "4711",
  "chargingStationOperatorId": "urn:cso:example",
  "chargingStationId": "urn:station:DE*ABC*E123",
  "EVSEId": "DE*ABC*E123*1",
  "ConnectorId": "1",
  "meterId": "urn:meter:240008S",
  "tariffId": "urn:tariff:standard-2026",
  "authorizationStart": {
    "@id": "urn:authorization:pseudonymous-token",
    "type": "RFID",
    "timestamp": "2026-07-04T12:59:55Z"
  },
  "chargingProductRelevance": {
    "energy": "Important",
    "time": "Informative",
    "parking": "Ignored",
    "sessionFee": "Informative"
  },
  "measurements": []
}
```

### 12.2 Session properties

| Property | Description |
|---|---|
| `@id` | Stable session identifier. |
| `@context` | Optional session or signature profile. |
| `begin`, `end` | Session interval. |
| `internalSessionId` | Identifier used by the source system. |
| `chargingProductRelevance` | Importance of energy, time, parking, and session fee. |
| `chargingStationOperatorId` | Referenced operator. |
| `chargingPoolId` | Referenced pool or site. |
| `chargingStationId` | Referenced station. |
| `EVSEId` | Referenced EVSE. |
| `ConnectorId` | Referenced connector. The capitalized spelling is existing practice. |
| `meterId` | Primary meter reference where applicable. |
| `tariffId`, `chargingTariffs` | Referenced or embedded tariff data. |
| `chargingPeriods` | Tariff periods and their calculated costs. |
| `totalCosts` | Aggregated session costs. |
| `authorizationStart`, `authorizationStop` | Start and stop authorization evidence. |
| `product` | Charging-product reference. |
| `measurements` | Measurements belonging to the session. |
| `legallyRelevantLogMessages` | Legacy/session-local event collection. |
| `parking` | Parking intervals. |
| `transparencyInfos` | URLs, compatible software, and explanatory text. |
| `original` | Preserved original payload, often encoded. |
| `signature`, `hashValue` | Session-level source signature or hash. |
| `verificationResult` | Derived verifier result. |

Runtime properties such as `ctr`, `GUI`, `method`, and hydrated entity objects
MUST NOT appear in a canonical wire document.

## 13. Authorization and Contracts

An authorization can identify the authorization event, type, timestamp,
operator, roaming network, and e-mobility provider. Contract and authorization
identifiers SHOULD be pseudonymous when their real value is not necessary for
verification.

Start and stop authorizations are independent because they can use different
methods or be generated by different systems.

## 14. Measurements

A session can contain multiple measurement series, for example imported energy,
exported energy, power, time, or other signed phenomena.

### 14.1 Measurement example

```json
{
  "@context": "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EMHCrypt01+json",
  "energyMeterId": "urn:meter:240008S",
  "name": "ENERGY_TOTAL",
  "obis": "1-0:1.8.0*255",
  "unit": "kWh",
  "unitEncoded": 30,
  "valueType": "counter",
  "scale": -3,
  "verifyChain": true,
  "signatureInfos": {
    "hash": "SHA256",
    "hashTruncation": 24,
    "algorithm": "ECC",
    "curve": "secp192r1",
    "format": "rs",
    "encoding": "hex"
  },
  "values": []
}
```

### 14.2 Measurement properties

| Property | Requirement | Description |
|---|---:|---|
| `energyMeterId` | REQUIRED | Meter that produced the measurement. |
| `name` | REQUIRED | Machine-readable or legacy measurement name. |
| `obis` | REQUIRED | OBIS identifier when applicable; legacy formats may use another identifier. |
| `unit` | OPTIONAL | Human-readable unit. |
| `unitEncoded` | OPTIONAL | Source-format numeric unit code. |
| `valueType` | OPTIONAL | Source-format value classification. |
| `scale` | REQUIRED IN CURRENT MODEL | Source-format scale or normalized scale metadata. |
| `phenomena` | OPTIONAL | Additional measured phenomena or source metadata. |
| `verifyChain` | OPTIONAL | Whether the signature profile expects chained verification. |
| `signatureInfos` | OPTIONAL | Hash, algorithm, curve, format, and encoding metadata. |
| `values` | REQUIRED | Ordered measurement values. |
| `verificationResult` | DERIVED | Series-level verification result. |

### 14.3 Scale semantics

Historical adapters do not all use `scale` identically. Some retain a raw
integer and its source scaler; others expose an already normalized decimal while
preserving source scale metadata. Consumers MUST therefore use the selected
measurement context or signature profile and MUST NOT blindly apply `scale` a
second time.

A future CTR profile should separate:

- the normalized physical decimal value;
- the source integer or encoded value; and
- the scale used to reconstruct signed bytes.

## 15. Measurement Values

### 15.1 Value example

```json
{
  "timestamp": "2026-07-04T13:00:00Z",
  "value": "74600",
  "statusMeter": "00",
  "secondsIndex": 123456,
  "paginationId": "00001840",
  "logBookIndex": "0042",
  "statusAdapter": "00",
  "signatures": [
    {
      "algorithm": "ECC",
      "format": "rs",
      "r": "11...",
      "s": "22..."
    }
  ]
}
```

### 15.2 Value properties

| Property | Requirement | Description |
|---|---:|---|
| `timestamp` | REQUIRED | Timestamp associated with the value. |
| `value` | REQUIRED | Exact decimal measurement value. |
| `value_displayPrefix` | OPTIONAL | UI display prefix hint. |
| `value_displayPrecision` | OPTIONAL | UI precision hint; not measurement accuracy. |
| `statusMeter` | OPTIONAL | Meter status from the source format. |
| `secondsIndex` | OPTIONAL | Monotonic timer or uptime index. |
| `paginationId` | OPTIONAL | Source pagination or sequence identifier. |
| `logBookIndex` | OPTIONAL | Source logbook identifier. |
| `statusAdapter` | OPTIONAL | Adapter or controller status. |
| `signatures` | OPTIONAL | One or more source signatures. |
| `errors`, `warnings`, `result` | DERIVED | Verification output. |

The meaning, base, width, wrap behaviour, and signed representation of
`paginationId` are signature-profile specific. Generic CTR processing MUST NOT
assume that every string is a decimal integer.

Runtime links such as `measurement`, `method`, and `previousValue` MUST NOT be
serialized.

## 16. Signatures

### 16.1 Signature levels

CTR can carry signatures at several levels:

- public-key signatures or certificates;
- individual measurement-value signatures;
- signatures covering a container of measurement values;
- session-level signatures; and
- signatures covering an entire JSON object or CTR envelope.

The presence of a `signatures` array does not by itself define coverage. The
applicable `@context`, `signatureInfos`, and source-format profile determine the
exact signed bytes and verification algorithm.

### 16.2 Signature representations

Existing CTR data uses both generic encoded values and split elliptic-curve
components:

```json
{
  "algorithm": "ECDSA",
  "format": "rs",
  "r": "...",
  "s": "..."
}
```

or:

```json
{
  "algorithm": "ECDSA",
  "format": "DER",
  "value": "..."
}
```

Format and encoding MUST be explicit whenever they cannot be derived
unambiguously from the selected profile.

### 16.3 Original signed payload

Some source formats do not define canonical JSON or sign a binary structure.
The session or measurement can therefore retain an `original` payload or
format-specific fields. A verifier MUST use the original signed representation
when the profile requires it. Re-serializing semantically equivalent JSON is not
necessarily signature preserving.

## 17. Public Keys

### 17.1 Example

```json
{
  "@id": "urn:key:meter-240008S-1",
  "@context": "https://open.charging.cloud/contexts/PublicKeyInfo+json",
  "subject": "urn:meter:240008S",
  "type": {
    "oid": "1.2.840.10045.2.1",
    "name": "ecPublicKey"
  },
  "algorithm": {
    "oid": "1.2.840.10045.3.1.7",
    "name": "secp256r1"
  },
  "format": "XY",
  "encoding": "hex",
  "value": "04..."
}
```

Keys SHOULD identify their subject, algorithm or curve, format, and encoding.
They MAY carry signatures establishing a key hierarchy or provenance.

A key being present in a CTR does not by itself make it trusted. Verification
must establish that the key is authorized for the claimed meter, station, or
other subject under the applicable trust model.

## 18. Tariffs, Periods, and Costs

CTR tariff structures are based partly on OCPI-style concepts and can contain:

- currency and taxes;
- price components;
- restrictions by date, time, energy, power, duration, or weekday;
- validity intervals; and
- signatures.

Charging periods associate a tariff with a session interval and calculated
costs. `totalCosts` can separate reservation, energy, time, idle, and flat
components.

Measured amounts and billed amounts MUST remain distinguishable. A cost object
does not prove that the underlying measurement or tariff was signed unless its
profile explicitly provides such coverage.

## 19. Verification Results

Chargy can add results at CTR, session, measurement, and value level.

A typical derived result is:

```json
{
  "status": "ValidSignature",
  "warnings": [],
  "errors": []
}
```

`certainty` expresses parser confidence when several format adapters could
interpret an ambiguous input. It is not cryptographic confidence and does not
measure the probability that a measurement is correct.

Derived verification fields:

- MUST NOT be included in the original source signature unless a profile
  explicitly says otherwise;
- MUST NOT overwrite source status fields;
- SHOULD identify the verifier and software version when persisted; and
- SHOULD be recomputed when evidence, keys, validation policy, or verifier
  software changes.

## 20. Complete Example

```json
{
  "@id": "urn:ctr:example-123",
  "@context": "https://open.charging.cloud/contexts/CTR+json",
  "begin": "2026-07-04T13:00:00Z",
  "end": "2026-07-04T14:00:00Z",
  "chargingStations": [
    {
      "@id": "urn:station:DE*ABC*E123",
      "description": {
        "en": "Example charging station"
      },
      "EVSEs": [
        {
          "@id": "DE*ABC*E123*1",
          "energyMeters": [
            {
              "@id": "urn:meter:240008S",
              "publicKeys": [
                {
                  "@id": "urn:key:meter-240008S-1",
                  "subject": "urn:meter:240008S",
                  "algorithm": "secp256r1",
                  "format": "XY",
                  "encoding": "hex",
                  "value": "04..."
                }
              ]
            }
          ],
          "connectors": [
            {
              "@id": "1",
              "type": "CCS"
            }
          ]
        }
      ]
    }
  ],
  "publicKeys": [
    {
      "@id": "urn:key:meter-240008S-1",
      "subject": "urn:meter:240008S",
      "algorithm": "secp256r1",
      "format": "XY",
      "encoding": "hex",
      "value": "04..."
    }
  ],
  "chargingSessions": [
    {
      "@id": "urn:charging-session:4711",
      "begin": "2026-07-04T13:00:00Z",
      "end": "2026-07-04T14:00:00Z",
      "chargingStationId": "urn:station:DE*ABC*E123",
      "EVSEId": "DE*ABC*E123*1",
      "ConnectorId": "1",
      "meterId": "urn:meter:240008S",
      "measurements": [
        {
          "@context": "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/Example+json",
          "energyMeterId": "urn:meter:240008S",
          "name": "ENERGY_TOTAL",
          "obis": "1-0:1.8.0*255",
          "unit": "kWh",
          "scale": 0,
          "signatureInfos": {
            "hash": "SHA256",
            "algorithm": "ECDSA",
            "curve": "secp256r1",
            "format": "rs",
            "encoding": "hex"
          },
          "values": [
            {
              "timestamp": "2026-07-04T13:00:00Z",
              "value": "74.600",
              "paginationId": "1840",
              "signatures": [
                {
                  "r": "11...",
                  "s": "22..."
                }
              ]
            },
            {
              "timestamp": "2026-07-04T14:00:00Z",
              "value": "86.600",
              "paginationId": "1841",
              "signatures": [
                {
                  "r": "33...",
                  "s": "44..."
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Ellipses in cryptographic values make this an illustrative document, not a
cryptographically verifiable fixture.

## 21. Validation Recommendations

A native CTR verifier SHOULD check at least:

### 21.1 Structural checks

- the root is a JSON object;
- expected identifiers, timestamps, arrays, and contexts have valid types;
- `chargingSessions` is present and contains valid session objects;
- measurements contain the fields required by their profile;
- measurement values contain timestamps and exact values; and
- portable objects are acyclic and JSON compatible.

### 21.2 Reference checks

- IDs are unique in their applicable namespace;
- session infrastructure and meter references resolve;
- measurement `energyMeterId` values resolve to the intended meter;
- tariff and authorization references are consistent; and
- duplicate embedded and top-level entities do not conflict.

### 21.3 Temporal checks

- session and measurement intervals fall within the CTR interval;
- value ordering is plausible under the source profile;
- start, intermediate, and stop values are classified consistently;
- clock corrections and uncertain timestamps are handled explicitly; and
- pagination or monotonic counters are checked when their semantics are known.

### 21.4 Cryptographic checks

- the correct signature profile is selected from context and metadata;
- the exact signed input is reconstructed without lossy conversions;
- public keys are structurally valid and authorized for their subjects;
- every required signature is present and valid;
- signature-chain and pagination rules are checked; and
- cryptographic success does not suppress semantic or plausibility errors.

## 22. Extension Rules

CTR is intentionally extensible.

- Extensions SHOULD use a versioned `@context`.
- Private properties SHOULD be namespaced or defined by their context.
- Consumers MUST preserve unknown evidence fields when round-tripping.
- Unknown fields MUST NOT silently alter known-field semantics.
- A signature profile MUST define whether extension fields are signed.
- Critical unknown extensions SHOULD produce an explicit unsupported result
  rather than being ignored.

Current draft extensions are:

- [CTR Legally Relevant Log Messages](CTR_Legally_Relevant_Log_Messages.md); and
- [CTR Time Synchronization Sources](CTR_Time_Synchronization_Sources.md).

## 23. Legacy Compatibility

Long-standing CTR documents contain variations that implementations may need to
accept, including:

- singular and plural property variants such as `contract` and `contracts`;
- `meters` instead of `energyMeters` in older infrastructure objects;
- embedded objects where newer models prefer IDs;
- public keys with partially implicit format metadata;
- string, number, or source-specific pagination identifiers;
- signatures stored as DER, raw values, or split `r` and `s` components;
- source-format fields not declared by the common interface; and
- verifier results serialized alongside source data.

Parsers SHOULD preserve evidence while normalizing it into the current model.
They MUST NOT invent signed semantics that the source format did not provide.

## 24. Security and Privacy Considerations

- A valid signature proves integrity and key possession, not measurement truth.
- Embedded public keys require an external or included trust relationship.
- Original signed payloads must be retained when reconstruction is not
  deterministic.
- Contract, authorization, location, and session identifiers can be personal
  data and SHOULD be minimized or pseudonymized.
- URLs can disclose access tokens and MUST be reviewed before export.
- Verification results can become stale when keys, policies, or software change.
- Unknown source fields can be security critical and must not be discarded
  before their signature relevance is understood.

## 25. Open Design Decisions

1. A versioned JSON Schema and published JSON-LD context for the base CTR.
2. A canonical distinction between source, normalized, and verified CTR files.
3. A canonical entity placement and reference model without duplicated objects.
4. Consistent naming, including `EVSEId`, `ConnectorId`, and legacy variants.
5. Exact decimal and `scale` semantics independent of source adapters.
6. A unified signature and public-key representation.
7. Standard media types for source and verified CTR documents.
8. Rules for whole-CTR signatures and exclusion of derived results.
9. Required versus optional metadata for different regulatory profiles.
10. Migration rules for session-local and top-level legally relevant events.

## 26. Recommended Standardization Order

1. Freeze and document the portable base object model.
2. Separate wire DTOs from runtime and verifier objects.
3. Publish schemas, contexts, and identifier conventions.
4. Define exact decimal, unit, and scale semantics.
5. Unify signature, key-reference, and canonicalization metadata.
6. Define base structural, reference, and temporal validation rules.
7. Add conformance fixtures for minimal, complete, legacy, and invalid CTRs.
8. Integrate legally relevant logs and time synchronization as versioned
   extensions.
