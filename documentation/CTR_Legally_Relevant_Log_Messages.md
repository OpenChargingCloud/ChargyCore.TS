# CTR Legally Relevant Log Messages

**Status:** Draft specification proposal  
**Version:** 0.1  
**Intended audience:** CTR producers, charging-station and meter vendors,
backend operators, transparency software implementers, and conformity
assessment bodies

## 1. Introduction

A Charge Transparency Record (CTR) contains signed measurements and metadata
needed to understand and verify a charging process. Measurements alone cannot
describe every event that may affect the legal, metrological, contractual, or
evidential interpretation of that process.

Examples include meter resets, relevant configuration changes, tariff changes,
clock corrections, loss of synchronization, and failures affecting legally
relevant data.

This document defines a generic model for legally relevant log messages. It
provides machine-readable semantics, integrity protection, ordering, pagination,
and detection of missing, duplicated, reordered, or replaced messages.

Time-specific events and current clock state are specified separately in
[CTR Time Synchronization Sources](CTR_Time_Synchronization_Sources.md).

## 2. Regulatory Motivation

### 2.1 The amended EU Measuring Instruments Directive

[Directive (EU) 2026/706](https://eur-lex.europa.eu/eli/dir/2026/706/oj)
amends Directive 2014/32/EU and introduces the instrument-specific `MI-011`
requirements for measuring systems for electric vehicle supply equipment
(EVSE). Member States must adopt the necessary national measures by 10 April
2028 and apply them from 10 October 2028, subject to the transitional provisions
in the Directive.

The new EVSE annex gives particular importance to failures that are not readily
visible from normal device operation. It defines a `critical fault` as a failure
under a disturbance in which the device appears to function correctly while
legally relevant data is incorrect or the measurement-accuracy shift exceeds
the permitted test value. Section 5.1 of the annex requires EVSE measuring
systems to be designed and manufactured so that disturbances do not cause such
critical faults. Section 5.2 additionally requires legally relevant data to
remain correct, or the accuracy shift to remain within `1.0 BMPE`, even when the
system appears to function correctly.

The amended general requirements also strengthen the evidential context around
results. Section 10.2 requires indicated results for EVSE measuring systems to
be protected against accidental deletion or modification. Section 10.6 requires
the measurement result and other data relevant to that result to be accessible
without tools through a controlled local record, remote display, or consumer or
end-user device. It also requires evidence when tampering occurs.

These provisions make a relevant distinction between:

- the externally observable condition of a charging system;
- the correctness and quality of its legally relevant data; and
- evidence that allows a consumer, operator, verifier, or authority to
  understand exceptional conditions affecting a result.

### 2.2 Why legally relevant log messages are an appropriate response

A conventional signed-meter-value solution primarily proves that an exported
value has not been altered after signing and that it originated from the holder
of a particular key. A valid signature does not by itself prove that the
measurement was correct when it was produced, that the complete measuring
system was healthy, or that no significant fault occurred during the charging
transaction.

Integrity-protected legally relevant log messages complement signed
measurements by recording conditions that may affect their interpretation. For
example, they can establish that:

- a disturbance, degraded state, or internal diagnostic condition occurred;
- the condition affected a specified meter, clock, EVSE, or charging session;
- a transaction was stopped, resumed, or continued according to a defined
  policy;
- a result was produced while a relevant subsystem was degraded;
- the condition was visible to downstream systems even if the charging device
  otherwise appeared to operate normally; and
- the event history is complete for a declared stream range.

This is a meaningful evolution from CTR profiles centred almost exclusively on
individually signed start and stop readings. It makes the state surrounding a
measurement independently inspectable instead of treating a cryptographically
valid measurement value as sufficient evidence of system correctness.

### 2.3 Important legal and technical limitation

Directive (EU) 2026/706 does **not** explicitly mandate the log-message format
defined by this document. Nor does the presence of an error message make an
incorrect measurement compliant. In particular, an implementation cannot cure
a prohibited critical fault merely by logging that the fault occurred.

This specification should therefore be understood as a technical evidence and
transparency mechanism that supports the objectives of the amended MID:

- it helps expose otherwise latent legally relevant conditions;
- it provides durable and integrity-protected evidence for later verification;
- it supports consistent presentation to consumers and transparency software;
- it may support conformity assessment and market-surveillance analysis; and
- it allows future regulatory or normative profiles to declare exactly which
  events must be generated and retained.

The precise events, thresholds, retention periods, and conformity consequences
remain matters for applicable legislation, national transposition, harmonised
standards, normative documents, conformity-assessment decisions, and regulatory
guidance. This document deliberately does not claim that its use alone
establishes MID conformity.

### 2.4 Relationship to earlier legal-metrology requirements

The underlying principle is not entirely new. Annex I, Section 6 of Directive
2014/32/EU already requires measuring instruments to reduce the effect of a
defect leading to an inaccurate result unless the defect is obvious. The
important development in Directive (EU) 2026/706 is the explicit EVSE-specific
definition of a critical fault, the direct reference to incorrect legally
relevant data while the system appears to function correctly, and the new
harmonised `MI-011` framework for the complete EVSE measuring system.

Accordingly, this document does not assert that earlier German calibration-law
solutions lacked all event or intervention evidence. It states the narrower and
better-supported conclusion that the amended MID provides a strong reason to
standardise such evidence as a first-class, interoperable CTR concept rather
than leaving it to vendor-specific diagnostics.

## 3. Conformance Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear
in all capitals.

This is a draft data-model proposal. It does not by itself establish regulatory
or legal conformance.

## 4. Design Goals

The model is intended to provide:

- event semantics independent of human translations;
- cryptographic integrity and origin authentication;
- detection of missing, duplicated, reordered, or replaced messages;
- explicit stream boundaries and reset semantics;
- support for multiple producers and subjects within one CTR;
- deterministic signature verification across implementations;
- references from one event to one or more charging sessions; and
- forward-compatible identifiers and extension points.

The model cannot prove that a device created every event that it should have
created. It can detect removal or alteration after creation when the producer
protects the event stream and its boundaries as specified below.

## 5. Terminology

### 5.1 Legally relevant log message

An immutable event emitted because a state change, action, or failure may
affect the interpretation or trustworthiness of a charging process.

Legal relevance and technical severity are separate. An informational event
can be legally relevant, while a severe operational event can be irrelevant to
the CTR.

### 5.2 Log stream

An ordered sequence of legally relevant messages produced under one stream
identifier and epoch. Its counter advances only for messages belonging to that
legally relevant stream.

### 5.3 Stream epoch

A stable identifier for one lifetime of a sequence counter. A producer starts a
new epoch when it cannot safely continue the preceding counter, for example
after device replacement, loss of persistent state, or a defined reset.

### 5.4 Stream manifest

An integrity-protected declaration of the first and last message, count, hashes,
producer, and time range included from a log stream.

## 6. CTR Placement

The following top-level CTR properties are proposed:

```json
{
  "legallyRelevantLogMessages": [],
  "legallyRelevantLogStreams": []
}
```

Messages SHOULD have one canonical representation in the top-level event store.
A charging session MAY refer to applicable messages by identifier:

```json
{
  "@id": "urn:charging-session:4711",
  "legallyRelevantLogMessageIds": [
    "urn:event:01J2TIME7QX4H6E2K8ZT0K5P9R"
  ]
}
```

This avoids duplicating an event that applies to multiple sessions. An
implementation MAY accept session-embedded events for compatibility, but the
same event MUST NOT appear as independently signed copies in both places.

## 7. Message Model

### 7.1 Example

```json
{
  "@id": "urn:event:01J2TIME7QX4H6E2K8ZT0K5P9R",
  "@context": "https://open.charging.cloud/contexts/CTR-LegalLogMessage+json",
  "timestamp": "2026-07-04T14:18:03.102+02:00",
  "systemUptime": "P17DT4H12M03.221S",
  "severity": "warning",
  "tags": [
    "time.synchronization",
    "time.source.change"
  ],
  "messageCode": "TIME_SOURCE_CHANGED",
  "messageData": {
    "reason": "failover"
  },
  "message": {
    "de": "Die authentisierte Zeitquelle wurde gewechselt.",
    "en": "The authenticated time source was changed."
  },
  "scope": {
    "subjects": [
      {
        "type": "clock",
        "id": "urn:clock:station-controller"
      }
    ],
    "chargingSessionIds": [
      "urn:charging-session:4711"
    ]
  },
  "pagination": {
    "streamId": "urn:logstream:station-controller",
    "epoch": "boot-4711",
    "sequenceNumber": "1842"
  },
  "previousHash": "sha256:...",
  "eventHash": "sha256:...",
  "signatures": []
}
```

### 7.2 Properties

| Property | Requirement | Description |
|---|---:|---|
| `@id` | REQUIRED | Globally unique and stable event identifier. |
| `@context` | OPTIONAL | JSON-LD context or array of contexts. |
| `timestamp` | REQUIRED | RFC 3339 event time with an explicit UTC offset. |
| `systemUptime` | RECOMMENDED | Monotonic uptime at detection as an ISO 8601 duration. |
| `severity` | REQUIRED | Technical severity defined in Section 8. |
| `tags` | OPTIONAL | Unique and stable categorization identifiers. |
| `messageCode` | REQUIRED | Stable machine-readable event type. |
| `messageData` | OPTIONAL | Code-specific JSON-compatible structured data. |
| `message` | OPTIONAL | Human-readable translations issued by the producer. |
| `displayedMessage` | OPTIONAL | Exact localized text shown to a user. |
| `scope` | RECOMMENDED | CTR subjects and charging sessions affected. |
| `pagination` | REQUIRED | Stream, epoch, and sequence information. |
| `previousHash` | CONDITIONAL | Hash of the preceding event in the same stream and epoch. |
| `eventHash` | RECOMMENDED | Hash of this event's canonical signed payload. |
| `signatures` | OPTIONAL | One or more signatures over the signed payload. |

`sequenceNumber` MUST be a non-negative decimal integer encoded as a string. It
MUST NOT contain a sign or unnecessary leading zeroes. A string avoids integer
precision loss in JavaScript and other runtimes.

## 8. Severity

The initial severity vocabulary is:

| Severity | Meaning |
|---|---|
| `informational` | Relevant state or action without degradation. |
| `notice` | Unusual but currently acceptable condition. |
| `warning` | Degradation or an approaching policy limit. |
| `error` | Failure or policy violation affecting reliability. |
| `critical` | Condition that invalidates or seriously compromises relevant data. |

Consumers MUST NOT infer legal relevance solely from severity.

## 9. Message Codes, Tags, and Data

`messageCode` is the normative semantic identifier. Validation and display
selection MUST NOT depend on translated message text.

Public codes SHOULD be defined by a versioned CTR vocabulary. Private codes
SHOULD be namespaced, for example:

```text
com.example.station.METER_CONFIGURATION_CHANGED
```

Each code SHOULD define a schema for its `messageData`. Producers MUST NOT place
credentials, private keys, authentication tokens, or other secrets in it.

Tags support filtering and grouping. They MUST be stable identifiers rather
than localized labels. Message codes define semantics; tags do not replace
message codes.

## 10. Human-Readable Messages

The optional `message` object uses language tags as keys:

```json
{
  "de": "Die Zählerkonfiguration wurde geändert.",
  "en": "The meter configuration was changed."
}
```

When present at signing time, all translations are part of the signed payload.
Adding a translation later changes the event hash and invalidates its signature.

If evidence of the exact text displayed to a user is required, the producer
SHOULD record it explicitly:

```json
{
  "displayedMessage": {
    "language": "de-DE",
    "text": "Die Zählerkonfiguration wurde geändert."
  }
}
```

Applications MAY provide additional local translations outside the signed
event. Such translations are presentation data and MUST NOT change the meaning
of `messageCode` or `messageData`.

## 11. Scope

`scope.subjects` identifies physical or logical objects affected by an event.
Initial subject types are:

```text
ctr
chargingSession
chargingStation
evse
connector
energyMeter
clock
tariff
```

Unknown subject types MUST be preserved. A subject identifier SHOULD reference
an object in the CTR whenever such an object exists.

## 12. Pagination and Ordering

### 12.1 Dedicated legal log sequence

The counter MUST advance exactly once for each event in the declared legally
relevant stream. A counter shared with a larger operational log is insufficient:
omitted operational messages would create expected gaps and make completeness
unverifiable.

Within one `streamId` and `epoch`:

- sequence numbers MUST increase by exactly one;
- event identifiers MUST be unique;
- `previousHash` MUST equal the preceding event's `eventHash`; and
- events MUST be evaluated in sequence-number order, not timestamp order.

Wall-clock time may move backwards after a correction. Sequence number and
monotonic uptime therefore establish authoritative event order.

### 12.2 Epoch changes

A counter reset MUST create a new epoch. Reusing an epoch with a lower counter
is invalid. The producer SHOULD use a persistent, unpredictable identifier for
each epoch instead of relying only on a boot counter that could repeat after a
factory reset.

## 13. Hash Chaining

`eventHash` is computed from the canonical event object after removing:

- `eventHash` itself;
- `signatures`; and
- verifier-generated results, warnings, and errors.

All remaining serialized properties are covered. The applicable CTR profile
MUST declare its canonicalization and hash algorithm. JSON Canonicalization
Scheme ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html)) is RECOMMENDED
for a new JSON profile.

