# EMHCrypt01 Signed Meter Value Format

`EMHCrypt01` is the energy-meter signature scheme used by **EMH metering**
meters as delivered by chargeIT mobility. Each meter reading is signed
individually with ECDSA over secp192r1 across a 320-byte extended-SML payload.

Like BSM, EMH readings are not a standalone file format: they are embedded as
signed meter values inside a **chargeIT** transparency container. The chargeIT
parser builds a charging session whose `@context` selects the `EMHCrypt01`
verification method, and hands each reading to
`EMHCrypt01.VerifyMeasurement(...)`.

Structurally `EMHCrypt01` is very close to the
[Mennekes EDL40](../Mennekes/README.md) format (both use secp192r1, a 320-byte
payload and a SHA-256 hash truncated to 24 bytes), but the field layout differs
and EMH carries the authorization data inside the signed payload.

## Detection and Routing

A charging session is verified with `EMHCrypt01` when its method context is:

```text
https://open.charging.cloud/contexts/SessionSignatureFormats/EMHCrypt01+json
```

The corresponding per-measurement signature format is:

```text
https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EMHCrypt01+json
```

Within a chargeIT container, `EMHCrypt01` is effectively the **default**
signed-meter-value handling: the signed readings themselves carry no
EMH-specific `@context`, so a reading that is *not* recognised as
[BSM-WS36A](../BSM/README.md) is parsed as EMH and the resulting session is
tagged with the `EMHCrypt01+json` method context above.

Chargy treats one chargeIT container as one signed charging session with one
energy measurement. The measurement must contain **at least two values**
(start & stop); every value is verified independently.

## Container Structure

Each signed reading in the chargeIT container looks like this (fields relevant
to EMH verification shown):

```jsonc
{
  "meterInfo": {
    "meterId":      "0901454D4800007F9F3E",
    "publicKey":    "08A56CF3B51DABA4...F65EC76",   // raw secp192r1 point, no leading 04 here
    "type":         "eHZ IW8E EMH",
    "manufacturer": "EMH"
  },
  "contract": {
    "id":             "235DD5BB",       // becomes authorizationStart.@id (signed!)
    "type":           "RFID_TAG_ID",
    "timestampLocal": { "timestamp": 1546961270, "localOffset": 60, "seasonOffset": 0 }
  },
  "measurand":     { "name": "ENERGY_TOTAL", "id": "0100011100FF" },   // hex OBIS -> 1-0:1.17.0*255
  "measuredValue": {
    "value":          "110281",         // raw integer meter value (before applying scale)
    "unit":           "WATT_HOUR",
    "unitEncoded":    30,
    "scale":          -1,
    "valueType":      "Integer64",
    "timestampLocal": { "timestamp": 1546961270, "localOffset": 60, "seasonOffset": 0 }
  },
  "measurementId":  "00000019",         // pagination counter
  "additionalInfo": {
    "status":  "88",                    // info status word (hex), see below
    "indexes": { "timer": 1758261, "logBook": "0004" }
  },
  "signature": "<96 hex chars>"         // raw ECDSA r || s, 24 + 24 bytes
}
```

The chargeIT parser maps this onto the EMH measurement value:

| EMH field | Source | Notes |
|-----------|--------|-------|
| `timestamp` | `measuredValue.timestampLocal` | Local time from `timestamp + localOffset + seasonOffset`. |
| `value` | `measuredValue.value` | Raw integer meter value (Wh), scaled by `scale` for display only. |
| `infoStatus` | `additionalInfo.status` | Hexadecimal status word. |
| `secondsIndex` | `additionalInfo.indexes.timer` | Meter second index. |
| `paginationId` | `measurementId` | Pagination counter; must increase between values. |
| `logBookIndex` | `additionalInfo.indexes.logBook` | Hexadecimal logbook index. |
| `signatures[0]` | `signature` | First 48 hex chars → `r`, remaining 48 → `s`. |

The public key is taken from `meterInfo.publicKey` and registered on the meter.
A leading `04` (uncompressed-point indicator) is prepended when it is missing,
so the verifier always receives `04 || X || Y`.

## Status Word (`infoStatus`)

`infoStatus` is a hexadecimal status word. Chargy decodes the following bits
(`DecodeStatus`); unlisted bits are reserved:

| Bit (mask) | Meaning when set |
|------------|------------------|
| `0x01` | Fehler erkannt (error detected) |
| `0x02` | Synchrone Messwertübermittlung (synchronous transmission) |
| `0x08` | System-Uhr ist synchron (system clock in sync); otherwise "nicht synchron" |
| `0x10` | Rücklaufsperre aktiv (reverse running lock active) |
| `0x20` | Energierichtung -A (energy direction -A) |
| `0x40` | Magnetfeld erkannt (magnetic field detected) |

