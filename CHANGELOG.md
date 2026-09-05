# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
While the version number is below 1.0.0, breaking changes are released in minor
versions and are always listed first below.


## [0.14.4] - 2026-09-05

### Changed

- **An https transport without a `refresh` is polled at the default period.**
  Absent used to mean "do not poll"; it now means `defaultRefreshSeconds`,
  which is 10. An https transport exists to be asked, and a document that names
  one without saying how often still wants its readers to see what the session
  does next. A client is still expected to clamp what a document states.

- **`customHeaders` moved from `TransportHTTPS` to `ITransport`.** An https
  poll, the opening request of a server-sent event stream and the handshake of
  a websocket are all HTTP requests, and all three can face an endpoint that
  expects a header - so all three may state them, and all three are validated.
  A document that stated them on https alone is unaffected.

## [0.14.3] - 2026-09-05

### Added

- **An https transport can state the HTTP headers to send with it.**
  `TransportHTTPS.customHeaders` names them - an API key the operator's endpoint
  expects, a tenant selector - and a value is either the literal string to send
  or an object naming a `valueProvider` that computes it per request, because a
  one-time password would be stale the moment it was written into a document.
  Version 1.0 defines that shape, not the providers: what `"TOTP"` means needs
  an external profile, the same way the TOTP configuration does, and ChargyCore
  computes no values.

  Like `refresh`, the headers belong to `https` alone and are validated only
  there; on the other two transports the property is unknown like any other.
  `isCustomHeaders()`, `isCustomHeaderValue()` and
  `isCustomHeaderValueProvider()` are exported for point-of-use filtering. What
  HTTP itself requires of a name and a value is the sending client's business:
  a document says what it wants sent, it does not get to write the request.

## [0.14.0] - 2026-08-30

### Added

- **The signatures over a whole document are verified.** A charge transparency
  live link may be signed as a whole by its operator, and that signature is what
  ties the transport URLs and the listed public keys to whoever signed them.
  Until now the `signatures` array was carried around but never read. Every
  entry is checked now: the properties it excludes are removed, what remains is
  canonicalized and read as UTF-8, the key is resolved by the `keyId` the entry
  names - following the document's own `keyIdGeneration` - and the signature is
  verified with it. ECDSA over P-256, P-384 and P-521, Ed25519, Ed448 and
  ML-DSA-44/65/87 are understood.

  A key id is defined over the canonical `SubjectPublicKeyInfo` form of a key,
  no matter which form the document stores the key in. A key stored as bare key
  material - as Ed25519 keys usually are - is therefore wrapped before its id is
  computed: hashing the raw bytes would yield a different id for the same key,
  and the signature would look as though no key of the document had signed it.

- **`verifyDocumentSignatures()` and `collectDocumentPublicKeys()`** do this for
  any JSON document, for callers who want to check one without going through
  `DetectAndConvertContentFormat()`. Neither throws: a document that is
  unsigned, signed by an unknown key or signed badly is reported as such.

### Changed

- **A live link says what its signatures did, and stays usable either way.**
  `IChargeTransparencyLiveLink.signatureVerification` carries the outcome per
  signature, and anything short of "all valid" also adds a `warning`. None of it
  is fatal: an unsigned document, an unknown key and even a signature that
  demonstrably does not match are all warnings, never a reason to refuse the
  document. Its transports still work, and its signed meter values carry their
  own signatures, which are verified separately. The warnings are graded by what
  they actually say - that nothing was claimed (unsigned), that the claim cannot
  be judged here (unknown key, unsupported algorithm, malformed), or that the
  claim is demonstrably false (the signature does not match).

  Verification runs before anything is added to the document, because the
  signatures cover every property but their own: a timestamp defaulted into
  `created` first would become part of what is verified and would turn a good
  signature into a bad one.


## [0.13.0] - 2026-08-28

### Breaking

- **`IChargeTransparencyLiveLink.timestamp` is now `created`, and
  `transports` is now `liveTransports`.** The names now say what the properties
  are: the timestamp records when the link was created rather than some
  unspecified event, and the transports are the ones carrying the live data,
  which distinguishes them from any other transport a document may come to
  describe. `IsAChargeTransparencyLiveLink()` validates the new names, and a
  live link without a `created` timestamp gets the current UTC time in that
  property instead. There is no fallback to the old names: a document still
  using `timestamp` or `transports` is accepted by the type guard, because both
  properties are optional, but the values are ignored. Consuming code reading
  either property has to be updated, and so do stored documents.