The first event in a declared range MAY retain the preceding hash from outside
the exported range. If no preceding hash exists, the stream manifest MUST mark
the event as an epoch genesis event.

## 14. Stream Manifest

Pagination cannot by itself detect removal of all events at the beginning or
end of an export. A CTR SHOULD contain an integrity-protected manifest for each
included stream range:

```json
{
  "@id": "urn:logstream-manifest:station-controller:boot-4711:ctr-123",
  "streamId": "urn:logstream:station-controller",
  "epoch": "boot-4711",
  "producerId": "urn:charging-station:DE*ABC*E123",
  "firstSequenceNumber": "1840",
  "lastSequenceNumber": "1847",
  "messageCount": "8",
  "firstEventHash": "sha256:...",
  "finalEventHash": "sha256:...",
  "rangeBegin": "2026-07-04T13:58:00+02:00",
  "rangeEnd": "2026-07-04T15:42:31.421+02:00",
  "signatures": []
}
```

For a contiguous range:

```text
messageCount = lastSequenceNumber - firstSequenceNumber + 1
```

The manifest proves completeness only for its declared range. It does not prove
that the producer emitted every event required by its policy.

## 15. Signature and Integrity Model

### 15.1 Signature representation

A proposed generic signature representation is:

```json
{
  "keyId": "urn:key:station-controller:2026",
  "hashAlgorithm": "SHA-256",
  "signatureAlgorithm": "ECDSA-secp256r1",
  "canonicalization": "RFC8785",
  "format": "DER",
  "encoding": "base64",
  "value": "MEUCIQD..."
}
```

