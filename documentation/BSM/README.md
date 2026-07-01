# BSM-WS36A Signed Meter Value Format

The BSM format describes the signed snapshots produced by the
**BAUER Electronic BSM-WS36A** smart meter (the "Bauer Smart Meter", developed
together with chargeIT mobility). Each snapshot is a JSON object carrying a set
of signed data points plus an ECDSA signature over their abstract binary
representation.

Chargy does not consume BSM snapshots as a standalone file format. They are
always embedded as `signedMeterValues` inside a **chargeIT** transparency
container or an **OCPI** charge detail record. The chargeIT/OCPI parser detects
the BSM context and hands the array of signed meter values to
`BSMCrypt01.tryToParseBSM_WS36aMeasurements(...)`, which performs structural
validation, consistency checks and cryptographic verification.

This implementation targets the structure documented by chargeIT mobility's
[`bsm-python` Chargy example](https://github.com/chargeITmobility/bsm-python/blob/master/doc/examples/chargy.md)
(see *References* below).

## Detection and Routing

A signed meter value is treated as BSM-WS36A when its `@context` is one of the
following (or, for OCPI, starts with the chargeIT prefix):

```text
https://www.chargeit-mobility.com/contexts/bsm-ws36a-json-v0
https://www.chargeit-mobility.com/contexts/bsm-ws36a-json-v1
https://www.lichtblick.de/contexts/bsm-ws36a-json-v0
https://www.lichtblick.de/contexts/bsm-ws36a-json-v1
https://www.eneco.com/contexts/bsm-ws36a-json-v0
https://www.eneco.com/contexts/bsm-ws36a-json-v1
```

The chargeIT/OCPI container supplies two context values to the BSM parser that
are later cross-checked against the *signed* metadata (see *Metadata* below):

| Parameter | Source | Used for |
|-----------|--------|----------|
| `ExpectedEVSEId` | container EVSE id (e.g. `placeInfo.evseId`) | compared against the signed `evse-id:` meta tag |
| `ExpectedCscSwVersion` | charging-station controller software version | compared against the signed `csc-sw-version:` meta tag |

## Snapshot Structure

Each entry of `signedMeterValues` is one signed snapshot:

```jsonc
{
  "@context":      "https://www.chargeit-mobility.com/contexts/bsm-ws36a-json-v1",
  "@id":           "001BZR1521070003-22111",
  "time":          "2020-10-08T13:00:57+02:00",
  "meterInfo": {
    "meterId":         "001BZR1521070003",
    "publicKey":       "3059301306072a8648ce3d020106082a8648ce3d030107034200044bfd...7254",
    "firmwareVersion": "1.9:32CA:AFF4, 6d1dd3c",
    "type":            "BSM-WS36A-H01-1311-0000",
    "manufacturer":    "BAUER Electronic"
  },
  "contract": {
    "id":   "102bb22f",
    "type": "rfid"
  },
  "measurementId": 22111,
  "value": {
    "measurand":     { "name": "RCR", "id": "1-0:1.8.0*198" },
    "measuredValue": { "scale": 0, "unit": "Wh", "unitEncoded": 30, "value": 150, "valueType": "UnsignedInteger32" },
    "displayedFormat": { "prefix": "kilo", "precision": 2 }
  },
  "additionalValues": [ /* the signed data points, see below */ ],
  "signature": "3045022100895b...73ce73b9"
}
```

Chargy collects all snapshots of one container into a single charging session
with one energy measurement. The session's first snapshot must be a `START` or
`TURN ON` snapshot, the last must be an `END` or `TURN OFF` snapshot, and every
snapshot in between must be a `CURRENT` snapshot.

### Snapshot Types (`Typ`)

| `Typ` | Parsed name | Meaning |
|-------|-------------|---------|
| 0 | `CURRENT` | Current meter data at the time of snapshot creation. |
| 1 | `TURN ON` | Created while executing the turn-on sequence of an external contactor. |
| 2 | `TURN OFF` | Created while executing the turn-off sequence of an external contactor. |
| 3 | `START` | Marks the start of a charging process without switching a contactor. |
| 4 | `END` | Marks the end of a charging process without switching a contactor. |

## Signed Data Points (`additionalValues`)

The `additionalValues` array carries the data points that are part of the
signature. Chargy reads them by their `measurand.name`:

| Name | Type | Meaning |
|------|------|---------|
| `Typ` | uint | Snapshot type (see table above). |
| `RCR` | uint (Wh) | Reference Cumulative Register — energy imported since the last turn-on sequence. The primary billing value. |
| `TotWhImp` | uint (Wh) | Total real energy imported (lifetime meter register). |
| `W` | int (W) | Momentary active power. |
| `MA1` | string | Meter Address 1 — the meter id. |
| `RCnt` | uint | Response/snapshot counter, unique and monotonically increasing per snapshot. |
| `OS` | uint (s) | Operation-seconds / uptime counter. |
| `Epoch` | uint (s) | UNIX timestamp of the snapshot. |
| `TZO` | int (min) | Timezone offset in minutes. |
| `EpochSetCnt` | uint | Counter of how often the clock was set. |
| `EpochSetOS` | uint (s) | Uptime at the last clock set. |
| `DI` | uint | Digital inputs. |
| `DO` | uint | Digital outputs. |
| `Meta1`, `Meta2`, `Meta3` | string | User metadata blocks (see below). |
| `Evt` | uint | Event/error flags counter (decoded via `ParseEvents`). |

The snapshot's top-level `value` mirrors the `RCR` data point (`measurand.id`
`1-0:1.8.0*198`); the per-point scale factor, unit and DLMS unit code from
`measuredValue` are used when building the signed payload.

