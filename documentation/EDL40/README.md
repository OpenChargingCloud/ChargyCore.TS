# EDL40 and ISA-EDL40 SML Formats

EDL40 and ISA-EDL40 are SML based charge transparency formats used for signed
meter readings in German calibration-law contexts. Unlike OCMF, PCDF or the
Mennekes XML format, the legally relevant payload is not a textual field list.
It is a binary SML telegram containing a `SmlGetListRes` message, meter values,
timestamps, OBIS entries and the list signature.

ChargyCore supports two closely related variants:

| Variant | SAFE `signedData` format | Main curve | Meter layout |
|---------|--------------------------|------------|--------------|
| EDL40 | `SML_EDL40_P` or `EDL_40_P` | `secp192r1` with `secp256r1` fallback | one signed energy counter per telegram |
| ISA-EDL40 | `ISA_EDL_40_P` | `secp256r1` | start counter and actual/stop counter in one telegram |

The implementation lives in:

```text
src/EDL40.ts
```

It is intentionally browser-compatible and uses ChargyCore's existing
`elliptic` and `chargyLib.sha256____` infrastructure.

## SAFE XML Container

Chargy currently receives these telegrams through the SAFE XML `values`
container:

```xml
<values>
  <value context="Transaction.Begin" transactionId="2604">
    <signedData encoding="plain" format="SML_EDL40_P">1b1b1b1b...</signedData>
    <publicKey>8c5e765f...</publicKey>
  </value>
  <value context="Transaction.End" transactionId="2604">
    <signedData encoding="plain" format="SML_EDL40_P">1b1b1b1b...</signedData>
    <publicKey>8c5e765f...</publicKey>
  </value>
</values>
```

For ISA-EDL40 the `format` attribute is:

```xml
<signedData encoding="plain" format="ISA_EDL_40_P">1B1B1B1B...</signedData>
```

SAFE XML metadata such as `chargingStation`, `EVSE` and `connector` is parsed
by the regular SAFE XML container parser and reused in the generated Charge
Transparency Record when present.

## Encoding

The `signedData` text is decoded by trying plausible encodings until a valid
SML `GetListRes` message can be parsed. The supported encodings are:

| Encoding | Notes |
|----------|-------|
| Base32 | RFC 4648 alphabet, padding optional. |
| Base64 | Standard Base64. |
| Hex | Whitespace is ignored. Many SAFE examples use `encoding="plain"` even though the content is hex. |

The public key is expected as raw `X || Y` bytes encoded as hex:

| Curve | Public key length | Hex length |
|-------|-------------------|------------|
| `secp192r1` | 48 bytes | 96 chars |
| `secp256r1` | 64 bytes | 128 chars |

## ChargyCore Mapping

Chargy converts EDL40 and ISA-EDL40 telegrams into a regular
`IChargeTransparencyRecord`.

The session context is:

```text
https://open.charging.cloud/contexts/SessionSignatureFormats/EDL40+json
```

The energy meter signature context is:

```text
https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/EDL40+json
```

One generated session contains one `ENERGY_TOTAL` measurement with OBIS:

```text
1-0:1.8.0*255
```

Meter values are exposed as kWh in the CTR. The original SML details remain
available on each measurement value through `edl40Document`, including:

| Field | Meaning |
|-------|---------|
| `variant` | `EDL_40_P` or `ISA_EDL_40_P`. |
| `curve` | Curve selected for verification. |
| `serverId` | SML server id / meter id, hex encoded. |
| `contractId` | Contract id from the SML contract OBIS entry, zero padding removed. |
| `signedData` | The reconstructed 320 byte signature payload, hex encoded. |
| `hashValue` | The SHA-256 hash material actually passed to ECDSA verification, after truncation when needed. |
| `signatureHex` | Raw `r || s` signature used for verification, hex encoded. |
| `pagination` | Pagination or log index from the SML data. |
| `listNameContext` | ISA only: `START`, `UPDATE` or `STOP`. |

## SML Transport and Message Parsing

The binary SML frame uses the usual transport escape sequence:

```text
1B 1B 1B 1B 01 01 01 01      start
... SML messages ...
1B 1B 1B 1B 1A PP CC CC      end, padding count and CRC
```

Chargy strips the transport wrapper and parses the SML TLV structure directly.
The parser only materializes the parts needed for verification:

```text
SmlGetListRes
  serverId
  listName
  valList[]
    objName
    status
    valTime
    unit
    scaler
    value
    valueSignature
  listSignature
```

Only `SmlGetListRes` messages (`messageBody` tag `0x0701`) are relevant for
signature verification. Public open and close messages are ignored after the
frame has been decoded.

## SML Time Handling

SML time values can be plain timestamps, second indexes or local timestamps.
For local timestamps Chargy follows the Java reference behavior used by the
SAFE transparency software:

```text
localEpochSeconds = timestamp + (localOffsetMinutes + seasonOffsetMinutes) * 60
```

The local epoch value is used in the 320 byte signed payload. The displayed CTR
timestamp is the real UTC instant represented by the SML timestamp.

## EDL40 Signed Payload

EDL40 builds one 320 byte payload per telegram. The signature covers the
`SmlGetListRes.listSignature` over the following reconstructed byte block.