`keyId` SHOULD reference a public key or certificate included in, or resolvable
through, the CTR trust model.

### 15.2 Optional event signatures

An individual signature MAY be omitted if the event is protected by:

- a signed stream manifest whose final hash commits to the event hash chain;
- a signed charging session that unambiguously covers the event; or
- a signed CTR envelope that unambiguously covers the event.

An event without individual or enclosing integrity protection is syntactically
acceptable for import compatibility but MUST be reported as unprotected.

### 15.3 Signed wire representation

In-memory references such as back-references to a charging session MUST NOT be
serialized or included in signature input. The signed representation MUST be
explicit, acyclic, and deterministic.

## 16. Validation Rules

A verifier SHOULD perform at least the following checks.

### 16.1 Structural validation

- Required fields are present and correctly typed.
- Timestamps are valid RFC 3339 values with explicit offsets.
- Durations are valid ISO 8601 durations.
- Decimal sequence numbers use canonical string form.
- Message data contains only JSON-compatible acyclic values.
- Event identifiers and tags contain no duplicates where uniqueness is required.

### 16.2 Stream validation

- Events are grouped by `streamId` and `epoch`.
- Sequence numbers are contiguous within every declared range.
- Hash-chain links are correct.
- Manifest counts and boundary hashes match included events.
- Counter resets occur only with a new epoch.