## Metadata (`Meta1` / `Meta2` / `Meta3`) — and how Chargy processes it

> **Short answer to "do we process the metadata at all?": Yes — and it is the
> integrity anchor for several otherwise unsigned container fields.**

The three `Meta` blocks are free-form, UTF-8 encoded, user-defined strings.
Crucially, they are **part of the signed payload**, so their content is
cryptographically protected. The BSM-WS36A convention (and the `bsm-python`
documentation) is to place `key: value` tags into these blocks, e.g.:

```text
Meta1 = "contract-id: rfid:102bb22f"
Meta2 = ""
Meta3 = "csc-sw-version: unknown"
```

Chargy scans **all** `Meta` blocks for three known tag prefixes and
cross-validates them. The other (unsigned) JSON fields of the container only
become trustworthy through this comparison against the signed `Meta` content:

| Meta tag | Processed? | What Chargy does | On mismatch |
|----------|-----------|------------------|-------------|
| `contract-id: <type>:<id>` | **Yes** | When a snapshot has a `contract` object, a `contract-id:` tag is **required** in the signed `Meta`. Chargy reconstructs `"contract-id: <type>:<id>"` (or `"contract-id: <id>"` when no type) from the unsigned `contract` object and compares it to the signed tag. It also checks `contract.id`/`contract.type` are stable across all snapshots. | **Error** (`Inconsistent_SignedMeterValue_Contract_Id` / `_Contract_Type`) |
| `evse-id: <id>` | **Yes** | Extracts the value and compares it against `ExpectedEVSEId` from the container. Skipped when the signed value is literally `unknown`. Only acts when exactly one `evse-id:` tag is present. | **Error** (`Inconsistent_EVSE_Identification`) |
| `csc-sw-version: <version>` | **Yes** | Extracts the value, checks it is identical across all snapshots, and compares it against the container's `ExpectedCscSwVersion`. The cross-snapshot check is an error; the container check is only a warning because the unsigned header version is a combined version+build-timestamp string that cannot be compared reliably. | Cross-snapshot: **Error**. Container: **Warning** (medium). |
| any other text | Signed & displayed only | Included in the signature and shown verbatim in the detailed view, but not otherwise interpreted. | — |

So the *signed* `contract-id:`, `evse-id:` and `csc-sw-version:` tags are used to
authenticate the *unsigned* `contract` object, the container EVSE id and the
charging-station software version respectively. This is the main reason the
metadata is processed at all: the BSM-WS36A only signs the `Meta` strings (and
the numeric data points), not the surrounding chargeIT/OCPI JSON, so the meta
tags are what tie the human-readable container fields to the cryptographic
evidence.

### Known gap

There is no validation of the *internal* structure of a `Meta` tag beyond the
three prefixes above, and `Meta` content that is neither one of these tags nor
empty is accepted without comment. A snapshot that carries, for example, a
second unknown `key: value` pair is not rejected.

## Contract

Independently of the `contract-id:` meta tag, the snapshot's top-level
`contract` object (`{ id, type }`) is parsed and surfaced on the charging
session as the authorization:

```jsonc
"authorizationStart": {
  "@id":      "102bb22f",   // contract.id
  "@context": "rfid"        // contract.type
}
```

As described above, this unsigned object is only trusted because the signed
`contract-id:` meta tag must match it.

## Signed Payload

The signature is computed over a variable-length byte buffer built from the
signed data points in a fixed order. Two encodings are used:

- **Numerical value** → 6 bytes: a 32-bit big-endian value `vvvvvvvv`, a signed
  8-bit scale-factor exponent `ss`, and the unsigned 8-bit DLMS unit code `uu`
  for the OBIS unit.
- **String value** → a 32-bit big-endian length followed by the UTF-8 bytes.

The buffer is assembled in this order (string lengths are dynamic, so `MA1`,
`Meta1`, `Meta2`, `Meta3` shift the following offsets):