| Offset | Length | Field | Byte order / notes |
|--------|--------|-------|--------------------|
| 0 | 10 | Server ID | copied from `SmlGetListRes.serverId` |
| 10 | 4 | Meter timestamp | little endian local epoch seconds |
| 14 | 1 | Meter status | low byte, or EMOC-transformed status |
| 15 | 4 | Seconds index | little endian |
| 19 | 4 | Pagination | little endian |
| 23 | 6 | OBIS ID | signed value OBIS |
| 29 | 1 | Unit | must be `30` for Wh |
| 30 | 1 | Scaler | signed byte stored as unsigned |
| 31 | 8 | Meter value | little endian |
| 39 | 2 | Log bytes | final two bytes of the list signature |
| 41 | 128 | Contract ID | zero padded |
| 169 | 4 | Contract ID timestamp | little endian local epoch seconds |
| 173 | 147 | Reserved | zero filled in the current implementation |

The main signed-value OBIS entries are tried in this order:

| OBIS hex | Meaning |
|----------|---------|
| `01 00 01 11 00 FF` | Classic EDL40 signed energy value. |
| `01 00 01 08 00 FF` | Alternative signed energy value. |

Additional OBIS entries used for the block are:

| OBIS hex | Meaning |
|----------|---------|
| `81 82 81 54 01 FF` | Contract ID. |
| `81 80 81 71 01 FF` | Pagination. |
| `81 00 60 08 00 01` | Seconds index. |
| `00 AF 73 76 72 FF` | Signature version. |

## ISA-EDL40 Signed Payload

ISA-EDL40 also uses a 320 byte payload, but embeds two energy counter readings:
the start counter and the actual counter. Depending on `listName`, the actual
counter represents an update or the stop value.

| Offset | Length | Field | Byte order / notes |
|--------|--------|-------|--------------------|
| 0 | 10 | Server ID | copied from `SmlGetListRes.serverId` |
| 10 | 4 | Actual counter timestamp | little endian local epoch seconds |
| 14 | 1 | Actual counter status | low byte of 8 byte status |
| 15 | 6 | Actual counter OBIS | usually `01 00 01 08 00 FF` |
| 21 | 1 | Actual counter unit | must be `30` for Wh |
| 22 | 1 | Actual counter scaler | signed byte stored as unsigned |
| 23 | 8 | Actual counter value | little endian |
| 31 | 2 | Log entry index | final two bytes of the list signature |
| 33 | 66 | Actual value signature | copied from the value entry |
| 99 | 128 | Contract ID | zero padded |
| 227 | 4 | Start counter timestamp | little endian local epoch seconds |
| 231 | 20 | ESTH | copied from SML |
| 251 | 1 | Start counter status | low byte of 8 byte status |
| 252 | 6 | Start counter OBIS | usually `01 00 01 08 00 80` |
| 258 | 1 | Start counter unit | must be `30` for Wh |
| 259 | 1 | Start counter scaler | signed byte stored as unsigned |
| 260 | 8 | Start counter value | little endian |
| 268 | 6 | List name | SML list context |
| 274 | 4 | Pagination | little endian |
| 278 | 42 | Reserved | zero filled |

The relevant ISA OBIS entries are:

| OBIS hex | Meaning |
|----------|---------|
| `81 82 81 54 01 FF` | Contract ID. |
| `01 00 01 08 00 80` | Start energy counter. |
| `01 00 01 08 00 FF` | Actual or stop energy counter. |
| `81 80 C7 F0 40 FF` | Pagination. |
| `81 80 81 61 01 FF` | ESTH. |

The ISA list name determines the transaction context:

| List name hex | Context |
|---------------|---------|
| `81 80 81 62 00 FF` | `START` |
| `81 80 81 62 01 FF` | `UPDATE` |
| `81 80 81 62 02 FF` | `STOP` |

## Signature Verification

EDL40 and ISA-EDL40 both use ECDSA over a SHA-256 hash of the reconstructed
320 byte payload. The hash and signature are handled as raw bytes, not as a
textual canonicalization.

### EDL40

| Parameter | Value |
|-----------|-------|
| Primary curve | `secp192r1` |
| Fallback curve | `secp256r1` |
| Hash | SHA-256 over the 320 byte payload |
| Hash truncation for `secp192r1` | first 24 bytes |
| Hash truncation for `secp256r1` | first 32 bytes |
| Signature | raw `r || s` |
| Signature suffix | final two log bytes are removed when required by version or signature length |

For 48 byte public keys Chargy verifies with `secp192r1`. For 64 byte public
keys it verifies with `secp256r1`.

### ISA-EDL40

| Parameter | Value |
|-----------|-------|
| Curve | `secp256r1` |
| Hash | SHA-256 over the 320 byte payload |
| Hash truncation | first 32 bytes |
| Signature | `listSignature` without the final two log bytes |

## Validation Notes

Chargy separates parsing, cryptographic verification and later CTR-level
plausibility checks:

1. SML parsing checks that a usable `SmlGetListRes` exists.
2. EDL40/ISA parsing checks that required OBIS entries exist.
3. Unit validation requires unit `30`, which represents Wh.
4. Signature verification checks the reconstructed 320 byte payload against the
   supplied public key.
5. The generated CTR is then processed through the normal Chargy session
   verification flow.

Changing any signed SML field that contributes to the 320 byte payload, such as
timestamp, value, status, pagination, contract id, server id or list name, must
invalidate the corresponding signature.

## Known Test Data Notes

Some SAFE / Java reference test data appears to be anonymized and not
re-signed after modification. Chargy therefore treats parsing and byte-block
construction as independently testable from the boolean result of those example
signatures. The EDL40plus SAFE fixture included in this repository verifies
successfully end to end.

The test fixtures live in:

```text
tests/fixtures/EDL40/
tests/fixtures/ISA_EDL40/
tests/fixtures/EDL40plus/
```

The main integration tests are in:

```text
tests/EDL40.tests.ts
```