### Added

- **`Chargy.TryToParseLiveLinkMeterValues()`** turns the `signedMeterValues` of
  a charge transparency live link into a verified charge transparency record.
  Until now that property was never read: the meter values were not parsed, not
  verified and not displayed anywhere. They are fed through the OCMF parser
  together with the public keys the very same document carries, and through the
  same verification every other record goes through. The live link itself stays
  a live link - it describes a session that is still running, a record a
  collection of finished ones - so the meter values are produced on demand and
  shown next to it rather than in its place. Returns `undefined` when a live
  link carries no meter values yet, which is the normal state of the first
  document of a series.

- **An https transport may say how often to ask for the document again.**
  `TransportHTTPS.refresh` is a number of seconds, and
  `IsAChargeTransparencyLiveLink()` validates it. It belongs to https alone: a
  websocket or a server-sent event stream delivers a new document when there is
  one. Its absence means: do not poll.

- **`OCMF.TryToParseOCMFDocuments()` and `TryToParseOCMFDocument()` accept an
  array of public keys.** A single key stays valid and behaves as before. This
  is needed because a session is regularly signed by more than one key: many
  meters sign their start and end values with a different key than the
  intermediate ones, and an operator may hold several keys at once while
  rotating them. Each document is tried against every candidate and keeps the
  first signature that verifies.

## [0.12.0] - 2026-08-15

### Breaking

- **`IECCurves.secp512r1` is now `IECCurves.secp521r1`.** The old member named a
  curve that does not exist. The rest of the library already used the correct
  `secp521r1` throughout, so `IECCurves` had no valid member for the NIST P-521
  curve it actually supports. Anything referring to the old name has to be
  updated; the string value changes from `"secp512r1"` to `"secp521r1"` as well.

- **`signJSONMessage()` no longer reports success when it produced no signature.**
  Previously it resolved to `true` even when every key pair was unusable, so a
  caller guarding on the return value could publish an unsigned message. It now
  resolves to `true` only if at least one signature was created, which matches
  the behaviour that already applied to an empty key pair array. This also
  affects the `signMessage()` and `SignMessage()` aliases. A signature that
  fails its own verification is no longer left behind in the caller's message.

- **PDF/A-3 attachment extraction now requires PDF.js 6.2.** The bundled
  `pdfjs-dist` moved from 6.0.227 to 6.2.108, whose `getAttachments()` returns a
  `Map` and no longer delivers the file bytes eagerly. This is handled inside
  the library and needs no change in consuming code, but applications pinning
  their own `pdfjs-dist` need to move along.

- **The declared minimum Node version is now 22.13**, corrected from 20.19. The
  old value never held: `pdfjs-dist` requires `>=22.13.0` and `file-type`
  requires `>=22`, so installing on Node 20 produced `EBADENGINE` warnings and
  failed outright under `engine-strict`. No code changed, the declaration now
  states what the dependency tree already demanded.

### Fixed

- **EMH and GDF signatures no longer depend on the verifying machine's time
  zone.** These meters sign their own local time, and the offset used to
  reconstruct the signed buffer was taken from the host instead of from the
  record. A correctly signed charging record therefore verified in one time zone
  and was reported as `InvalidSignature` in another. The offset is now read from
  the timestamp when it states one, and otherwise assumed to be `Europe/Berlin`,
  resolved for the instant of the record including daylight saving time. Alfen
  was never affected.

- **A valid ChargePoint signature could be overwritten by a later public key.**
  When no key matches the EVSE Id, all available keys are tried in turn, but the
  loop did not stop after a successful verification, so a subsequent
  non-matching key turned a valid result into `InvalidSignature`.

- **secp224k1 verification accepted public keys that are not on the curve** and
  fed them straight into the group arithmetic. Points are now validated against
  `y² = x³ + 5` with reduced coordinates, and verification fails closed instead
  of throwing, so a caller trying several candidate keys is not interrupted.
  Two arithmetic defects behind it were corrected as well: `modInv()` returned
  `1` for a non-invertible value instead of reporting that no inverse exists,
  and `ECadd()` divided by zero when adding a point to itself, silently
  returning a result that was not even on the curve.

- **P-521 charging sessions showed no hash information**, because the display
  branch matched the misspelled curve name.

- `npm run typecheck` and `npm run lint` pass again. The type error came from
  `@types/node` 26 dropping the `createPublicKey(KeyObject)` overload; the lint
  errors were two nullable booleans in a conditional.