### 16.3 Cryptographic validation

- Canonicalization, hash, algorithm, format, and encoding are supported.
- Referenced public keys are valid and authorized for the producer.
- Every event has an individual or enclosing integrity proof.
- Only explicitly defined fields are removed from signature input.

Verifier-generated status, warnings, and errors MUST remain separate from the
signed source event.

## 17. Privacy and Data Minimization

Legally relevant logs are retained and integrity-protected, so they require
stricter data minimization than ordinary diagnostic logs.

Producers SHOULD:

- record stable technical identifiers instead of personal data;
- avoid contract identifiers unless strictly necessary;
- never record secrets or replayable credentials;
- define retention and disclosure policies;
- avoid free-form text when structured data is sufficient; and
- separate public CTR evidence from restricted diagnostic information.

Redaction changes signed data. Selective disclosure MUST be designed into the
commitment scheme rather than implemented by silently editing an exported CTR.

## 18. Versioning and Extensibility

- Context and vocabulary identifiers SHOULD be immutable and versioned.
- Unknown tags, codes, subject types, and fields MUST be preserved by round-trip
  processing.
- Unknown critical cryptographic algorithms MUST yield an explicit unsupported
  result.
- New serialized fields are part of the signed payload unless a versioned
  profile explicitly states otherwise.
- Future batch signatures or Merkle commitments MAY be added if ordering, scope,
  deletion detection, and boundary semantics remain explicit.

## 19. Open Design Decisions

1. Final JSON-LD context and vocabulary URLs.
2. Transition rules for the existing session-embedded message representation.
3. A signature representation shared with existing CTR signature types.
4. The mandatory canonicalization algorithm for native CTR JSON.
5. Whether `eventHash` is serialized or always derived.
6. Which party signs manifests and how its authority is established.
7. Required retention ranges for partial log exports.
8. Mapping rules for formats that provide only a pagination counter.

## 20. Recommended Implementation Order

1. Agree on threat model, event scope, and stream semantics.
2. Finalize JSON Schema and JSON-LD vocabulary.
3. Define canonical signed projections and key resolution.
4. Implement structural parsing.
5. Implement pagination, manifests, and hash-chain verification.
6. Implement individual and enclosing signature verification.
7. Add presentation separated from verifier results.
8. Add fixtures for missing, duplicated, reordered, truncated, and manipulated
   events and stream resets.
