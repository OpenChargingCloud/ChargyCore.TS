# PTB OCMF Container

The PTB container is a small JSON envelope for a charging session represented
by two signed OCMF records. It adds the public key and charging-station location
data that are not necessarily present in the OCMF documents themselves.

ChargyCore validates the envelope, passes the two OCMF records unchanged to the
regular OCMF parser and maps the container metadata into the resulting Charge
Transparency Record (CTR).

The implementation lives in:

```text
src/PTBContainer.ts
```

## Container Structure

A container has the following shape:

```json
{
  "format": "ptb",
  "formatVersion": "1.0",
  "publicKey": "<Base64-encoded DER/SPKI public key>",
  "chargeboxIdentifier": "DE*ABC*E1234567",
  "address": {
    "street": "Teststrasse 1",
    "houseNumber": "1",
    "postalCode": "10115",
    "city": "Berlin",
    "country": "DE"
  },
  "geoLocation": {
    "lat": 52.5,
    "lng": 13.4
  },
  "ocmfBegin": "OCMF|{...}|{...}",
  "ocmfEnd": "OCMF|{...}|{...}"
}
```

The shortened OCMF strings above only illustrate the structure. Each property
must contain a complete OCMF record in an actual container.

## Properties

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `format` | yes | exactly `ptb` | Identifies the JSON object as a PTB container. |
| `formatVersion` | no | `1` or `1.<number>` | Version of the envelope, for example `1` or `1.0`. |
| `publicKey` | yes | non-empty Base64 | DER/SPKI encoded elliptic-curve public key used for both OCMF signatures. |
| `chargeboxIdentifier` | yes | non-empty string | Charging-station and EVSE identifier used in the generated CTR. |
| `address` | yes | object | Address of the charging station. |
| `geoLocation` | yes | object | WGS 84 latitude and longitude of the charging station. |
| `ocmfBegin` | yes | string beginning with `OCMF\|` | Signed OCMF record for the beginning of the session. |
| `ocmfEnd` | yes | string beginning with `OCMF\|` | Signed OCMF record for the end of the session. |

Unknown top-level properties are retained by the JSON object but are not used
by the adapter.

## Address

`address.street` is mandatory and must be a non-empty string. The address must
also contain at least one non-empty `city` or `town` value.

| Property | Required | Notes |
|----------|----------|-------|
| `street` | yes | Street name; a combined value such as `Teststrasse 1` is accepted. |
| `houseNumber` | no | Separate house number. |
| `postalCode` | no | Preferred postal-code property. |
| `zipCode` | no | Legacy alias for `postalCode`. |
| `city` | conditionally | Preferred city property; either `city` or `town` is required. |
| `town` | conditionally | Legacy alias for `city`. |
| `country` | no | Country name or code as supplied by the producer. |

When both an alias and its preferred property are present, `city` takes
precedence over `town`, and `postalCode` takes precedence over `zipCode`.
Unknown address properties are ignored during CTR mapping.

## Geolocation

The geolocation object is deliberately strict:

| Property | Range |
|----------|-------|
| `lat` | finite number from `-90` through `90` |
| `lng` | finite number from `-180` through `180` |

No additional geolocation properties are accepted. For example, `altitude`
causes container validation to fail.

## Public Key and Signatures

`publicKey` is decoded as Base64 and passed to the OCMF verifier as a DER/SPKI
public key. A typical P-256 key starts with the Base64 text `MFkw...`.

Both `ocmfBegin` and `ocmfEnd` are verified independently with this key. The
signature algorithm and hash are determined by the OCMF signature data; when
no algorithm is specified, the OCMF implementation uses
`ECDSA-secp256r1-SHA256` semantics.

The OCMF strings must remain byte-for-byte unchanged. In particular, do not
parse and reserialize the embedded JSON before placing it in the container.
OCMF signs its original payload text, so changes to whitespace, property order
or numeric formatting can invalidate the signature.

Within the surrounding JSON file, quotation marks and backslashes in each OCMF
record must of course be escaped according to normal JSON rules. After parsing
the envelope, the resulting string must still be the original OCMF record.

## Parsing and CTR Mapping

ChargyCore detects the format when a JSON object contains:

```json
{
  "format": "ptb"
}
```

After successful envelope validation, the adapter invokes the OCMF parser with
the records in this order:

```text
ocmfBegin
ocmfEnd
```

The container metadata is mapped as follows:

| PTB property | CTR field |
|--------------|-----------|
| `chargeboxIdentifier` | charging station `@id` |
| `chargeboxIdentifier` | EVSE `@id` |
| `address` | charging station address |
| `geoLocation.lat` | charging station latitude |
| `geoLocation.lng` | charging station longitude |
| OCMF meter identity | energy meter id |
| OCMF readings | measurement values, normally begin and end |

The OCMF parser performs its normal grouping and session conversion. Therefore
the two records should describe the same meter and session context. Their OCMF
fields must be compatible with a single OCMF document group.

## Validation and Error Handling

Container validation is separate from OCMF parsing and cryptographic
verification.

1. The JSON envelope is checked for mandatory properties, supported version,
   Base64 syntax, address data, coordinate ranges and complete-looking OCMF
   record prefixes.
2. The OCMF parser parses both records and creates the CTR.
3. Each OCMF signature is verified independently with the supplied public key.
4. The generated CTR proceeds through the normal Chargy verification flow.

All envelope violations are returned together as a structured
`IPTBValidationError`. Each issue contains a JSON-style path and a message, for
example:

```json
{
  "format": "ptb",
  "status": "InvalidSessionFormat",
  "issues": [
    {
      "path": "$.geoLocation.lat",
      "message": "must be a number between -90 and 90"
    },
    {
      "path": "$.ocmfBegin",
      "message": "must be an unmodified OCMF record beginning with OCMF|"
    }
  ]
}
```

The exact serialized representation of the status depends on the calling API;
the TypeScript value is `SessionVerificationResult.InvalidSessionFormat`.

A valid envelope does not imply valid signatures. If one signed OCMF payload
was modified, ChargyCore still returns a CTR and marks only the affected
measurement value as `InvalidSignature`. This preserves the readable session
data while making the failed cryptographic verification explicit.

## TypeScript Usage

Automatic content detection accepts a UTF-8 JSON file:

```ts
import { Chargy, type IPTBContainer } from "@open-charging-cloud/chargy-core";

declare const chargy: Chargy;
declare const container: IPTBContainer;

const result = await chargy.DetectAndConvertContentFormat([{
    name: "session.json",
    type: "application/json",
    data: new TextEncoder().encode(JSON.stringify(container))
}]);
```

The adapter can also be called directly:

```ts
import { PTB } from "@open-charging-cloud/chargy-core";

const result = await new PTB(chargy).TryToParsePTBContainer(container);
```

Callers should test whether `result` is a Charge Transparency Record before
accessing its sessions. Otherwise it is a structured session or validation
error.

## Test Data

The repository contains a complete PTB container built from the existing,
cryptographically valid `OCMF-Testdata-01` fixture:

```text
tests/fixtures/PTB/ptb-ocmf-testdata-01.json
```

The older simplified PTB examples and a variant with one modified OCMF payload
are also retained as legacy test data:

```text
tests/fixtures/PTB/ptb-simple.json
tests/fixtures/PTB/ptb-simple-signature_invalid.json
```

The integration and validation tests are in:

```text
tests/PTB.tests.ts
```
