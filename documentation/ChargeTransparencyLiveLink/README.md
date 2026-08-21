# Charge Transparency LiveLink

**Status:** Documentation of the implemented format

**Version:** 1.0

**JSON-LD context:** `https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0`

A Charge Transparency LiveLink is a small JSON/JSON-LD discovery document. It
describes one or more endpoints from which a client can obtain live charge-
transparency data for a charging session. It can also carry descriptive station
and connector metadata.

The LiveLink itself is not a signed meter-value format and does not define the
payloads sent by the discovered endpoints. ChargyCore currently recognizes and
returns the discovery document; it does not connect to the endpoints, generate
TOTP values or verify the optional LiveLink signatures.

The TypeScript implementation lives in:

```text
src/interfaces/IChargeTransparencyLiveLink.ts
```

## Representations

The canonical representation is a UTF-8 JSON object. The same JSON text can be
encoded in a QR code. ChargyCore's general QR-code input pipeline can extract
JSON from PNG, JPEG, GIF, WebP, BMP and SVG images before applying the normal
LiveLink recognition rules.

Producers should keep QR-encoded LiveLinks compact. Optional presentation data
can be omitted when the QR code only needs to convey an endpoint.

## Minimal Document

```json
{
  "@context": "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0",
  "transports": [
    {
      "type": "https",
      "url": "https://api.example.com/chargingSessions/1234567890/transparency/live"
    }
  ]
}
```

Only `@context` is mandatory to the current recognizer. For a useful,
interoperable LiveLink, producers should also provide at least one transport
with at least one endpoint.

## Complete Example

```json
{
  "@context": "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0",
  "timestamp": "2026-06-12T14:03:12Z",
  "description": {
    "en": "Charging Station 1234567890 Transparency LiveLink",
    "de": "Ladestation 1234567890 Transparenz-LiveLink"
  },
  "imageURLs": [
    "https://api.example.com/images/transparency-logo.svg"
  ],
  "geoLocation": {
    "lat": 50.387945,
    "lng": 10.4304
  },
  "connector": {
    "standard": "CCS",
    "format": "Type 2",
    "powerType": "DC",
    "maxPower": "150 kW"
  },
  "transports": [
    {
      "type": "https",
      "url": "https://api.example.com/chargingSessions/1234567890/transparency/live"
    },
    {
      "type": "websocket",
      "urls": [
        {
          "url": "wss://api1.example.com/chargingSessions/1234567890/transparency/live",
          "priority": 10,
          "weight": 60
        },
        {
          "url": "wss://api2.example.com/chargingSessions/1234567890/transparency/live",
          "priority": 10,
          "weight": 40
        }
      ],
      "totp": {
        "initialSharedSecret": "session-scoped-shared-secret",
        "timeStep": 30
      }
    },
    {
      "type": "httpSSE",
      "urls": [
        "https://api1.example.com/chargingSessions/1234567890/transparency/live",
        "https://api2.example.com/chargingSessions/1234567890/transparency/live"
      ]
    }
  ],
  "signatures": []
}
```

## Top-Level Properties

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `@context` | yes | exact context string shown above | Identifies version 1.0 of the Charge Transparency LiveLink format. |
| `timestamp` | no | ISO 8601 / RFC 3339 string or `null` | Creation or processing timestamp of the discovery document. |
| `description` | no | language-tag-to-string object | Human-readable station or session description. |
| `imageURLs` | no | array of strings | URLs of logos or other related images. |
| `geoLocation` | no | object with `lat` and `lng` numbers | Geographic position of the charging station. |
| `connector` | no | connector object | Descriptive connector and power information. |
| `transports` | no | array of transport objects | Available live-data access methods. |
| `signatures` | no | array of signature objects | Reserved for digital signatures over the LiveLink. |

Unknown properties are preserved in the parsed JSON object. They do not affect
LiveLink recognition unless they replace one of the known properties with an
invalid value.

### Timestamp handling

Producers should serialize `timestamp` as RFC 3339 with an explicit UTC offset,
preferably `Z` for UTC:

