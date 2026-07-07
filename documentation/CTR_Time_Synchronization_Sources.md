# CTR Time Synchronization Sources

**Status:** Draft specification proposal  
**Version:** 0.1  
**Intended audience:** CTR producers, charging-station and meter vendors,
backend operators, transparency software implementers, and conformity
assessment bodies

## 1. Introduction

Trustworthy timestamps require more than an ISO 8601 value. A verifier needs to
know which clock produced a timestamp, how that clock was synchronized, when it
was last synchronized, and what uncertainty or drift was known at the relevant
time.

This document defines a CTR model for:

- the current synchronization state of each relevant clock;
- the selected Network Time Security (NTS) or other time source;
- last successful synchronization and observed timing metrics;
- estimated uncertainty, frequency drift, and quality classification;
- explicit, versioned rules for significant changes; and
- legally relevant events for source, state, and quality changes.

Significant changes use the generic event, pagination, hash-chain, and signature
model defined by
[CTR Legally Relevant Log Messages](CTR_Legally_Relevant_Log_Messages.md).

This evidence is especially relevant to the `MI-011` framework introduced by
[Directive (EU) 2026/706](https://eur-lex.europa.eu/eli/dir/2026/706/oj).
That framework explicitly addresses incorrect legally relevant data and
excessive accuracy shifts that can occur while an EVSE measuring system appears
to function correctly. A trustworthy time history helps make clock-related
conditions visible, but it does not replace the Directive's requirement to
prevent critical faults or keep measurement errors within the applicable
limits. The full regulatory motivation and its limitations are discussed in
the legally relevant log-message specification.

## 2. Conformance Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and
**OPTIONAL** are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear
in all capitals.

This is a draft data-model proposal. It does not by itself establish regulatory
or legal conformance.

## 3. Design Principles

1. Time synchronization is modeled per clock, not as a single unqualified CTR
   server URL.
2. The top-level object is a current snapshot taken at a stated time.
3. Significant changes are immutable legally relevant log messages.
4. Raw observations remain separate from derived quality classifications.
5. `estimatedUncertainty` is preferred over an unsupported claim of accuracy.
6. Monotonic uptime supplements wall-clock timestamps during clock corrections.
7. NTS credentials and replayable authentication material are never exported.
8. The latest event state and current top-level snapshot are cryptographically
   reconcilable.

## 4. Terminology

### 4.1 Clock

A concrete clock whose time affects CTR data, such as a station-controller,
EVSE-controller, or energy-meter clock.

### 4.2 Time source

The external source used to discipline a clock. For NTS this includes the
NTS-KE endpoint and the NTP endpoint selected during key establishment.

### 4.3 Synchronization snapshot

The observed synchronization state of a clock at a specific wall-clock time
and monotonic uptime.

### 4.4 Estimated uncertainty

The producer's estimated bound or statistical estimate of the difference
between its local clock and the applicable reference time. The exact meaning
MUST be defined by the referenced quality policy or implementation profile.

### 4.5 Frequency drift

The estimated relative frequency error of the local oscillator over a declared
observation window, normally expressed in parts per million (`ppm`).

### 4.6 Holdover

A state in which no acceptable synchronization samples are being received but
the clock continues from its last accepted state and estimated frequency
behaviour.

## 5. CTR Placement

The following top-level CTR properties are proposed:

```json
{
  "timeSynchronizations": [],
  "timeQualityPolicies": []
}
```

`timeSynchronizations` is an array because one CTR can contain timestamps from
multiple independent clocks.

Relevant historical changes are stored in the top-level
`legallyRelevantLogMessages` and `legallyRelevantLogStreams` collections defined
by the log-message specification. Sessions MAY reference applicable event IDs.

## 6. Synchronization Snapshot

### 6.1 Complete example

```json
{
  "@id": "urn:time-sync:station-controller",
  "@context": "https://open.charging.cloud/contexts/CTR-TimeSynchronization+json",
  "clockId": "urn:clock:station-controller",
  "subjectId": "urn:charging-station:DE*ABC*E123",
  "observedAt": "2026-07-04T15:42:31.421+02:00",
  "systemUptime": "P17DT5H36M31.540S",
  "state": "synchronized",
  "source": {
    "@id": "urn:timesource:ptb-nts-1",
    "protocol": "NTS",
    "ntsKeyEstablishmentServer": {
      "hostname": "ptbtime1.ptb.de",
      "port": 4460,
      "certificateSHA256": "AB:CD:EF:..."
    },
    "negotiatedNTPServer": {
      "hostname": "ptbtime1.ptb.de",
      "port": 123
    },
    "authenticated": true
  },
  "lastSuccessfulSynchronization": {
    "at": "2026-07-04T15:41:58.204+02:00",
    "systemUptime": "P17DT5H35M58.323S",
    "clockOffset": {
      "value": "-1.7",
      "unit": "ms"
    },
    "roundTripDelay": {
      "value": "12.8",
      "unit": "ms"
    }
  },
  "quality": {
    "classification": "good",
    "estimatedUncertainty": {
      "value": "8.5",
      "unit": "ms"
    },
    "frequencyDrift": {
      "value": "0.42",
      "unit": "ppm",
      "observationWindow": "PT15M"
    },
    "stratum": 2,
    "rootDelay": {
      "value": "7.1",
      "unit": "ms"
    },
    "rootDispersion": {
      "value": "3.2",
      "unit": "ms"
    },
    "leapIndicator": "normal",
    "reachability": "reachable",
    "policyId": "urn:time-quality-policy:ctr-v1"
  },
  "stateHash": "sha256:...",
  "signatures": []
}
```

### 6.2 Properties

| Property | Requirement | Description |
|---|---:|---|
| `@id` | REQUIRED | Stable synchronization-object identifier. |
| `@context` | OPTIONAL | JSON-LD context or array of contexts. |
| `clockId` | REQUIRED | Identifier of the disciplined clock. |
| `subjectId` | REQUIRED | CTR object whose timestamps depend on the clock. |
| `observedAt` | REQUIRED | RFC 3339 time at which the snapshot was recorded. |
| `systemUptime` | RECOMMENDED | Monotonic uptime at snapshot creation. |
| `state` | REQUIRED | Current synchronization state. |
| `source` | OPTIONAL | Selected source; absent when unknown or unavailable. |
| `lastSuccessfulSynchronization` | OPTIONAL | Last accepted sample and local observations. |
| `quality` | REQUIRED | Raw metrics, classification, and policy reference. |
| `stateHash` | RECOMMENDED | Hash of the canonical snapshot payload. |
| `signatures` | OPTIONAL | Individual snapshot signatures. |

An individual snapshot signature MAY be omitted when an enclosing CTR signature
unambiguously covers the snapshot.

## 7. Synchronization States

| State | Meaning |
|---|---|
| `synchronized` | Acceptable authenticated or profile-approved samples actively discipline the clock. |
| `holdover` | No acceptable current sample exists; the clock continues from its last accepted state. |
| `degraded` | Synchronization exists, but one or more quality limits are violated. |
| `unsynchronized` | The clock has no acceptable synchronization basis. |
| `unknown` | Available evidence is insufficient to classify the clock. |

State and quality classification are distinct. A clock can, for example, be in
`holdover` while its quality changes from `acceptable` to `poor`.

## 8. Quantity Representation

Measured quantities use decimal strings and explicit units:

```json
{
  "value": "8.5",
  "unit": "ms"
}
```

Decimal strings avoid binary floating-point differences in canonical signature
input. Implementations MUST define permitted units per property and MUST NOT
silently interpret or convert an unknown unit.

Recommended canonical units are:

| Property | Canonical unit |
|---|---|
| Clock offset | `ms` |
| Round-trip delay | `ms` |
| Estimated uncertainty | `ms` |
| Root delay | `ms` |
| Root dispersion | `ms` |
| Frequency drift | `ppm` |

A future profile MAY require finer units without changing the quantity shape.

## 9. NTS Source Model

Network Time Security consists of NTS Key Establishment (NTS-KE) over TLS and
authenticated NTP extension fields. The NTS-KE server may select a different
NTP server, so the two endpoints MUST be modeled separately.

### 9.1 NTS-KE endpoint

The `ntsKeyEstablishmentServer` object SHOULD contain:

- the configured or authenticated hostname;
- the TCP port;
- the observed server-certificate SHA-256 fingerprint; and
- optionally the certificate subject, issuer, and validity interval.

The hostname used for certificate validation is more meaningful than a
temporary resolved IP address. An implementation MAY record the resolved IP as
diagnostic metadata but MUST NOT use it as the sole source identity.

### 9.2 Negotiated NTP endpoint

`negotiatedNTPServer` identifies the NTP endpoint returned or selected during
NTS key establishment. It SHOULD contain its hostname or address and port.

### 9.3 Prohibited data

The source object MUST NOT contain:

- NTS cookies;
- TLS or AEAD session keys;
- exported key material;
- private certificates or keys; or
- any replayable authentication material.

NTS authenticates communication between the client and server. It does not
create a transferable server signature over the CTR. A CTR producer signature
asserts that the producer observed the recorded NTS state. See
[RFC 8915](https://www.rfc-editor.org/rfc/rfc8915.html).

## 10. Last Successful Synchronization

`lastSuccessfulSynchronization` records the last sample accepted by the local
clock discipline algorithm:

```json
{
  "at": "2026-07-04T15:41:58.204+02:00",
  "systemUptime": "P17DT5H35M58.323S",
  "clockOffset": {
    "value": "-1.7",
    "unit": "ms"
  },
  "roundTripDelay": {
    "value": "12.8",
    "unit": "ms"
  }
}
```

`at` MUST mean the time of the accepted synchronization observation, not merely
the last polling attempt. Failed attempts belong in status data or legally
relevant events when they cause a significant state change.

The associated monotonic uptime is RECOMMENDED because wall-clock time may be
the very value under investigation.

## 11. Quality Model

### 11.1 Classification

The initial quality classifications are:

```text
good
acceptable
poor
invalid
unknown
```

The classification is derived. It MUST reference the policy used to calculate
it and SHOULD be accompanied by the supporting observations.

### 11.2 Recommended metrics

| Metric | Meaning |
|---|---|
| `clockOffset` | Estimated signed difference between local and reference time. |
| `roundTripDelay` | Observed request/response delay for an accepted sample. |
| `estimatedUncertainty` | Estimated uncertainty of the local timestamp. |
| `frequencyDrift` | Estimated oscillator frequency error over a stated window. |
| `stratum` | NTP stratum reported for the selected association. |
| `rootDelay` | NTP-reported total round-trip delay to the reference clock. |
| `rootDispersion` | NTP-reported accumulated dispersion to the reference clock. |
| `leapIndicator` | Current leap-second warning state. |
| `reachability` | Current source reachability classification. |

Source-reported NTP metrics and client-estimated metrics MUST remain
distinguishable. `rootDispersion`, for example, is not by itself proof of the
actual error of the local clock.

### 11.3 Meaning of uncertainty

A quality policy or implementation profile MUST state whether
`estimatedUncertainty` represents:

- a conservative upper bound;
- a confidence interval with a stated confidence level; or
- an implementation-specific estimate.

Without this definition, values from different implementations are not
necessarily comparable.

## 12. Time Quality Policy

The meaning of a significant change MUST be explicit and versioned:

```json
{
  "@id": "urn:time-quality-policy:ctr-v1",
  "maximumUncertainty": {
    "value": "100",
    "unit": "ms"
  },
  "maximumAbsoluteOffset": {
    "value": "50",
    "unit": "ms"
  },
  "maximumAbsoluteDrift": {
    "value": "5",
    "unit": "ppm"
  },
  "maximumHoldoverDuration": "PT15M",
  "minimumViolationDuration": "PT30S",
  "minimumRecoveryDuration": "PT60S",
  "sourceChangeIsSignificant": true,
  "authenticationLossIsSignificant": true,
  "clockStepIsSignificant": true
}
```

Violation and recovery durations provide debounce and hysteresis. They prevent
repeated events when a metric oscillates around a threshold.

A policy SHOULD define whether the following changes are significant:

- selected source identity changes;
- authenticated synchronization is lost or restored;
- uncertainty, absolute offset, or absolute drift crosses a threshold;
- a clock step exceeds a threshold;
- holdover begins or exceeds an allowed duration;
- a leap indicator changes; and
- the trusted identity or certificate state of the NTS-KE endpoint changes.

Routine certificate renewal SHOULD be distinguishable from a trust failure.

## 13. Time-Related Log Messages

The initial message-code vocabulary should include:

| Message code | Suggested severity | Purpose |
|---|---|---|
| `TIME_SOURCE_CHANGED` | `notice` or `warning` | A different source was selected. |
| `TIME_SOURCE_AUTHENTICATION_FAILED` | `error` | NTS or other authentication failed. |
| `TIME_SYNCHRONIZATION_LOST` | `error` | The clock entered holdover or became unsynchronized. |
| `TIME_SYNCHRONIZATION_RESTORED` | `notice` | Acceptable synchronization resumed. |
| `TIME_QUALITY_THRESHOLD_CROSSED` | policy-dependent | A quality metric crossed a policy threshold. |
| `CLOCK_STEPPED` | policy-dependent | The clock was changed discontinuously. |
| `CLOCK_SLEW_STARTED` | `notice` | A gradual correction began. |
| `CLOCK_SLEW_COMPLETED` | `informational` | A gradual correction completed. |
| `HOLDOVER_LIMIT_EXCEEDED` | `error` | Holdover lasted longer than permitted. |
| `LEAP_SECOND_STATE_CHANGED` | `notice` | The leap indicator changed. |

Severity MAY depend on magnitude and policy. The message code remains stable.

Every time event SHOULD contain:

- `clockId`;
- `policyId`;
- a structured change reason;
- previous and current state identifiers or values;
- `previousStateHash` and `currentStateHash`;
- event wall-clock time;
- event monotonic uptime; and
- generic event pagination and integrity fields.

## 14. Time Source Change Example

```json
{
  "@id": "urn:event:01J2TIME7QX4H6E2K8ZT0K5P9R",
  "timestamp": "2026-07-04T14:18:03.102+02:00",
  "systemUptime": "P17DT4H12M03.221S",
  "severity": "warning",
  "tags": [
    "time.synchronization",
    "time.source.change"
  ],
  "messageCode": "TIME_SOURCE_CHANGED",
  "messageData": {
    "clockId": "urn:clock:station-controller",
    "policyId": "urn:time-quality-policy:ctr-v1",
    "reason": "failover",
    "previous": {
      "sourceId": "urn:timesource:provider-a",
      "state": "degraded",
      "stateHash": "sha256:111..."
    },
    "current": {
      "sourceId": "urn:timesource:ptb-nts-1",
      "state": "synchronized",
      "authenticated": true,
      "stateHash": "sha256:222..."
    }
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
      },
      {
        "type": "chargingStation",
        "id": "urn:charging-station:DE*ABC*E123"
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
  "signatures": [
    {
      "keyId": "urn:key:station-controller:2026",
      "hashAlgorithm": "SHA-256",
      "signatureAlgorithm": "ECDSA-secp256r1",
      "canonicalization": "RFC8785",
      "format": "DER",
      "encoding": "base64",
      "value": "MEUCIQD..."
    }
  ]
}
```

## 15. Time Quality Degradation Example

```json
{
  "@id": "urn:event:01J2TIME8XVE0N6CDNB6J37E5K",
  "timestamp": "2026-07-04T14:27:41.008+02:00",
  "systemUptime": "P17DT4H21M41.127S",
  "severity": "error",
  "tags": [
    "time.synchronization",
    "time.quality"
  ],
  "messageCode": "TIME_QUALITY_THRESHOLD_CROSSED",
  "messageData": {
    "clockId": "urn:clock:station-controller",
    "policyId": "urn:time-quality-policy:ctr-v1",
    "metric": "estimatedUncertainty",
    "direction": "degraded",
    "previousValue": {
      "value": "84",
      "unit": "ms"
    },
    "currentValue": {
      "value": "137",
      "unit": "ms"
    },
    "threshold": {
      "value": "100",
      "unit": "ms"
    },
    "previousState": "synchronized",
    "currentState": "degraded",
    "previousStateHash": "sha256:222...",
    "currentStateHash": "sha256:333..."
  },
  "pagination": {
    "streamId": "urn:logstream:station-controller",
    "epoch": "boot-4711",
    "sequenceNumber": "1843"
  },
  "previousHash": "sha256:...",
  "eventHash": "sha256:...",
  "signatures": []
}
```

## 16. Clock Correction Example

An event timestamp alone is insufficient when the clock itself changes. A
correction event SHOULD include the pre-correction time, post-correction time,
signed correction, monotonic uptime, and correction mode:

```json
{
  "messageCode": "CLOCK_STEPPED",
  "messageData": {
    "clockId": "urn:clock:station-controller",
    "correctionMode": "step",
    "timeBefore": "2026-07-04T14:30:00.550+02:00",
    "timeAfter": "2026-07-04T14:29:58.850+02:00",
    "correction": {
      "value": "-1700",
      "unit": "ms"
    },
    "systemUptime": "P17DT4H24M00.669S",
    "previousStateHash": "sha256:...",
    "currentStateHash": "sha256:..."
  }
}
```

The correction sign is defined as:

```text
correction = timeAfter - timeBefore
```

## 17. Snapshot and Event Reconciliation

The current top-level snapshot and event history MUST be consistent:

1. A significant state change emits an event containing the new state hash.
2. Subsequent events reference the preceding state hash.
3. The latest event applicable to a clock identifies its current state hash.
4. That hash matches the top-level snapshot's `stateHash`.

If a CTR contains no time event because no significant change occurred within
its declared event range, its signed snapshot remains the current evidence. A
verifier MUST NOT infer an unrecorded history from the snapshot alone.

## 18. Validation Rules

A verifier SHOULD check:

- every `clockId`, `subjectId`, source ID, policy ID, and session reference;
- RFC 3339 timestamps and ISO 8601 uptimes;
- canonical decimal quantity representations and permitted units;
- `lastSuccessfulSynchronization.at` is not later than `observedAt`, unless a
  correction event explicitly explains the apparent ordering;
- active NTS synchronization does not claim `authenticated: false`;
- quality classification agrees with policy thresholds and metrics;
- holdover duration and uncertainty growth comply with policy;
- source-change events record previous and current source identities;
- clock-step events remain orderable by sequence and monotonic uptime;
- consecutive `previousStateHash` and `currentStateHash` values agree; and
- the latest event state hash matches the top-level snapshot.

Generic message pagination, hash-chain, manifest, and signature checks are
defined in the legally relevant log-message specification.

## 19. Security and Privacy Considerations

- A certificate fingerprint identifies the certificate observed by the CTR
  producer; it is not proof that a third-party verifier observed the same TLS
  session.
- NTS authentication does not replace a CTR producer signature.
- NTS cookies and key material are secret and MUST NOT be exported.
- DNS names, IP addresses, certificate data, and source-selection history can
  reveal infrastructure details and require an appropriate disclosure policy.
- A malicious producer can fabricate observations before signing them. Trust
  therefore depends on key authorization, implementation assurance, and the
  applicable regulatory profile.
- Large backward clock steps can invalidate simple timestamp ordering. Event
  sequence and monotonic uptime are mandatory evidence in that situation.

## 20. Versioning and Extensibility

- Context, source, and policy identifiers SHOULD be immutable and versioned.
- Unknown source protocols, quality metrics, and states MUST be preserved by
  round-trip processing.
- New source protocols MUST define their authentication semantics and prohibited
  secret material.
- New quality metrics MUST define units, sign conventions, and whether they are
  measured, reported by the source, or derived.
- New serialized snapshot fields are signed by default.

## 21. Open Design Decisions

1. Final JSON-LD context and vocabulary URLs.
2. Whether `clockId` references a new explicit CTR clock object.
3. Exact uncertainty semantics and required confidence information.
4. Required quality metrics for each regulatory profile.
5. Required policies and thresholds for station and meter clocks.
6. Whether source certificates are represented by fingerprint, full chain, or
   a reference to existing CTR certificate data.
7. Whether full previous/current snapshots or only hashes and changed fields are
   required in time events.
8. Mapping of OCMF synchronization flags and vendor-specific clock states.
9. Handling of multiple simultaneously selected NTP peers or ensemble clocks.
10. Whether an external, transferable timestamp-evidence format is required in
    addition to NTS and the CTR producer signature.

## 22. Recommended Implementation Order

1. Define clocks and timestamp-to-clock relationships in the CTR.
2. Agree on uncertainty, drift, state, and classification semantics.
3. Finalize the snapshot and quality-policy schemas.
4. Define source-specific profiles, starting with NTS.
5. Adopt the generic legally relevant event and stream model.
6. Implement snapshot parsing and structural validation.
7. Implement policy evaluation and significant-change generation.
8. Implement event/snapshot hash reconciliation and signatures.
9. Add fixtures for NTS failover, authentication loss, holdover, drift,
   uncertainty degradation, backward clock steps, recovery, and leap changes.
