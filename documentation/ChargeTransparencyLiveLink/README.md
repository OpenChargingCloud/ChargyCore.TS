# Charge Transparency LiveLink

**Status:** Documentation of the implemented format

**Version:** 1.0

**JSON-LD context:** `https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0`

A Charge Transparency LiveLink is a small JSON/JSON-LD discovery document. It
describes one or more endpoints from which a client can obtain live charge-
transparency data for a charging session. It can also carry descriptive station
and connector metadata, and the signed meter values measured so far.

The LiveLink itself is not a signed meter-value format and does not define the
payloads sent by the discovered endpoints. ChargyCore recognizes and returns the
discovery document, and on request parses and verifies the signed meter values
the document carries. When the document is signed as a whole, those signatures
are verified as well, and the outcome travels with the returned document. It
does not connect to the endpoints and does not generate TOTP values.

The TypeScript implementation lives in:

```text
src/interfaces/IChargeTransparencyLiveLink.ts
src/chargy.ts                                  (recognition, meter values)
src/DocumentSignatures.ts                      (signatures over the whole document)
```

## Renamed properties — read this before copying an older document

Four properties were renamed, **deliberately without a fallback**:

| Old name              | New name         | Since  |
| --------------------- | ---------------- | ------ |
| `timestamp`           | `created`        | 0.13.0 |
| `transports`          | `liveTransports` | 0.13.0 |
| `url`                 | `urls`           | 0.15.0 |
| `initialSharedSecret` | `sharedSecret`   | 0.15.0 |

The old names are not accepted, and they are not rejected either: they are
simply unknown properties now. Since 0.15.0 a document that still says
`timestamp` or `transports` is **not recognized as a LiveLink at all** —
recognition requires `created` and `liveTransports`, and such a document fails
as an unknown format rather than being read with no transports.

The two transport-level renames fail more quietly. A transport carrying only
`url` is still a well-formed transport — an unknown property is not an error —
but it names no endpoint, so there is nothing to poll. A `totp` still saying
`initialSharedSecret` is worse: `isTOTPConfig()` requires `sharedSecret`, so
the whole transport fails `isLiveTransport()` and a reader filtering by it
drops that transport without a word.

