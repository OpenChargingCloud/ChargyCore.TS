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

## Renamed in 0.13.0 — read this before copying an older document

Two top-level properties were renamed, **deliberately without a fallback**:

| Until 0.12.1 | Since 0.13.0     |
| ------------ | ---------------- |
| `timestamp`  | `created`        |
| `transports` | `liveTransports` |

The old names are not accepted, and they are not rejected either: they are
simply unknown properties now. A document that still says `transports` is
therefore recognized as a perfectly valid LiveLink **with no transports at
all**, and nothing reports this. The same holds for `timestamp`, which is
silently replaced by a freshly generated `created`.

Earlier revisions of this document used the old names in their examples.
Producers copying from anywhere older than 0.13.0 must rename both properties.

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
  "liveTransports": [
    {
      "type": "https",
      "url": "https://api1.example.com/chargingSessions/1234567890/transparency/live?token=abcdef"
    }
  ]
}
```

Only `@context` is mandatory to the current recognizer. For a useful,
interoperable LiveLink, producers should also provide at least one transport
with at least one endpoint.

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
      "url": "https://api1.example.com/chargingSessions/OCMF-Test-01/transparency/live?token=abcdef",
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
        "initialSharedSecret": "abcdefghijklmnopqrstuvwxyz1234567890",
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

Recognition checks nothing but `@context` — see
[Recognition and Processing](#recognition-and-processing). A malformed optional
property never turns the document into an "unknown format": each one is read
defensively where it is used, and whatever fails its shape there is simply
dropped. The declared properties are:

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `@context` | yes | exact context string shown above | Identifies version 1.0 of the Charge Transparency LiveLink format. |
| `created` | no | ISO 8601 / RFC 3339 string or `null` | Creation timestamp of the document, or of the series it belongs to. |
| `description` | no | language-tag-to-string object | Human-readable station or session description. |
| `imageURLs` | no | array of strings | URLs of logos or other related images. |
| `geoLocation` | no | object with `lat` and `lng` numbers | Geographic position — **superseded**, see [Position, address and hardware](#position-address-and-hardware). |
| `connector` | no | connector object | Connector information — **superseded**, see below. |
| `liveTransports` | no | array of transport objects | Available live-data access methods. |
| `signatures` | no | array of signature entries | Digital signatures over the whole document — verified when present, see [Signatures](#signatures). |

### Attached after reading

`DetectAndConvertContentFormat()` attaches two properties of its own once the
document has been read. They are results, not producer properties — and they
are added only after the signatures were verified, because the signatures cover
every property except themselves:

| Property | Meaning |
|----------|---------|
| `signatureVerification` | How the signatures over the whole document came out, per entry and as a whole. |
| `warnings` | Non-fatal findings, e.g. that the document is unsigned or that a signature did not match. |

### Carried by the fixtures, not validated by the guard

These properties are part of the format as the fixtures write it, but
`IChargeTransparencyLiveLink` does not declare them and the runtime guard does
not look at them. They are reachable because the interface extends
`chargyLib.JSONObject`. ChargyCore reads `signedMeterValues` together with the
public keys under `chargingStation` and `chargingStationOperator` — and, when
the document carries `signatures`, also `keyIdGeneration` and those same public
keys to verify them.

| Property | Meaning |
|----------|---------|
| `@id` | Identifier of the charging session this document describes. |
| `lastUpdated` | When this particular document of a series was written. |
| `updates` | `docRefId` of the document this one supersedes. |
| `keyIdGeneration` | How key ids are computed, as an `encodings` pipeline. |
| `docRefIdGeneration` | How `updates` references are computed. |
| `timeSource` | The clock behind every timestamp in the document. |
| `chargingStationOperator` | Operator `@id`, `name` and `publicKeys`. |
| `chargingStation` | Station, EVSE, energy meter and connector — see below. |
| `contract` | `@id` and `type` of the identification that started the session. |
| `signedMeterValues` | The signed meter values measured so far — see below. |

Unknown properties are preserved in the parsed JSON object and never affect
recognition: only `@context` decides it.

### `created` handling

Producers should serialize `created` as RFC 3339 with an explicit UTC offset,
preferably `Z` for UTC:

```text
2026-08-28T11:59:59Z
2026-08-28T13:59:59+02:00
```

When `created` is absent or `null`, `DetectAndConvertContentFormat` inserts the
current time using JavaScript's `Date.prototype.toISOString()` — after the
document's signatures were verified, never before: the signatures cover every
property except themselves, so a timestamp defaulted first would turn a good
signature into a bad one. Apart from that and the two attached result
properties, the object is returned as it was read.

Recognition does not look at `created` at all, and its syntax is not
validated.

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
checks only `@context`, so no transport can make the document fail it.

Every transport can contain:

| Property | Required | Format | Meaning |
|----------|----------|--------|---------|
| `type` | yes | one of the three strings above | Selects the transport variant. |
| `url` | conditionally | string | One endpoint. |
| `urls` | conditionally | array of strings and/or endpoint objects | Multiple alternative endpoints. |
| `totp` | no | TOTP configuration object | Shared configuration for access to this transport. |
| `refresh` | no | number | `https` only — how often to ask again, in seconds. |
| `customHeaders` | no | object of header values | `https` only — headers to send with every request to this transport. |

For interoperability, a transport should contain `url` or at least one entry
in `urls`. The transport reader permits both properties together and also
permits a transport containing only `type`.

### `refresh`

An `https` transport has to be asked, where the other two deliver on their own,
so only `https` says how often to ask:

```json
{
  "type": "https",
  "url": "https://api1.example.com/chargingSessions/1234567890/transparency/live?token=abcdef",
  "refresh": 10
}
```

`refresh` is a number of **seconds**. **Its absence means: do not poll.**

It belongs to `TransportHTTPS` alone, and `IsAChargeTransparencyLiveLink()`
validates it only there — on `httpSSE` and `websocket` a `refresh` property is
unknown like any other and is neither type-checked nor rejected. If either of
those transports ever needs a period of its own it will mean something other
than asking again, which is why the name is not shared.

A client is expected to clamp the period from below rather than obey it: the
Chargy WebApp polls no faster than every 5 seconds, whatever the document says.

### `customHeaders`

An `https` transport may state HTTP headers to be sent with every request to
it — an API key its endpoint expects, a tenant selector:

```json
{
  "type": "https",
  "url": "https://api1.example.com/chargingSessions/1234567890/transparency/live",
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

The property names are the header names. A value is one of two things:

| Value | Meaning |
|-------|---------|
| a string | The literal value to send. |
| an object with `valueProvider` and optional `parameters` | The value is computed per request. |

A provider exists because some values cannot be written into a document at all:
a one-time password would be stale the moment it was. Version 1.0 defines the
shape, not the providers — what `"TOTP"` means and what its parameters are
called needs an external profile or agreement, exactly like the [TOTP
configuration](#totp-configuration). ChargyCore validates the shape and computes
no values; a client that does not know a provider sends no header for it rather
than sending the description of one.

Like `refresh`, `customHeaders` belongs to `TransportHTTPS` alone and is
validated only there — on `httpSSE` and `websocket` it is an unknown property
like any other. The headers also belong to the transport that states them: a
header meant for the operator's polling endpoint has no business being sent to
another transport's URLs.

What HTTP itself requires of a header — that a name is a token, that a value
carries no line break — is not checked here but by the client that sends it.
The Chargy WebApp drops the individual entries it cannot send — a malformed
name, a control character, an implausibly long value — and caps how many
headers one document may add to every request, rather than dropping the
transport over one bad entry.

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

1. the parsed value is a non-null JSON object; and
2. `@context` exactly equals the version 1.0 context.

Nothing else decides recognition. A malformed optional property — a broken
transport, a numeric `connector` — never turns the document into an "unknown
format": the context identifies it, and whatever fails its shape is dropped
where it is read. The guards for those shapes (`isConnector`, `isTransport`,
`isTOTPConfig`, `isCustomHeaders`, `isCustomHeaderValue`, …) are exported for
exactly that point-of-use filtering; note that some of them use
`chargyLib.isObject()`, which accepts arrays as well as objects.

When a single LiveLink is passed to `DetectAndConvertContentFormat`, ChargyCore
first verifies the signatures the document carries over itself — see
[Signatures](#signatures) — attaches the outcome as `signatureVerification`
plus `warnings`, and then adds a missing `created`; in that order, because the
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
- use `created` and `liveTransports`, never `timestamp` or `transports`;
- include at least one transport and at least one endpoint per transport;
- use RFC 3339 timestamps with an explicit offset;
- use absolute `https://` endpoints for `https` and `httpSSE`;
- use `wss://` endpoints for `websocket`;
- state `refresh` on `https` transports that should be polled, and omit it on
  those that should not — and never on the other two transport types;
- state `customHeaders` only on `https` transports, use header names that are
  valid HTTP tokens and values a client can send unchanged, and state a header
  only where its endpoint actually needs it;
- put the position, the address, the meter and the connector on
  `chargingStation`, and omit the top-level `geoLocation` and `connector`;
- emit both coordinates and keep them within their geographic ranges;
- use finite, non-negative endpoint priorities and weights;
- use a positive, integral TOTP time step;
- omit `signedMeterValues` entirely while there are none; and
- omit `signatures` unless a complete signature profile is available.

Consumers must still treat every URL and all returned live data as untrusted
input.

## Security and Privacy Considerations

- URL query parameters can be bearer credentials. Do not persist or log them
  unless necessary.
- `initialSharedSecret` is sensitive authentication material. Encoding a
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

Automatic content detection accepts the JSON as file data and supplies a
missing `created`:

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
                                      OCMF-Test-01__0019.json
ChargeTransparencyLiveLink_2.json     the minimal form: context and one
                                      https transport
ChargeTransparencyLiveLink_2.png      QR-code representations of the
ChargeTransparencyLiveLink_2.svg      minimal form
OCMF-Test-01/                         the generated series it comes from
```

`OCMF-Test-01/` is a simulated 22 kW AC charging session of three minutes with a
new signed meter reading every ten seconds, published as a series of **twenty**
documents — `OCMF-Test-01__0000.json` through `__0019.json` — each signed as a
whole and chained to its predecessor by `updates`. `__0000.json` carries no
meter values at all and omits `signedMeterValues`; each later document adds the
readings that arrived since. The directory also holds the hand-maintained
template `OCMF-Test-01__TEMPLATE.json`, the generator `generateOCMFTest01.mjs`
and four key pairs as PEM files.

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