```text
2026-06-12T14:03:12Z
2026-06-12T16:03:12+02:00
```

When `timestamp` is absent or `null`, `DetectAndConvertContentFormat` inserts
the current time using JavaScript's `Date.prototype.toISOString()`. The original
object is otherwise returned unchanged.

The current recognizer checks only that a supplied timestamp is a string or
`null`; it does not yet validate the ISO 8601 syntax.

### Description and images

`description` is an internationalized string object. Its keys should be BCP 47
language tags and every value must be a string:

```json
{
  "de": "Ladepunkt am Haupteingang",
  "en": "Charge point at the main entrance"
}
```

Every `imageURLs` entry must be a string. Producers should use absolute HTTPS
URLs. The current recognizer does not validate URL syntax, media type or image
content.

## Geolocation

```json
{
  "lat": 50.387945,
  "lng": 10.4304
}
```

| Property | Recommended range |
|----------|-------------------|
| `lat` | `-90` through `90` |
| `lng` | `-180` through `180` |

Both properties are required by the TypeScript interface. The current runtime
guard only checks the type of properties that are present; it does not require
both coordinates or enforce finite values and geographic ranges. Producers
should nevertheless emit a complete, valid WGS 84 coordinate pair.

## Connector

All connector properties are optional strings:

| Property | Meaning | Example |
|----------|---------|---------|
| `standard` | Connector or charging standard | `CCS` |
| `format` | Physical connector format | `Type 2` |
| `powerType` | Supplied power type | `AC`, `DC` |
| `maxPower` | Human-readable maximum power, including its unit | `150 kW` |

The values are descriptive and are not normalized or converted by ChargyCore.
Unknown connector properties are allowed.

## Transports

Each entry in `transports` must have exactly one of the following type values:

| `type` | Intended transport |
|--------|--------------------|
| `https` | HTTPS request or polling endpoint |
| `httpSSE` | HTTP Server-Sent Events endpoint |
| `websocket` | WebSocket endpoint |

The type names are case-sensitive. Values such as `ftp`, `sse`, `ws` or
`WebSocket` are not recognized.

Every transport can contain:

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `type` | yes | one of the three strings above | Selects the transport variant. |
| `url` | conditionally | string | One endpoint. |
| `urls` | conditionally | array of strings and/or endpoint objects | Multiple alternative endpoints. |
| `totp` | no | TOTP configuration object | Shared configuration for access to this transport. |

For interoperability, a transport should contain `url` or at least one entry
in `urls`. The current recognizer permits both properties together and also
permits a transport containing only `type`.

### Multiple endpoints

An entry in `urls` can be an endpoint string:

```json
"https://api.example.com/transparency/live"
```

or an object:

```json
{
  "url": "wss://api.example.com/transparency/live",
  "priority": 10,
  "weight": 60
}
```

| Property | Required | Format |
|----------|----------|--------|
| `url` | yes | string |
| `priority` | no | number |
| `weight` | no | number |

`priority` and `weight` are endpoint-selection hints. Version 1.0 does not
define a selection algorithm, so producers and consumers that use them need to
agree on their precise ordering and weighting semantics.

The runtime guard requires a direct string entry to be non-empty after
trimming. For an endpoint object, it currently checks only that `url` is a
string and that `priority` and `weight`, when present, are numbers. It does not
validate URL schemes, numeric ranges or finite values.

### TOTP configuration

```json
{
  "initialSharedSecret": "session-scoped-shared-secret",
  "timeStep": 30
}
```

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `initialSharedSecret` | yes | string | Shared seed from which one-time passwords can be generated. |
| `timeStep` | yes | number | Time-step value, conventionally expressed in seconds. |

The current format does not specify the TOTP hash algorithm, number of digits,
secret encoding or how the generated value is sent to the endpoint. These
details require an external profile or agreement. ChargyCore validates only the
two property types and does not generate a TOTP value.

## Signatures

The TypeScript model reuses Chargy's general signature shape:

```json
{
  "algorithm": "example-algorithm",
  "format": "example-format",
  "previousValue": "optional-chain-value",
  "value": "encoded-signature"
}
```