Earlier revisions of this document used the old names in their examples.
Producers copying from anywhere older than 0.15.0 must rename all four.

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
  "created": "2026-09-06T22:58:14Z",
  "liveTransports": [
    {
      "type": "https",
      "urls": [ "https://api1.example.com/chargingSessions/1234567890/transparency/live?token=abcdef" ]
    }
  ]
}
```

`@context`, `created` and `liveTransports` are what the recognizer requires —
this is the smallest document it accepts. `liveTransports` has to be an array,
but it is not read any further there, so an empty one would do; for a useful,
interoperable LiveLink, producers should provide at least one transport with at
least one endpoint.

This is `tests/fixtures/ChargeTransparencyLive/ChargeTransparencyLiveLink_2.json`.

## Complete Example

Shaped like the `OCMF-Test-01` fixtures, with the long hexadecimal values and
the repeated blocks abbreviated:

```json
{
  "@id": "5f2c8a10-7b64-4e19-9d3a-1c8e05b4a7f2",
  "@context": "https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0",
  "created": "2026-08-28T11:59:59Z",
  "lastUpdated": "2026-08-28T12:00:00Z",
  "updates": "BBF7392351CD7A4FBEECA67E7C6A201629566FE83548BF8FA038B4AED505EE74",
  "description": {
    "en": "OCMF-Test-01 Transparency Live-Link",
    "de": "OCMF-Test-01 Transparenz Live-Link"
  },

  "keyIdGeneration": [ "SubjectPublicKeyInfo", "DER", "SHA-256", "hex" ],
  "docRefIdGeneration": [ "SHA-256", "hex" ],

  "timeSource": {
    "isLegalTime": true,
    "authority": "Physikalisch-Technische Bundesanstalt",
    "accuracy": "+-2 ms",
    "stratum": 2,
    "syncInterval": "PT1H",
    "lastSynchronization": "2026-08-28T11:14:27Z",
    "minServers": 2,
    "serversURL": "https://time.ptb.de/files/ptb-ntp-services.json",
    "servers": [
      { "server": "nts://ptbtime1.ptb.de", "priority": 1 },
      { "server": "ntp://ptbtime3.ptb.de", "priority": 2 }
    ]
  },

  "chargingStationOperator": {
    "@id": "DE*GEF",
    "name": "GraphDefined",
    "publicKeys": [
      {
        "keyUsage": [ "signCTRs" ],
        "algorithm": "ECDSA-secp256r1",
        "encodings": [ "SubjectPublicKeyInfo", "DER", "hex" ],
        "value": "3059301306072A8648CE3D0201..."
      },
      {
        "keyUsage": [ "signEnergyMeterValues" ],
        "algorithm": "ECDSA-secp256r1",
        "encodings": [ "SubjectPublicKeyInfo", "DER", "hex" ],
        "value": "3059301306072A8648CE3D0201..."
      }
    ]
  },

  "chargingStation": {
    "@id": "DE*GEF*S12345678",
    "geoLocation": { "lat": 50.9279287, "lng": 11.5731785 },
    "address": {
      "street": "Biberweg 18",
      "town": "Jena",
      "zipCode": "04479"
    },
    "EVSE": {
      "@id": "DE*GEF*E12345678*1",
      "powerType": "AC",
      "maxPower": "22 kW",
      "energyMeter": {
        "@id": "GD-METER-OCMF-TEST-01",
        "manufacturer": { "name": "GraphDefined" },
        "model": { "name": "GD-OCMF-AC22" },
        "hardware": { "revision": "1.0.0" },
        "firmware": { "version": "1.0.0" },
        "signatureFormat": "https://open.charging.cloud/contexts/EnergyMeterSignatureFormats/OCMF",
        "publicKeys": [
          {
            "keyUsage": [ "signMeterValues" ],
            "algorithm": "ECDSA-secp256r1",
            "encodings": [ "SubjectPublicKeyInfo", "DER", "hex" ],
            "value": "3059301306072A8648CE3D0201..."
          }
        ]
      },
      "connector": {
        "@id": "1",
        "standard": "Type 2",
        "format": "Socket",
        "powerType": "AC",
        "maxPower": "22 kW",
        "cable": { "length": 1 }
      }
    }
  },

  "contract": {
    "@id": "04A9B7C21E5D80",
    "type": "rfid"
  },

  "liveTransports": [
    {
      "type": "https",
      "urls": [ "https://api1.example.com/chargingSessions/OCMF-Test-01/transparency/live?token=abcdef" ],
      "refresh": 10,
      "customHeaders": {
        "X-Key1": "headerValue1",
        "X-TOTP": {
          "valueProvider": "TOTP",
          "parameters": { "sharedSecret": "abcdefghijklmnopqrstuvwxyz1234567890" }
        }
      }
    },
    {
      "type": "websocket",
      "urls": [
        { "url": "wss://api1.example.com/chargingSessions/OCMF-Test-01/transparency/live", "priority": 10, "weight": 60 },
        { "url": "wss://api2.example.com/chargingSessions/OCMF-Test-01/transparency/live", "priority": 10, "weight": 40 }
      ],
      "totp": {
        "sharedSecret": "abcdefghijklmnopqrstuvwxyz1234567890",
        "timeStep": 10
      }
    },
    {
      "type": "httpSSE",
      "urls": [
        "https://api1.example.com/chargingSessions/OCMF-Test-01/transparency/live",
        "https://api2.example.com/chargingSessions/OCMF-Test-01/transparency/live"
      ]
    }
  ],

  "signedMeterValues": {
    "encodings": [ "OCMF", "plain" ],
    "values": [
      "OCMF|{\"FV\":\"1.4\",...}|{\"SA\":\"ECDSA-secp256r1-SHA256\",\"SE\":\"hex\",\"SM\":\"application/x-der\",\"SD\":\"3046...\"}"
    ]
  },

  "signatures": [
    {
      "keyId": "2D5BEE2B13118410C5FF9D6DDC0EEE2E03AB978FA1BC838AEE3655EB7095B9F1",
      "algorithm": "ECDSA-secp256r1-SHA256",
      "signedData": {
        "excludedProperties": [ "signatures" ],
        "encodings": [ "JSON", "JCS", "UTF-8" ]
      },
      "encodings": [ "Ecdsa-Sig-Value", "DER", "hex" ],
      "value": "3045022100CAE9A6..."
    }
  ]
}
```

## Top-Level Properties

### Declared top-level properties

Recognition checks `@context`, `created` and `liveTransports` — see
[Recognition and Processing](#recognition-and-processing). Nothing else is
validated there. A malformed optional property never turns the document into an
"unknown format": each one is read defensively where it is used, and whatever
fails its shape there is simply dropped.

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `@context` | yes | exact context string shown above | Identifies version 1.0 of the Charge Transparency LiveLink format. |
| `created` | yes | ISO 8601 / RFC 3339 string | Creation timestamp of the document, or of the series it belongs to. |
| `liveTransports` | yes | array of transport objects | Available live-data access methods. |
| `description` | no | language-tag-to-string object | Human-readable station or session description. |
| `timeSource` | no | time-source object | The clock behind every timestamp in the document. |
| `lastUpdated` | no | ISO 8601 / RFC 3339 string | When this particular document of a series was written. |
| `updates` | no | string | `docRefId` of the document this one supersedes. |
| `docRefIdGeneration` | no | array of strings | How `updates` references are computed, as an `encodings` pipeline. Default `[ "SHA-256", "hex" ]`. |
| `chargingStationOperator` | no | operator object | The operator running the station — see [The parties](#the-parties). |
| `chargingStation` | no | station object | Station, EVSE, energy meter and connector — see [Position, address and hardware](#position-address-and-hardware). |
| `chargingSessionId` | no | string | The charging session identification at the station or operator. |
| `eMobilityProvider` | no | provider object | The EV driver's e-mobility provider — see [The parties](#the-parties). |
| `contract` | no | contract object | `@id` and `type` of the identification that started the session. |
| `gridOperator` | no | grid operator object | The grid operator behind e.g. signed power constraints — see [The parties](#the-parties). |
| `signedMeterValues` | no | signed meter values object | The signed meter values measured so far — see [Signed meter values](#signed-meter-values). |
| `chargingPeriods` | no | array of charging-period objects | Tariffs and costs over the session. Start/stop timestamps should match a signed meter value timestamp. |
| `legallyRelevantLogMessages` | no | array of log-message objects | Legally relevant events, e.g. a time synchronization or a grid power constraint. |
| `supportMessages` | no | array of support-message objects | Messages between e.g. the EV driver and the CPO. |
| `keyIdGeneration` | no | array of strings | How key ids are computed, as an `encodings` pipeline. |
| `signatures` | no | array of signature entries | Digital signatures over the whole document — verified when present, see [Signatures](#signatures). |

Every optional property may also be present as an explicit `undefined` in the
TypeScript model; in JSON it is simply left out.

### Attached after reading

`DetectAndConvertContentFormat()` attaches two properties of its own once the
document has been read. They are results, not producer properties — and they
are added only after the signatures were verified, because the signatures cover
every property except themselves:

| Property | Meaning |
|----------|---------|
| `signatureVerification` | How the signatures over the whole document came out, per entry and as a whole. |
| `warnings` | Non-fatal findings, e.g. that the document is unsigned or that a signature did not match. |

### Carried by the fixtures, not declared by the interface

These properties are part of the format as the fixtures write it, but
`IChargeTransparencyLiveLink` does not declare them. They are reachable because
the interface extends `chargyLib.JSONObject`.

| Property | Meaning |
|----------|---------|
| `@id` | Identifier of the charging session this document describes. |
| `imageURLs` | URLs of logos or other related images. |
| `geoLocation` | Geographic position — **superseded**, see [Position, address and hardware](#position-address-and-hardware). |
| `connector` | Connector information — **superseded**, see below. |

Unknown properties are preserved in the parsed JSON object and never affect
recognition: only `@context`, `created` and `liveTransports` decide it.

### The parties

Four parties can appear on a LiveLink, each carrying its own `@id` and, where
it signs anything, its own `publicKeys`:

| Property | Party | What it is here for |
|----------|-------|---------------------|
| `chargingStationOperator` | CPO | Runs the station; signs the document and, usually, the meter values. |
| `eMobilityProvider` | EMP | The driver's provider; carries the `chargingTariffs` a session is billed by. |
| `gridOperator` | DSO | Sends e.g. signed power constraints, which appear as `legallyRelevantLogMessages`. |
| `contract` | — | Not a party but the identification that started the session, e.g. an RFID token. |

`gridOperator` is a grid operator's identity and keys, shaped like a charging
station operator's minus everything about charging infrastructure — a grid
operator runs no stations, pools or tariffs:

```json
"gridOperator": {
  "@id": "DE*VEN",
  "name": { "en": "Vanaheimr Electric" },
  "publicKeys": [
    {
      "keyUsage": [ "signGridPowerConstraints" ],
      "algorithm": "ECDSA-secp256r1",
      "encodings": [ "SubjectPublicKeyInfo", "DER", "hex" ],
      "value": "3059301306072A8648CE3D0201..."
    },
    {
      "keyUsage": [ "signGridPowerConstraints" ],
      "algorithm": "EdDSA-Ed25519",
      "encodings": [ "raw", "hex" ],
      "value": "0B442D1044571F14182EE7AE07A1400C..."
    }
  ]
}
```

`signGridPowerConstraints` is the `keyUsage` under which a grid operator signs
a power constraint, next to `signCTRs` for whole records and
`signMeterValues` / `signEnergyMeterValues` for readings. A constraint is
signed with every key the operator holds for that usage — the fixture uses one
ECDSA and one Ed25519 key, so a verifier that supports either can check it.

`@id` is the only property `IGridOperator` requires; `@context`, `name`,
`description`, `contact`, `support`, `privacy`, `geoLocation`, `imageURLs` and
`publicKeys` are optional. `name` and `description` are `I18NString` objects
keyed by language tag, not plain strings. Nothing is validated at recognition,
so a `gridOperator` that does not hold up is a malformed optional property like
any other.

Why a grid operator belongs in a *transparency* document at all: when the grid
asks a station to charge more slowly, the session's power drops for a reason
that is neither the car's nor the station's. Without the constraint and the key
it was signed with, that dip is indistinguishable from a fault, and the driver
has no way to check the explanation they were given.

The record format has the plural `gridOperators` for the same reason it has
`chargingStationOperators`: one document, several sessions, possibly several
grids. A live link describes a single ongoing session, so it names one.

### `created` handling

Producers should serialize `created` as RFC 3339 with an explicit UTC offset,
preferably `Z` for UTC:

```text
2026-08-28T11:59:59Z
2026-08-28T13:59:59+02:00
```

`created` is required and is **never filled in for the producer**. Until 0.15.0
a missing one was replaced with the current time, which recorded when the
document was *read*; in a legally relevant document that is not what "created"
means, and reading is not creating. A document without `created` is now not a
live link at all. Apart from the two attached result properties, the object is
returned as it was read.

Recognition requires `created` to be a string and looks no further: its syntax
is not validated, so a producer emitting something that is not RFC 3339 gets a
recognized document with an unusable timestamp.

In a series of documents describing the same session, `created` is when the
series began and is identical in every document; `lastUpdated` is what
distinguishes them. See
[`tests/fixtures/ChargeTransparencyLive/README.md`](../../tests/fixtures/ChargeTransparencyLive/README.md).

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

## Position, address and hardware

**The `chargingStation` block is the format. The top-level `geoLocation` and
`connector` are the earlier shape and are kept only so that documents written
before 0.13.0 stay recognizable.**

That is a decision this document has to state, because the two disagree.
Since `3a2d3ad` the fixtures put the position and the address on
`chargingStation`, the energy meter and the connector below an `EVSE` below
that, and the session identification into `contract.@id` — the same words a
charge transparency record uses, with the containment following the hardware.
They carry no top-level `geoLocation` and no top-level `connector` any more.
`IChargeTransparencyLiveLink` still declares both, and
`IsAChargeTransparencyLiveLink()` still validates them.

The station block wins for two reasons. It is what every current fixture is
written in, and it is what ChargyCore actually reads:
`collectLiveLinkMeterValueKeys()` resolves the meter keys through
`chargingStation.EVSE.energyMeter.publicKeys`, so the nested shape is load-
bearing, whereas nothing in the library reads the top-level pair.

```text
chargingStation
├── @id, geoLocation, address, description, manufacturer, model,
│   hardware, firmware, legalCompliance
└── EVSE
    ├── @id, powerType, maxPower
    ├── energyMeter    @id, manufacturer, model, hardware, firmware,
    │                  signatureFormat, signatureInfos, publicKeys
    └── connector      @id, standard, format, powerType, maxPower, cable
