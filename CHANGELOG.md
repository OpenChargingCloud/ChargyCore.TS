# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
While the version number is below 1.0.0, breaking changes are released in minor
versions and are always listed first below.


## [0.16.1] - 2026-09-09

### Added

- **A signed log message is verified, not merely carried.** A legally relevant
  log message may sign itself, and reading a live link now checks those
  signatures alongside the document's own. The two prove different things: the
  document signature says the message has not been changed since the operator
  collected it, the message signature says the grid operator is who asked for
  the constraint. Changing a message breaks both, since the document covers the
  message - what only the message's signature survives is an operator who
  re-signs the document around a forged constraint, which produces a document
  that verifies as a whole while the grid never asked for anything.

  `verifyEmbeddedSignatures(message, liveLink)` is exported for it: the
  signatures sit on the message, the keys to check them and the
  `keyIdGeneration` belong to the enclosing document, so the two objects are
  passed separately. The message is canonicalized on its own, exactly as a
  document is.

  Nothing here refuses a document. A changed message, one signed with a key the
  document does not list, and one carrying no signature at all are each reported
  as a graded warning and change nothing else. There is deliberately no
  `signatureVerification` written onto the message: that would change the very
  bytes its signature covers.

- **`collectDocumentPublicKeys()` also collects `gridOperator.publicKeys`.**
  A grid operator signs the constraints it sends rather than the document
  carrying them, so its keys were listed in the fixtures and reachable by
  nothing. The five new `LogMessageSignature_*` warning texts are in `i18n.json`.

- **`TT` may record a tariff change.** A Bonn tariff text names one tariff,
  which is all a document needs until the tariff changes - and OCMF clearly
  expects that it can, because it reserves a reading reason for exactly that
  case. So this extends the format: `TT` carries the tariffs that have metered
  something so far, separated by a vertical bar and in the order they took
  effect.

      001;EUR;0;35;0;0
      001;EUR;0;35;0;0|001;EUR;0;25;0;0
      001;EUR;0;35;0;0|001;EUR;0;25;0;0|001;EUR;0;35;0;0

  The last entry is the tariff in effect, the ones before it are the history
  that led there, and the list only grows - so the newest document carries the
  whole history and no earlier one is needed. The entries are tariff periods
  rather than distinct tariffs: a tariff that comes back is written again,
  which is why the base price appears twice above. A session whose tariff never
  changes writes a list of one, byte-identical to the single-tariff form.

  `parseOCMFBonnTariffTexts()` reads the list, `parseOCMFBonnTariffText()` one
  entry. The vertical bar is also the OCMF envelope separator, but `TT` sits
  inside the JSON payload, which is read by tracking the brace depth rather
  than by splitting on bars; a reader that does split must take the payload
  between the first and the last bar.

- **The OCMF-Test-01 series states its tariffs and marks the changes.** The
  session has three tariff periods - the base energy price, the lower one for
  the minute the grid limits the power, and the base price again - and every
  document now carries the history up to its last reading. The two readings at
  the ends of the limit carry `TX` = `T`, the OCMF reading reason for a tariff
  change, so where the tariff changed and what it changed to are stated in
  agreement with each other.

### Fixed

- **A tariff change split a charging session in two, and silently lost half of
  it.** `TT` was part of the key OCMF documents are grouped by, so the
  documents before and after a tariff change formed two groups - and
  `TryToParseOCMFDocuments()` returns only the first of them. Every reading
  metered under a later tariff was parsed and then dropped without a word: for
  the OCMF-Test-01 series, seven of thirty-three signed meter values. `TT` is
  no longer part of that key. That only the first group is returned at all
  remains as it was, and is worth revisiting separately.

- **Merging charge transparency records dropped the grid operators.** The merge
  enumerates every top-level array by hand, and `gridOperators` was added to
  `IChargeTransparencyRecord` in 0.16.0 without being added there - two records
  merged into one lost a party, silently. A test now merges two records and
  checks that both survive.


## [0.16.0] - 2026-09-08

### Added