| Order | Field | Encoding | Scale | DLMS unit code |
|-------|-------|----------|-------|----------------|
| 1 | `Typ` | numerical | 0 | 255 (none) |
| 2 | `RCR` | numerical | `RCR_SF` | 30 (Wh) |
| 3 | `TotWhImp` | numerical | `TotWhImp_SF` | 30 (Wh) |
| 4 | `W` | numerical | `W_SF` | 27 (W) |
| 5 | `MA1` | string | — | — |
| 6 | `RCnt` | numerical | 0 | 255 (none) |
| 7 | `OS` | numerical | 0 | 7 (s) |
| 8 | `Epoch` | numerical | 0 | 7 (s) |
| 9 | `TZO` | numerical | 0 | 6 (min) |
| 10 | `EpochSetCnt` | numerical | 0 | 255 (none) |
| 11 | `EpochSetOS` | numerical | 0 | 7 (s) |
| 12 | `DI` | numerical | 0 | 255 (none) |
| 13 | `DO` | numerical | 0 | 255 (none) |
| 14 | `Meta1` | string | — | — |
| 15 | `Meta2` | string | — | — |
| 16 | `Meta3` | string | — | — |
| 17 | `Evt` | numerical | 0 | 255 (none) |

Worked example from the reference (`RCR = 150 Wh`, scale `0`, Wh code `0x1e`):

```text
RCR (150 Wh)  =>  00000096 00 1e
MA1           =>  00000010 303031425a5231353231303730303033   ("001BZR1521070003")
Meta1         =>  0000000b 64656d6f20646174612031              ("demo data 1")
Meta2 ()      =>  00000000
```

## Signature Verification

| Parameter | Value |
|-----------|-------|
| Curve | secp256r1 / NIST P-256 |
| Algorithm | ECDSA |
| Hash | SHA-256 over the full variable-length payload (no truncation) |
| Public key | `meterInfo.publicKey`, DER-encoded `SubjectPublicKeyInfo` (hex); the raw EC point is extracted via ASN.1 |
| Signature | DER-encoded `SEQUENCE { r, s }`, decoded into `r`/`s` |

Verification runs through the shared `elliptic`/`ACrypt` infrastructure and is
split into discrete steps so that the failure cause is reported as structured
data (see the `Verification_*` reason codes used across all Chargy formats):

1. **Decode** the public key (`Verification_PublicKeyDecodingFailed`).
2. **Validate** that it is a point on the curve (`Verification_PublicKeyNotOnCurve`).
3. **Verify** the signature; a thrown error is `Verification_SignatureMalformed`.
4. A structurally valid but non-matching signature yields
   `Verification_SignatureMismatch`; the result status is `InvalidSignature`.

If the meter additionally accumulates structural validation errors (see below),
a successfully verified snapshot is reported as `ValidationError` instead of
`ValidSignature`, so a valid signature never masks an inconsistent record.

## Consistency Validation

Beyond the per-snapshot signature, Chargy validates the chain of snapshots and
the relationship between signed and unsigned data. Each check that fails adds an
error (or warning) to the affected measurement:

- `RCR` must not decrease between snapshots.
- `RCnt` (snapshot counter) must increase by exactly one.
- `OS` (uptime) and `Epoch` (clock) must strictly increase.
- `RCnt` must equal the snapshot's `measurementId`.
- The timestamp derived from `Epoch + TZO` must equal the snapshot's `time`.
- `MA1`, `EpochSetCnt` and `EpochSetOS` must be stable across snapshots.
- `contract`, `evse-id` and `csc-sw-version` are cross-checked as described in
  *Metadata*.
- The meter id, firmware version, public key and other `meterInfo` fields must
  be consistent across the snapshots and against the container.

Changing any signed field — `RCR`, `TotWhImp`, `Epoch`, `MA1`, a `Meta` block,
etc. — must invalidate the corresponding signature.

## Test Fixtures

The BSM examples used by the test suite live under the chargeIT fixtures,
because BSM snapshots are always delivered inside a chargeIT container:

```text
tests/fixtures/chargeIT/BSM/bsm-ws36a-good.json
tests/fixtures/chargeIT/new_container_format/bsm-ws36a-good-new-style-header.json
tests/fixtures/chargeIT/new_container_format/bsm-ws36a-good-with-non-zero-scale-factors.json
```

They are exercised by `tests/chargeIT.tests.ts` (e.g. the `bsm-ws36a-good`
tests). `bsm-ws36a-good.json` contains the signed `Meta1 = "contract-id:
rfid:102bb22f"` and `Meta3 = "csc-sw-version: unknown"` tags discussed above,
together with the matching unsigned `contract` object and the container
`evseId`.

## References

- chargeIT mobility, *BSM-Python — Chargy example*:
  <https://github.com/chargeITmobility/bsm-python/blob/master/doc/examples/chargy.md>
- chargeIT mobility, *BSM-Python — Snapshot creation* (abstract binary
  representation of the signed data points):
  <https://github.com/chargeITmobility/bsm-python/blob/master/doc/examples/snapshots.md#snapshot-creation>
- Implementation: [`src/BSMCrypt01.ts`](../../src/BSMCrypt01.ts)