```

New producers should emit the station block and omit the top-level pair.
Consumers that want to support both should read the station block first and fall
back to the top-level properties. ChargyCore does not do this fallback itself —
it does not read either position today.

This mismatch is a **code gap, not a documentation one**: the interface and the
guard still describe the pre-`3a2d3ad` shape and nothing declares or validates
the station block. Aligning them is a change to
`src/interfaces/IChargeTransparencyLiveLink.ts`, not to this file.

### Legacy geolocation

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

Both properties are required by `IGeoLocation`. Recognition does not validate
them — it checks only `@context` — so nothing enforces finite values or
geographic ranges. Producers should nevertheless emit a complete, valid WGS 84
coordinate pair.

The same object shape is used at `chargingStation.geoLocation`, where it is not
validated at all.

### Legacy connector

All connector properties are optional strings:

| Property | Meaning | Example |
|----------|---------|---------|
| `standard` | Connector or charging standard | `Type 2` |
| `format` | Physical connector format | `Socket` |
| `powerType` | Supplied power type | `AC`, `DC` |
| `maxPower` | Human-readable maximum power, including its unit | `22 kW` |

The values are descriptive and are not normalized or converted by ChargyCore.
Unknown connector properties are allowed. The connector under
`chargingStation.EVSE.connector` uses the same properties plus `@id` and
`cable`, and is not validated by the guard.

## Live transports

Each entry in `liveTransports` must have exactly one of the following type
values:

| `type` | Intended transport |
|--------|--------------------|
| `https` | HTTPS request or polling endpoint |
| `httpSSE` | HTTP Server-Sent Events endpoint |
| `websocket` | WebSocket endpoint |

The type names are case-sensitive. Values such as `ftp`, `sse`, `ws` or
`WebSocket` are not recognized — such a transport is dropped where the
transports are read, and the rest of the document keeps working. Recognition
requires `liveTransports` to be an array and reads no entry of it, so no
transport can make the document fail recognition.

Every transport can contain:

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `type` | yes | one of the three strings above | Selects the transport variant. |
| `urls` | no | array of strings and/or endpoint objects | The endpoints, one or several. |
| `totp` | no | TOTP configuration object | Shared configuration for access to this transport. |
| `customHeaders` | no | object of header values | Headers to send with every request to this transport. |
| `refresh` | no | number | `https` only — how often to ask again, in seconds. |

A transport names its endpoints in `urls`, and only there. The singular `url`
was the older spelling of the same thing and was removed in 0.15.0:
`isLiveTransport()` does not look at it, so a transport carrying only `url` is
still a well-formed transport that names no endpoint. For interoperability, a
transport should contain at least one entry in `urls` — the guard permits a
transport containing only `type`.

### `refresh`

An `https` transport has to be asked, where the other two deliver on their own,
so only `https` says how often to ask:

```json
{
  "type": "https",
  "urls": [ "https://api1.example.com/chargingSessions/1234567890/transparency/live?token=abcdef" ],
  "refresh": 10
}
```

`refresh` is a number of **seconds**. **Its absence means
`defaultRefreshSeconds`, which is 10** — not "do not poll": an `https`
transport exists to be asked, and a document that names one without saying how
often still wants its readers to see what the session does next. A value that
is not a positive number is treated as absent.

It belongs to `TransportHTTPS` alone, and `isLiveTransport()` validates it only
there — on `httpSSE` and `websocket` a `refresh` property is
unknown like any other and is neither type-checked nor rejected. If either of
those transports ever needs a period of its own it will mean something other
than asking again, which is why the name is not shared.

A client is expected to clamp the period from below rather than obey it: the
Chargy WebApp polls no faster than every 5 seconds, whatever the document says.

### `customHeaders`

Every transport may state HTTP headers to be sent with every request to it — an
API key its endpoint expects, a tenant selector. An `https` poll, the opening
request of an `httpSSE` stream and the handshake of a `websocket` are all HTTP
requests, and all three can face an endpoint that expects a header:

```json
{
  "type": "https",
  "urls": [ "https://api1.example.com/chargingSessions/1234567890/transparency/live" ],
  "refresh": 10,
  "customHeaders": {
    "X-Key1": "headerValue1",
    "X-TOTP": {
      "valueProvider": "TOTP",
      "parameters": { "sharedSecret": "abcdefghijklmnopqrstuvwxyz1234567890" }
    }
  }
}
```

The property names are the header names, and a header name is an HTTP field
name: RFC 9110 defines it as a `token`, one or more of

    A-Z  a-z  0-9  ! # $ % & ' * + - . ^ _ ` | ~