- **A grid operator is a party to a charging session.** When the grid asks a
  station to charge more slowly, the session's power drops for a reason that is
  neither the car's nor the station's, and without the constraint and the key
  it was signed with that dip is indistinguishable from a fault. `IGridOperator`
  carries the identity and the keys to tell the two apart: a charging station
  operator minus everything about charging infrastructure, because a grid
  operator runs no pools, stations or tariffs. `@id` is all it requires. A live
  link names one in `gridOperator`, a charge transparency record several in
  `gridOperators` - a live link describes one ongoing session, a record may
  span several grids.

- **`signGridPowerConstraints` is the key usage a grid operator signs under.**
  It joins `signCTRs` for whole records and `signMeterValues` /
  `signEnergyMeterValues` for readings. A constraint is signed with every key
  the operator holds for that usage, so a verifier supporting either algorithm
  can check it.

- **The OCMF-Test-01 series carries a power constraint.** It is now a five
  minute session in 35 documents instead of a three minute one in twenty, and
  the grid operator limits the charging power to 6 kW for one minute in the
  middle of it. The constraint is a `legallyRelevantLogMessage` signed by
  `DE*VEN` under `signGridPowerConstraints` with one ECDSA and one Ed25519 key,
  the meter takes an extra reading where it begins and where it ends, the power
  in between stays below the limit, and the charging periods are cut at both
  ends of it - which is the whole point of the fixture: a dip in the curve with
  a signed explanation next to it. The generator gained
  `OCMF-Test-01__LRLMs.json`, the log messages whose times are relative to the
  start reading, and `--log-messages` / `--no-log-messages` to steer them.

- **Every optional property of the live link document may now be explicitly
  `undefined`.**
  Under `exactOptionalPropertyTypes` a bare `?:` means the property may be
  omitted but not set to `undefined`, which made building a live link from
  optional sources need a conditional per property. `description`, `timeSource`,
  `chargingStationOperator`, `chargingStation`, `chargingSessionId`,
  `eMobilityProvider`, `contract`, `warnings` and `signatureVerification` now
  say `| undefined` like their neighbours already did.

### Fixed

- **The live link documentation described a format two releases old.** Every
  one of these would have produced a document the current code turns away, and
  the format documentation is where a producer looks first:

  - The TOTP configuration was documented as `initialSharedSecret`, renamed to
    `sharedSecret` in 0.15.0. `isTOTPConfig()` requires the new name, so a
    transport copied from the documentation failed `isLiveTransport()` and was
    dropped by a filtering reader without a word - the same failure 0.15.1
    fixed in the fixtures, still sitting in the prose.
  - Transports named their endpoint in `url`, removed in 0.15.0. A transport
    copied from the documentation was well-formed and named no endpoint at all.
  - The minimal document had no `created` and was described as the smallest
    recognised live link. Since 0.15.0 it is not a live link at all:
    recognition requires `@context`, `created` and `liveTransports`, and the
    documentation still said `@context` alone decided it.
  - Reading a document was described as filling in a missing `created`. It
    stopped doing that in 0.15.0, because that timestamp recorded when the
    document was *read*.
  - The TOTP table listed two properties of seven and declared `timeStep`
    required, which it is not; the paragraph below it said the format does not
    specify a hash algorithm, digits or encoding, which it has since done in
    `hashAlgorithm`, `totpLength` and `alphabet`.
  - `refresh` was said to be validated by `IsAChargeTransparencyLiveLink()` and
    the point-of-use guards to include an `isTransport`. Both are
    `isLiveTransport()` now.

### Changed

- **The format documentation lists the properties a live link declares.** The
  interfaces grew in 0.14.0 and 0.15.0 without the documentation following, so
  `chargingSessionId`, `eMobilityProvider`, `chargingPeriods`,
  `legallyRelevantLogMessages` and `supportMessages` appeared nowhere, while
  nine properties that *are* declared were still listed as carried by the
  fixtures and unvalidated. That section now holds what it says: `@id`,
  `imageURLs` and the superseded `geoLocation` and `connector`.

- **An operator's `contact`, `support` and `privacy` are optional.**
  `IChargingStationOperator` had required all three since it was written, and
  `IGridOperator` inherited that when it took its shape. No document in the
  repository carries any of them, nothing validates them, and requiring them
  forced anyone building an operator in TypeScript to invent three properties
  the format's own fixtures do without.