All four fields are optional in that shared interface. More importantly, the
current LiveLink recognizer validates only that `signatures` is an array. It
does not validate individual entries, define canonicalization or covered
properties, resolve public keys, or verify a signature. Consumers must not
interpret the mere presence of this array as proof of authenticity.

## Recognition and Processing

ChargyCore recognizes a LiveLink when:

1. the parsed value is a non-null JSON object and not an array;
2. `@context` exactly equals the version 1.0 context;
3. every known optional property has the expected basic shape; and
4. every transport type is one of `https`, `httpSSE` or `websocket`.

When a single LiveLink is passed to `DetectAndConvertContentFormat`, ChargyCore
returns the same object after adding a missing timestamp. It does not download
`imageURLs`, open transport endpoints, or convert a LiveLink into a Charge
Transparency Record.

The context identifier is an identifier; recognition does not require a
network request to that URL.

## Recommended Producer Rules

The implementation intentionally accepts some incomplete values. Producers
should use the stricter rules below:

- emit the exact versioned `@context`;
- include at least one transport and at least one endpoint per transport;
- use RFC 3339 timestamps with an explicit offset;
- use absolute `https://` endpoints for `https` and `httpSSE`;
- use `wss://` endpoints for `websocket`;
- emit both coordinates and keep them within their geographic ranges;
- use finite, non-negative endpoint priorities and weights;
- use a positive, integral TOTP time step; and
- omit `signatures` unless a complete signature profile is available.

Consumers must still treat every URL and all returned live data as untrusted
input.

## Security and Privacy Considerations

- URL query parameters can be bearer credentials. Do not persist or log them
  unless necessary.
- `initialSharedSecret` is sensitive authentication material. Encoding a
  LiveLink in a publicly visible QR code also publishes that secret.
- Credentials should be short-lived, limited to one charging session and
  revocable.
- Clients should require TLS (`https://` or `wss://`) and validate the server
  certificate.
- A client that automatically opens arbitrary LiveLink URLs needs normal SSRF,
  redirect and local-network protections.
- Descriptions, locations, station identifiers and session URLs can reveal a
  person's location or charging activity.
- Endpoint data remains untrusted even when the discovery document was obtained
  from a trusted source.
- The current `signatures` property provides no authenticity guarantee because
  ChargyCore does not yet verify it.

## TypeScript Usage

Use the exported type guard when handling already-parsed JSON:

```ts
import {
  ChargeTransparencyLiveLinkContext,
  IsAChargeTransparencyLiveLink,
  type IChargeTransparencyLiveLink
} from "@open-charging-cloud/chargy-core";

const candidate: unknown = JSON.parse(jsonText);

if (IsAChargeTransparencyLiveLink(candidate)) {
  const liveLink: IChargeTransparencyLiveLink = candidate;

  console.log(ChargeTransparencyLiveLinkContext);
  console.log(liveLink.transports ?? []);
}
```

Automatic content detection accepts the JSON as file data and supplies a
missing timestamp:

```ts
import { Chargy, IsAChargeTransparencyLiveLink } from "@open-charging-cloud/chargy-core";

declare const chargy: Chargy;

const result = await chargy.DetectAndConvertContentFormat([{
  name: "live-link.json",
  type: "application/json",
  data: new TextEncoder().encode(jsonText)
}]);

if (IsAChargeTransparencyLiveLink(result)) {
  console.log(result.timestamp);
}
```

## Test Data

The repository contains one complete and one compact JSON fixture, plus PNG and
SVG QR representations of the compact document:

```text
tests/fixtures/ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json
tests/fixtures/ChargeTransparencyLive/ChargeTransparencyLiveLink_2.json
tests/fixtures/ChargeTransparencyLive/ChargeTransparencyLiveLink_2.png
tests/fixtures/ChargeTransparencyLive/ChargeTransparencyLiveLink_2.svg
```

Recognition and timestamp behavior are covered by:

```text
tests/ChargeTransparencyLiveLink.tests.ts
```