- **OCMF charging sessions no longer all carry the same identifier.** The
  session `@id` was a string literal, so every record parsed from OCMF — across
  different meters, containers and charging processes — was labelled
  `1554181214441:-1965658344385548683:2`. It is now `OCMF-` followed by the
  SHA-256 over the canonical form of the payload and signature of each OCMF
  document the session was built from: reproducible for a given record, and
  distinct between records. Canonical rather than the document text, so that
  formatting the record does not carry — pretty-printed JSON, or line endings
  rewritten by a checkout — cannot change it. The record-level `@id` follows it.

- **OCMF charging sessions report their actual start and end.** `begin` and
  `end` were the literal `"?"`, both on the session and, since it copies them,
  on the record. They are now the earliest and latest reading timestamp, ordered
  by instant rather than lexically, because the timestamps keep the offset the
  meter reported.

- **OCPI containers no longer drop their EVSE Id and meter information.** The
  container infos handed to the OCMF parser carried an `EVSEIds` field that does
  not exist on `IContainerInfos`, so it was silently ignored and the charging
  session ended up without an `EVSEId`; the `meterInfo` block was not passed on
  at all. Both are now converted into the `EVSEs` and `energyMeters` the parser
  actually merges, and what the signed OCMF payload states about the meter takes
  precedence over the container, which only fills the gaps.

### Added

- `url` on `IManufacturer`, so that a manufacturer URL supplied by a container
  survives. OCMF itself has no field for it.
- `secp224k1.isOnCurve()` for validating a point against the curve equation.
- `timeZoneOffsetMinutes()` and `meterTimeZone` in `chargyLib`, which resolve a
  daylight-saving-aware offset for an IANA time zone at a given instant.
- ML-DSA-44 and ML-DSA-87 are recognised when parsing DER public keys; only
  ML-DSA-65 was mapped before.
- Test fixtures for the Porsche Charging Data Format (PCDF).

### Internal dependencies

- The Noble cryptography stack moved to `@noble/curves` 2.3.0,
  `@noble/hashes` 2.3.0 and `@noble/post-quantum` 0.7.0. The three are updated
  together on purpose: `@noble/post-quantum` 0.6.1 pins curves and hashes to
  `~2.2.0`, so raising curves on its own would have installed a second, nested
  copy of both rather than upgrading them. 0.7.0 asks for `~2.3.0`, which keeps
  a single deduplicated copy of each.

### Security

- `pdfjs-dist` 6.0.227 → 6.2.108, closing
  [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j)
  (high severity: arbitrary JavaScript execution when opening a malicious PDF).
- `postcss` 8.5.16 → 8.5.26 and `brace-expansion` 5.0.7 → 5.0.9, both build-time
  dependencies.
- `npm audit --omit=dev` now reports only `elliptic`, which has no fix available
  and is used solely for verifying legacy P-192 charging data.

### Internal

Nothing here changes the published package; it is listed for contributors.

- CI and Nightly GitHub Actions workflows. CI gates every push across three legs
  (Ubuntu on the declared minimum Node 22.13 and on 26, Windows on 24) and
  uploads JUnit results per leg. Nightly repeats that, additionally installs
  without the lockfile so an upstream release that breaks us shows up before a
  lockfile refresh pulls it in, and reports `npm audit`.
- `pdfjs-dist` stays pinned to an exact version on purpose, since it has shipped
  a silently breaking attachment API change within a minor release. See
  "PDF.js Version Pin" in the README before raising it.
- The test suite pins `TZ` to `UTC`, deliberately not `Europe/Berlin`, so that
  code reading the time zone from the host fails the suite instead of passing on
  a German workstation.
- `CHARGY_UPDATE_FIXTURES=1` regenerates the expected verification reports
  rather than having a dozen golden files edited by hand.
- New tests for secp224k1, for signed timestamps, and for the OCMF session
  identity. The OCPI test is no longer skipped. Three PTB container tests remain
  skipped: their fixtures were signed over payloads that OCMF rejects, so they
  have never run and need regenerating.
- The BSM `ocmf_withoutIF` fixture was a byte-identical copy of its neighbour
  and is replaced by `ocmf_withIF.xml`, which covers the branch that actually
  lacked one. Since identification flags sit inside the signed payload, that
  fixture is generated and signed by a script committed next to it.
- The `.npmignore` was removed. With a `files` array it had no effect, which
  packing with and without it confirmed.


## [0.11.3] and earlier

See the commit history at
<https://github.com/OpenChargingCloud/ChargyCore.TS/commits/master>.