- **The fixtures write an operator's `name` as the `I18NString` it is typed
  as.** The template said `"GraphDefined"` and `"Vanaheimr Electric"` where the
  interfaces say a language-tag-to-string object, so the one document meant to
  show the format did not follow it. It is `{ "en": ... }` now, and the series
  is regenerated.

- **`ILegallyRelevantLogMessage` names its `text` before its `data`.** The
  message comes before the payload that qualifies it, the way `ISupportMessage`
  already had it.

- **`CTR_Format.md` lists `gridOperators`** among the top-level properties of a
  charge transparency record.

- **Two live link tests no longer spell out what the generator regenerates.**
  One asserted `created` to be a fixed timestamp and one the meter values to
  number twenty; both are properties of the moment the fixture was generated
  and of the session parameters, so both broke the first time the series was
  regenerated. They now compare `created` against what the document itself
  states - which is the actual assertion, that reading neither fills in nor
  replaces it - and count the OCMF documents rather than naming a number.


## [0.15.1] - 2026-09-07

### Fixed

- **`isTOTPConfig()` rejected every TOTP configuration that named its hash
  algorithm.** It asked for a number where `TOTPConfig.hashAlgorithm` is a
  string, so a transport stating `"SHA-256"` was not a transport any more.
  Nothing said so: `isLiveTransport()` simply returned false, and a reader
  filtering its transports through it dropped that one without a word. Only
  configurations leaving the property out were unaffected, which is why the
  fixtures did not catch it.

### Changed

- **The OCMF-Test-01 series still spelled the TOTP secret the old way.** The
  rename to `sharedSecret` reached the interfaces in 0.15.0 but not the
  fixtures, so `isLiveTransport()` dropped the websocket and the httpSSE
  transport of every document in it - the test data did not survive its own
  type guard. The template says `sharedSecret` now, and the series and
  `ChargeTransparencyLiveLink_1.json` are regenerated and re-signed from it.


## [0.15.0] - 2026-09-07

### Breaking

- **A live link is recognised by the three things every one of them has.**
  `IsAChargeTransparencyLiveLink()` requires the `@context`, a `created`
  timestamp and a `liveTransports` array; a document missing any of them is not
  a live link. Everything else stays unvalidated there - a malformed optional
  field, and a broken transport most of all, must not turn a document into an
  unrecognised one that then fails as an "unknown format". A transport is
  judged where the transports are read, not where the document is identified.

- **Reading a document no longer fills in a missing `created`.** It used to get
  the current UTC time, which recorded when the document was *read*. In a
  legally relevant document that is not what "created" means, and reading is
  not creating. A live link states its own timestamp, and one that does not is
  not a live link.

- **A transport names its endpoints in `urls`, and only there.** The singular
  `url` was the older spelling of the same thing, was never part of
  `ILiveTransport`, and `isLiveTransport()` no longer looks at it. A transport
  that carries only `url` is still recognised - an unknown property is not an
  error - but it names no endpoint, so there is nothing to show and nothing to
  poll. The fixtures, the format documentation and the tests all say `urls`.

- **`Transport` is now `LiveTransports`, `ITransport` is `ILiveTransport`, and
  `ITransportURL` is gone.** An entry of `urls` is either the URL itself or a
  `chargyInterfaces.IURL` carrying it alongside a `priority` and a `weight`.
  The type guard is `isLiveTransport()`; the top-level export keeps the name
  `isTransport`, so a consumer importing it from the package index sees no
  rename, while one reaching through the `ChargeTransparencyLiveLink` namespace
  has to follow.

- **`TOTPConfig` moved to `chargyInterfaces`, and `initialSharedSecret` is now
  `sharedSecret`.** It also gained `validityTime`, `totpLength`, `alphabet`,
  `timestamp` and `hashAlgorithm`, and `timeStep` became optional - the shape
  the TOTP library actually takes. `isTOTPConfig()` validates it, and
  `isLiveTransport()` calls it, so a transport still spelling the secret the
  old way is dropped along with its TOTP.

