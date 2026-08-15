# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
While the version number is below 1.0.0, breaking changes are released in minor
versions and are always listed first below.


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
  SHA-256 of the OCMF documents the session was built from: reproducible for a
  given record, and distinct between records. The record-level `@id` follows it.

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