> The status word is interpreted as **hexadecimal** (radix 16). This is shown in
> the detailed view as binary + the decoded flags.

## Signed Payload

The signature is computed over a fixed 320-byte buffer. EMH fills the fields up
to byte 172; bytes 173 through 319 stay zero.

| Offset | Length | Field | Encoding / byte order |
|--------|--------|-------|-----------------------|
| 0 | 10 | Meter id | hex bytes |
| 10 | 4 | Measurement timestamp | little-endian local epoch seconds |
| 14 | 1 | Info status | hex byte |
| 15 | 4 | Second index | little-endian uint32 |
| 19 | 4 | Pagination id | hex bytes, reversed |
| 23 | 6 | OBIS id | from `OBIS2Hex(obis)` |
| 29 | 1 | Unit (encoded) | signed 8-bit |
| 30 | 1 | Scale | signed 8-bit |
| 31 | 8 | Meter value | little-endian uint64 |
| 39 | 2 | Logbook index | hex bytes |
| 41 | 128 | Authorization id | `contract.id` as text, zero padded |
| 169 | 4 | Authorization timestamp | little-endian local epoch seconds |
| 173 | 147 | Reserved | zero filled |

Note that the **authorization** (`contract.id` and its timestamp) is part of the
signed payload — changing who started the charging process invalidates the
signature.

## Timestamp Conversion

The timestamp encoding reproduces the EMH/Java reference behaviour: the UTC epoch
seconds are computed first, then the timezone offset is added again before
encoding as a little-endian 32-bit integer.

```text
localEpochSeconds = utcEpochSeconds + offsetSeconds
```

(See `SetTimestamp32` in `src/interfaces/chargyLib.ts`; the use of `utcOffset()`
is, per the source comment, EMH specific.)

## Signature Verification

| Parameter | Value |
|-----------|-------|
| Curve | secp192r1 / NIST P-192 |
| Algorithm | ECDSA |
| Hash | SHA-256 over the 320-byte payload |
| Hash truncation | first 24 bytes (192 bits) of the SHA-256 digest |
| Public key | raw uncompressed point `04 \|\| X \|\| Y`, hex encoded |
| Signature | raw `r \|\| s`, 24 + 24 bytes, hex encoded |

The trusted public key comes from the registered energy meter
(`Chargy.GetMeter(...)`), **not** from the signature itself, so a self-signed
reading cannot pass verification.

Verification runs through the shared `elliptic`/`ACrypt` infrastructure and is
split into discrete steps so the failure cause is reported as structured data
(the `Verification_*` reason codes shared by all Chargy formats):

1. **Decode** the public key (`Verification_PublicKeyDecodingFailed`).
2. **Validate** it is a point on the curve (`Verification_PublicKeyNotOnCurve`).
3. **Verify** the signature; a thrown error is `Verification_SignatureMalformed`.
4. A structurally valid but non-matching signature yields
   `Verification_SignatureMismatch` (status `InvalidSignature`).

A reading without a signature is reported as `InvalidSignature` with
`Verification_SignatureMissing`.

## Session Result

`VerifyChargingSession` requires at least two values per measurement:

- Fewer than two values → `AtLeastTwoMeasurementsRequired`.
- Otherwise the session is `ValidSignature` only when **every** value verifies;
  a single invalid value makes the whole session `InvalidSignature`.

## Validation Notes

Chargy separates parsing, cryptographic verification and simple consistency
checks. Changing any signed field — `value`, `timestamp`, `secondsIndex`,
`paginationId`, the meter id, the authorization id, etc. — must invalidate the
corresponding signature.

## Test Fixtures

The EMH examples used by the test suite are delivered inside chargeIT
containers:

```text
tests/fixtures/chargeIT/chargeIT-Testdata-02.chargy
```

It is exercised by `tests/chargeIT.tests.ts` (the `chargeIT-Testdata-02` tests,
also as `.zip`, `.tar`, `.tar.gz` and `.tar.bz2` archives).

Focused unit tests for the EMH status-word decoding and the structured
verification diagnostics live in:

```text
tests/EMHCrypt01.tests.ts
```

## References and Related Formats

- Implementation: [`src/EMHCrypt01.ts`](../../src/EMHCrypt01.ts)
- chargeIT container parser: [`src/chargeIT.ts`](../../src/chargeIT.ts)
- [Mennekes EDL40](../Mennekes/README.md) — closely related secp192r1 / 320-byte
  scheme.
- [BSM-WS36A](../BSM/README.md) — the other signed-meter-value format embedded in
  chargeIT containers.