and nothing else. HTTP compares them case-insensitively, so `X-Key` and `x-key`
are one header; which spelling wins is the client's rule, not this format's.

**A value is always a string: the literal text to send.** A JSON object in a
value position is never a value — it is always a call to a value provider:

| Value | Meaning |
|-------|---------|
| a string | The literal value to send. |
| an object with `valueProvider` and optional `parameters` | The value is computed per request. |

Anything else — a number, a boolean, an array, `null` — is a mistake, and
`isCustomHeaders()` rejects it.

A provider exists because some values cannot be written into a document at all:
a one-time password would be stale the moment it was. Version 1.0 defines the
shape, not the providers — what `"TOTP"` means and what its parameters are
called needs an external profile or agreement, exactly like the [TOTP
configuration](#totp-configuration). ChargyCore validates the shape and computes
no values; a client that does not know a provider sends no header for it rather
than sending the description of one.

Unlike `refresh`, `customHeaders` belongs to `ITransport` and is validated on
all three transport types. The headers belong to the transport that states
them: a header meant for the operator's polling endpoint has no business being
sent to another transport's URLs.

The provider names are not defined by version 1.0, with one convention worth
following: the Chargy WebApp implements `"TOTP"`, computing the value with
[`@open-charging-cloud/totp`](https://www.npmjs.com/package/@open-charging-cloud/totp)
for every single request, from `sharedSecret` (required), `validityTime`,
`totpLength`, `alphabet` and `hashAlgorithm`. The moment is deliberately not a
parameter — a timestamp out of a document would freeze the password.

What HTTP itself requires of a header — that a name is a token, that a value
carries no line break — is not checked here but by the client that sends it.
The Chargy WebApp drops the individual entries it cannot send — a malformed
name, a control character, an implausibly long value — and caps how many
headers one document may add to every request, rather than dropping the
transport over one bad entry.

Custom headers also change what the **endpoint** has to answer. A custom header
is not on the CORS safelist, so a browser-based client asks first, with an
`OPTIONS` request to the same URL that carries nothing of the actual request
but its description:

```http
OPTIONS /chargingSessions/1234567890/transparency/live?token=abcdef HTTP/1.1
Origin: https://chargy.charging.cloud
Access-Control-Request-Method: GET
Access-Control-Request-Headers: x-key1
```

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin:  *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: X-Key1
Access-Control-Max-Age:       600
```

The answer must be a 2xx and no redirect, and it must not require
authentication — the preflight has nothing to authenticate with, neither
cookies nor the header it is asking about. `Access-Control-Allow-Headers` has
to name every header the document states (compared case-insensitively; `*` is
valid because the request carries no credentials), and `Access-Control-Max-Age`
is what keeps a ten-second poll from paying for a preflight every time. The
answer to the actual `GET` still needs its own `Access-Control-Allow-Origin`: a
preflight permits the request, it does not make the response readable.

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
  "sharedSecret": "session-scoped-shared-secret",
  "timeStep": 30
}
```

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `sharedSecret` | yes | string | Shared seed from which one-time passwords can be generated. |
| `timeStep` | no | number | Time-step value, conventionally expressed in seconds. |
| `validityTime` | no | number | How long a generated value stays valid, in seconds. |
| `totpLength` | no | number | Number of characters of the generated value. |
| `alphabet` | no | string | The characters a generated value is drawn from. |
| `timestamp` | no | ISO 8601 / RFC 3339 string | The epoch the time steps are counted from. |
| `hashAlgorithm` | no | string | The hash the one-time password is derived with, e.g. `"SHA-256"`. |

`sharedSecret` is the only required property, and it is the one that decides
whether a transport survives: `isTOTPConfig()` requires it to be a string, so a
`totp` without it — or one still using the pre-0.15.0 name
`initialSharedSecret` — fails `isLiveTransport()` and takes its whole transport
with it. `hashAlgorithm` is a **string** naming the algorithm, not a number;
until 0.15.1 the guard asked for a number here and rejected every configuration
that named its hash at all.

Everything except `sharedSecret` is optional and unvalidated beyond its type.
The format still does not specify how a generated value is sent to the
endpoint, nor what the values of `alphabet` and `hashAlgorithm` may be — those
need an external profile or agreement. ChargyCore validates property types and
does not generate a TOTP value.

## Signed meter values

A LiveLink may carry the meter values measured so far. The property states once
how they are encoded, so `values` is a plain list of documents:

```json
"signedMeterValues": {
  "encodings": [ "OCMF", "plain" ],
  "values": [
    "OCMF|{...}|{...}",
    "OCMF|{...}|{...}"
  ]
}
```

A document without meter values omits `signedMeterValues` **entirely** rather
than carrying it with an empty `values` array, so that a consumer can tell "not
started yet" from "malformed".

`signedMeterValues` is not part of `IChargeTransparencyLiveLink` and is not
checked by `IsAChargeTransparencyLiveLink()`. It is read on request:

```ts
const ctr = await chargy.TryToParseLiveLinkMeterValues(liveLink);
```

`Chargy.TryToParseLiveLinkMeterValues()` returns a fully verified
`IChargeTransparencyRecord`, or `undefined` when there is nothing to return.
What it does:

1. Reads `signedMeterValues`. Absent → `undefined`.
2. Accepts only `encodings[0] === "OCMF"` with a non-empty `values` array of
   non-empty strings. Anything else — base64, another meter-value format — is
   left alone rather than guessed at, and yields `undefined`.
3. Collects the candidate public keys from the document itself, via
   `chargingStationOperator.publicKeys` and
   `chargingStation.EVSE.energyMeter.publicKeys`. An entry is taken when it has
   a non-empty `value`, its `encodings` end in `hex`, and its `keyUsage` — if
   stated — contains `signMeterValues` or `signEnergyMeterValues`. Several keys
   are normal: the meter typically signs the start and end values, the operator
   the intermediate ones.
4. Parses the documents with `OCMF.TryToParseOCMFDocuments()`, passing those
   keys and the `hex` encoding.
5. Runs the result through the same verification every other charge
   transparency record goes through, so each measurement value arrives with its
   crypto result.

**The LiveLink stays a LiveLink.** It describes a charging session that is still
running; a charge transparency record is a collection of finished ones, and an
application shows the two differently. `DetectAndConvertContentFormat()` returns
the LiveLink unchanged, and the meter values are produced only when asked for.
A `signedMeterValues` section that cannot be parsed costs nothing but itself:
the transports still work, there is just nothing to show.

Because the keys travel in the same document as the values they verify, a
successful verification establishes **consistency**, not **authenticity** — the
operator supplies both sides. See
[`tests/fixtures/ChargeTransparencyLive/README.md`](../../tests/fixtures/ChargeTransparencyLive/README.md),
"What the signatures do not prove".

## Signatures

`IChargeTransparencyLiveLink` declares `signatures` as Chargy's general
`ISignature[]`, whose four fields `algorithm`, `format`, `previousValue` and
`value` are all optional. The `OCMF-Test-01` fixtures write a richer, different
entry instead:

```json
{
  "keyId": "2D5BEE2B13118410C5FF9D6DDC0EEE2E03AB978FA1BC838AEE3655EB7095B9F1",
  "algorithm": "ECDSA-secp256r1-SHA256",
  "signedData": {
    "excludedProperties": [ "signatures" ],
    "encodings": [ "JSON", "JCS", "UTF-8" ]
  },
  "encodings": [ "Ecdsa-Sig-Value", "DER", "hex" ],
  "value": "3045022100CAE9A6..."
}
```

Both are accepted structurally — recognition does not look at the entries. But
since 0.14.0 the entries **are verified** whenever the document carries any:
`verifyDocumentSignatures()` removes the properties an entry excludes,
canonicalizes the rest per RFC 8785, resolves the signing key by the `keyId`
the entry names — following the document's own `keyIdGeneration`, wrapping a
raw-stored key into its `SubjectPublicKeyInfo` form first — and verifies the
signature with it. ECDSA over P-256, P-384 and P-521, Ed25519, Ed448 and
ML-DSA-44/65/87 are understood.

None of this is fatal. An unsigned document, an unknown key and even a
signature that demonstrably does not match are reported — as
`signatureVerification` and as graded `warnings` on the returned document —
never a reason to refuse it: its transports still work, and its signed meter
values carry their own signatures, which are verified separately.

The signature scheme itself — key id, excluded properties, JCS canonicalization,
one signature per key and algorithm — is documented in
[`tests/fixtures/ChargeTransparencyLive/README.md`](../../tests/fixtures/ChargeTransparencyLive/README.md).
The declared `ISignature[]` still does not describe this richer entry shape;
the verifier reads the entries defensively instead.

## Recognition and Processing

ChargyCore recognizes a LiveLink when:

1. the parsed value is a non-null JSON object;
2. `created` is present and is a string;
3. `liveTransports` is an array; and
4. `@context` exactly equals the version 1.0 context, or is an array of strings
   containing it.

Those are the three things every live link has: what it is, when it was
created, and where its updates can be fetched. Nothing else decides
recognition. A malformed optional property — a broken transport, a numeric
`connector` — never turns the document into an "unknown format": whatever fails
its shape is dropped where it is read. That is why `liveTransports` is checked
only for being an array: a single broken transport must not cost the document
its identity and send it on to fail as an unknown format.

The guards for the per-field shapes (`isConnector`, `isLiveTransport`,
`isTOTPConfig`, `isCustomHeaders`, `isCustomHeaderValue`, …) are exported for
exactly that point-of-use filtering; note that some of them use
`chargyLib.isObject()`, which accepts arrays as well as objects.

When a single LiveLink is passed to `DetectAndConvertContentFormat`, ChargyCore
verifies the signatures the document carries over itself — see
[Signatures](#signatures) — and attaches the outcome as `signatureVerification`
plus `warnings`. Those are added only after verification, because the
signatures cover every property except themselves. It does not download
`imageURLs` and does not open transport endpoints, and it does not convert the
LiveLink into a Charge Transparency Record — but the signed meter values it
carries can be parsed and verified on request with
`Chargy.TryToParseLiveLinkMeterValues()`, which builds a separate record and
leaves the LiveLink itself untouched.

A LiveLink also suppresses public-key-lookup detection: a file set containing
one is never treated as a collection of public keys.

The context identifier is an identifier; recognition does not require a
network request to that URL.

## Recommended Producer Rules

The implementation intentionally accepts some incomplete values. Producers
should use the stricter rules below:

- emit the exact versioned `@context`;
- use `created` and `liveTransports`, never `timestamp` or `transports`, and
  emit `created` always — it is required, and nothing fills it in;
- name endpoints in `urls`, never in the removed singular `url`;
- name a TOTP seed `sharedSecret`, never the removed `initialSharedSecret`;
- include at least one transport and at least one endpoint per transport;
- use RFC 3339 timestamps with an explicit offset;
- use absolute `https://` endpoints for `https` and `httpSSE`;
- use `wss://` endpoints for `websocket`;
- state `refresh` on an `https` transport whose period differs from the default
  of 10 seconds, and never on the other two transport types;
- use header names that are valid HTTP tokens, never one a browser refuses to
  set (`Host`, `Origin`, `Cookie`, `Sec-*`, …), and state a header only on the
  transport whose endpoint actually needs it;
- state a header value as a string, and use an object only to call a value
  provider;
- put the position, the address, the meter and the connector on
  `chargingStation`, and omit the top-level `geoLocation` and `connector`;
- emit both coordinates and keep them within their geographic ranges;
- use finite, non-negative endpoint priorities and weights;
- use a positive, integral TOTP time step, and name the TOTP hash algorithm as
  a string when one is agreed;
- state a `gridOperator` whenever the session carries grid-signed power
  constraints, together with the keys those constraints were signed with;
- omit `signedMeterValues` entirely while there are none; and
- omit `signatures` unless a complete signature profile is available.

Consumers must still treat every URL and all returned live data as untrusted
input.

## Security and Privacy Considerations

- URL query parameters can be bearer credentials. Do not persist or log them
  unless necessary.
- `sharedSecret` is sensitive authentication material. Encoding a
  LiveLink in a publicly visible QR code also publishes that secret. A literal
  `customHeaders` value — an API key — and the parameters of a value provider
  are just as sensitive, and just as published.
- Credentials should be short-lived, limited to one charging session and
  revocable.
- Clients should require TLS (`https://` or `wss://`) and validate the server
  certificate.
- A client that automatically opens arbitrary LiveLink URLs needs normal SSRF,
  redirect and local-network protections, and should clamp `refresh` from below
  rather than trust it.
- `customHeaders` is a document telling a client what to put into a request.
  A client should validate every name and value before sending it, cap how many
  it accepts, send them only to the URLs of the transport that stated them, and
  not follow redirects with them.
- Descriptions, locations, station identifiers and session URLs can reveal a
  person's location or charging activity.
- Endpoint data remains untrusted even when the discovery document was obtained
  from a trusted source.
- The `signatures` over the document are verified, but against the public keys
  the very same document carries: a good result proves the document is
  internally consistent and untampered since signing, not that the signer is
  who the document claims to be. Authenticity needs a trust anchor outside the
  document. A missing or broken signature is reported as a warning, never by
  refusing the document.
- A verified `signedMeterValues` section proves that the values are consistent
  with the keys in the same document. It does not prove that those keys belong
  to a calibrated meter — that needs a trust anchor outside the document.

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
  console.log(liveLink.liveTransports ?? []);
}
```

Automatic content detection accepts the JSON as file data. It verifies the
document's signatures and attaches the outcome; it does not supply anything the
producer left out:

```ts
import { Chargy, IsAChargeTransparencyLiveLink } from "@open-charging-cloud/chargy-core";

declare const chargy: Chargy;

const result = await chargy.DetectAndConvertContentFormat([{
  name: "live-link.json",
  type: "application/json",
  data: new TextEncoder().encode(jsonText)
}]);

if (IsAChargeTransparencyLiveLink(result)) {
  console.log(result.created);

  // How the signatures over the whole document came out.
  console.log(result.signatureVerification?.status, result.warnings ?? []);

  // The meter values are a separate, optional view onto the same document.
  const ctr = await chargy.TryToParseLiveLinkMeterValues(result);

  if (ctr !== undefined)
    for (const value of ctr.chargingSessions?.[0]?.measurements?.[0]?.values ?? [])
      console.log(value.result?.status);
}
```

## Test Data

The fixtures live under `tests/fixtures/ChargeTransparencyLive/`:

```text
ChargeTransparencyLiveLink_1.json     a full live link — byte-identical to
                                      OCMF-Test-01__0034.json
ChargeTransparencyLiveLink_2.json     the minimal form: context, created and
                                      one https transport
ChargeTransparencyLiveLink_2.png      QR-code representations of the
ChargeTransparencyLiveLink_2.svg      minimal form
OCMF-Test-01/                         the generated series it comes from
```

`OCMF-Test-01/` is a simulated 22 kW AC charging session of five minutes with a
new signed meter reading every ten seconds, during which the grid operator
limits the charging power to 6 kW for one minute. It is published as a series
of **35** documents — `OCMF-Test-01__0000.json` through `__0034.json` — each
signed as a whole and chained to its predecessor by `updates`. `__0000.json`
carries no meter values at all and omits `signedMeterValues`; each later
document adds the readings that arrived since, and one document per event, so
the announcement of the constraint gets a document of its own.

That constraint is what makes the series more than a meter log: it is a
`legallyRelevantLogMessage` signed by the grid operator under
`signGridPowerConstraints`, the meter takes an extra reading where it begins
and where it ends, the power in between stays below the limit, and the charging
periods are cut at both ends of it. The dip in the curve has a signed
explanation next to it.

The directory also holds the hand-maintained template
`OCMF-Test-01__TEMPLATE.json`, the log messages `OCMF-Test-01__LRLMs.json` whose
times are relative to the start reading, the generator `generateOCMFTest01.mjs`
and six key pairs as PEM files.

The generated files are always overwritten; the template is what to edit. Note
that a rerun rewrites the **whole** series, because a new signature changes a
document's `docRefId` and therefore the `updates` of its successor.

```bash
node tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/generateOCMFTest01.mjs
```

Two READMEs describe the conventions and are the reference for anything the
format does beyond what the runtime guard checks — the `encodings` pipelines,
key ids, the signature scheme and canonicalization, the rules a series has to
satisfy, the time source, and what the signatures do and do not prove:

```text
tests/fixtures/ChargeTransparencyLive/README.md
tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/README.md
```

Recognition, `created` handling, meter-value parsing and the signatures over
the whole document are covered by:

```text
tests/ChargeTransparencyLiveLink.tests.ts
tests/DocumentSignatures.tests.ts
```