- **The top-level `IURL` is a different type now.** `chargyInterfaces.IURL` -
  a `url` with an optional `priority` and `weight` - is what the name resolves
  to when it is imported from the package index; the JSON-LD document with the
  `@context` of `URLContext` is `SimpleURL.IURL` and is no longer re-exported
  by name. The two guards keep them apart: `IsAURL()` judges the document,
  `isURL()` the transport endpoint. Code importing `IURL` from the index keeps
  compiling and means something else.

- **`IChargeTransparencyLiveLink` lost `imageURLs`, `geoLocation` and
  `connector`.** Images belong to whoever they show, so they hang off
  `IChargingStationOperator`, `IChargingStation` and the other things that have
  one; the position belongs to the charging station, and the connector to its
  EVSE. A document keeps saying all of it, one level further in.

- **`ILegallyRelevantLogMessage` moved from `IChargeTransparencyRecord` to
  `chargyInterfaces`,** where a live link can reach it as easily as a record
  can, and `isConnector()` moved to `chargyInterfaces` next to the `IConnector`
  it validates. Both keep their names at the package index; only the
  namespace-qualified paths change.

### Added

- **The interfaces name the quantities they carry.** A metrological value is
  text - `"22 kW"`, `"(230.00 ±0.12) V, k=2"` - because resolution and
  uncertainty are part of the reading and a number would drop both, so `Volt`,
  `Ampere`, `Watt`, `WattHour`, `Ohm`, `Meter`, `Second` and `Kelvin` are
  aliases of `MetrologicalText` rather than of `number`. `Timestamp`,
  `CalendarDate`, `LocalTime`, `ISO8601Duration`, `DurationSeconds`, `Degrees`,
  `LinkedDataContext`, `URL`, `UnitSymbol`, `DecimalScale` and
  `MeasurementMagnitude` do the same for the values that were plain strings and
  numbers before. They document meaning and do not validate syntax: parse at
  the serialization boundary before doing arithmetic.

- **A live link says what it is about, not only where to fetch it.** It may now
  carry its `timeSource`, `lastUpdated`, `updates` and `docRefIdGeneration`,
  the `chargingStationOperator`, `chargingStation`, `chargingSessionId`,
  `eMobilityProvider` and `contract` of the session, its `signedMeterValues`,
  `chargingPeriods`, `legallyRelevantLogMessages` and `supportMessages`, and
  the `keyIdGeneration` its signatures are read under. Most of it was already
  in the documents and read untyped; it is described now.

- **`@context` may be a list.** A document can name an extension context
  alongside this one, and is recognised as long as the list contains the live
  link context.

- **New shapes for what the documents already contained:**
  `IDocumentSignature` - the signature `verifyDocumentSignatures()` consumes -,
  `ISignedMeterValues`, `ITimeSource` with `ITimeServer`, `ISupportMessage`,
  `ILocalController`, `ITemperatureSensor` and `IMetrologicalCable`, the cable
  profile that states its length and resistance as quantity text without a
  second unit field.

- **The topology interfaces carry ids next to their objects.** A charging pool,
  station, EVSE or energy meter can name what it belongs to and what belongs to
  it by id - `chargingStationIds`, `EVSEIds`, `energyMeterIds`,
  `chargingTariffIds`, `temperaturSensorIds` and the singular counterparts -
  so a document may reference rather than nest. They also gained `imageURLs`,
  an operator gained a `name`, an EVSE a `powerType` and a `maxPower`, and a
  public key `keyUsage` and `encodings`.

### Changed

- **The OCMF-Test-01 fixture series is regenerated from its template and
  re-signed,** which the changed transport of every document required.

### Internal dependencies

- @types/node 26.4.1, eslint 10.10.0, globals 17.12.0, playwright 1.63.0 and
  typescript-eslint 8.69.0. The last of those extends
  `no-meaningless-void-operator` to expressions that are not calls, which
  caught the `void x;` idiom marking a parameter as deliberately unused. Those
  parameters now carry the underscore prefix `argsIgnorePattern` already
  covers, the way `_Context` always did.


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
