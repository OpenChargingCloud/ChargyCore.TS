# OCMF-Test-01

A simulated **22 kW AC charging session of 3 minutes** with a new signed meter
reading every 10 seconds, published as a **series of 20 charge transparency
live links**, each signed as a whole and chained to its predecessor.

The conventions this document follows — the `encodings` notation, key ids,
signatures, canonicalization, the case of hexadecimal values — are described
once for all of these fixtures in [../README.md](../README.md). This file only
covers what is specific to `OCMF-Test-01`.

| File                          | |
| ----------------------------- | - |
| `OCMF-Test-01__TEMPLATE.json`     | the input template, hand-maintained, with `{{…}}` placeholders |
| `OCMF-Test-01__0000.json` … `__0019.json` | the generated series, always overwritten |
| `generateOCMFTest01.mjs`      | the generator |
| `privateKey_*.pem`            | the four private keys |
| `publicKey_*.pem`             | the matching public keys |

The generator fills the template once per document of the series:

1. the **public keys**, into the `{{publicKey:<name>}}` placeholders, each in
   the encoding its own entry declares,
2. `{{lastUpdated}}` and `{{updates}}` — the latter removed entirely in the
   first document, which supersedes nothing,
3. the **`signedMeterValues`** known at that point, into
   `{{signedMeterValues}}`,
4. **two signatures over the whole document**, into the empty `signatures`
   array — one ECDSA, one Ed25519.

Everything else — identifiers, position, address, connector, transports, time
source — is taken from the template unchanged, including its layout: the
generator substitutes textually and only re-indents the blocks it inserts.

The time source names four PTB servers: `nts://ptbtime1.ptb.de`,
`nts://ptbtime2.ptb.de` and `nts://ptbtime4.ptb.de` share priority 1, so any
two of them satisfy `minServers: 2`, and `ntp://ptbtime3.ptb.de` is the
unauthenticated last resort at priority 2. `ptbtime4` is the one in Berlin,
which keeps the primary set from sitting in a single building. `serversURL`
points at PTB's own service list at
`https://time.ptb.de/files/ptb-ntp-services.json`.

## The series

| Document                  | Meter values | `lastUpdated`          | `updates`            |
| ------------------------- | -----------: | ---------------------- | -------------------- |
| `OCMF-Test-01__0000.json` |            0 | `2026-08-28T11:59:59Z` | absent               |
| `OCMF-Test-01__0001.json` |            1 | `2026-08-28T12:00:00Z` | docRefId of `__0000` |
| `OCMF-Test-01__0002.json` |            2 | `2026-08-28T12:00:10Z` | docRefId of `__0001` |
| …                         |            … | …                      | …                    |
| `OCMF-Test-01__0019.json` |           19 | `2026-08-28T12:03:00Z` | docRefId of `__0018` |

`created` is `2026-08-28T11:59:59Z` in **every** document of the series: one
second before the meter takes its start reading, which is when
`OCMF-Test-01__0001.json` is written. From there `lastUpdated` follows the
readings at ten second intervals.

`__0000.json` carries no meter values, and the whole `signedMeterValues`
property is absent rather than present and empty — there is nothing yet whose
encoding could be described. `__0019.json` carries the end value, so a
hypothetical `__0020.json` would
not be allowed to add anything; see [../README.md](../README.md) for the rules
a series has to satisfy.

This fixture grows by exactly one value per document, which is the simple case.
The format explicitly allows more than one at a time, and a verifier must not
assume otherwise.

The last document of the series is also written to
`../ChargeTransparencyLiveLink_1.json`, byte for byte: the completed session
*is* the full live link fixture, so there is nothing to keep in sync by hand.
That copy is skipped when `--output` points somewhere else, and can be
suppressed with `--no-live-link`.

## The 19 signed meter values

| `values[]` | Role         | `PG`        | `RD` readings | `TX`     | Signing key                 |
| ---------- | ------------ | ----------- | ------------- | -------- | --------------------------- |
| 0          | start        | `T1`        | 1             | `B`      | `energyMeter`               |
| 1 … 17     | intermediate | `T2` … `T18`| 1 (see below) | `C`      | `cpo_signEnergyMeterValues` |
| 18         | end          | `T19`       | 2             | `B`, `E` | `energyMeter`               |

The **end document carries the start and the end reading**, which is the
classic OCMF transaction document that existing solutions expect. It is signed
with the same key as the start document, so a verifier that only knows the
energy meter public key can still check the complete billing-relevant pair.

Because of that, the start reading appears twice across the series — once in
the start document and once in the end document. Importing all 19 documents at
once therefore yields 20 measurement values, of which the first two are the
same reading.

All OCMF documents share the same `FV`/`GI`/`GS`/`GV`/`MV`/`MM`/`MS`/`MF`/`IS`/
`IL`/`IT`/`ID`/`CT`/`CI`/`CF` values and differ only in `PG` and `RD`.

## Write modes

The generator controls how much history an intermediate document carries:

| Mode                      | Intermediate document `n` contains                 |
| ------------------------- | -------------------------------------------------- |
| `--individual` (default)  | only its own reading: `[C]`                        |
| `--incremental`           | the whole session so far: `[B, C, …, C]`           |

The start and the end document are unaffected by the mode.

## Power profile

The session is not charged at a constant 22 kW:

- the **first** interval ramps up and stays clearly below the nominal power
  (12.31 kW),
- the **last** interval ramps down (9.36 kW),
- the intervals in between fluctuate around 22 kW (21.17 … 22.93 kW), so the
  differences between two consecutive readings are visibly noisy instead of
  being a constant 0.0611 kWh.

Meter 1234.0000 → 1235.0433 kWh, i.e. **1.0433 kWh** over 180 s, mean 20.87 kW.
The fluctuation comes from a seeded PRNG, therefore the readings are identical
on every run of the generator.

## Keys

Four key pairs, each as a private and a public PEM file:

| Key pair                    | Algorithm         | Held by                   | Signs                       |
| --------------------------- | ----------------- | ------------------------- | --------------------------- |
| `energyMeter`               | `ECDSA-secp256r1` | the energy meter          | the start and the end value |
| `cpo_signEnergyMeterValues` | `ECDSA-secp256r1` | the charge point operator | the 17 intermediate values  |
| `cpo_signCTRs`              | `ECDSA-secp256r1` | the charge point operator | the whole document          |
| `cpo_signCTRs_Ed25519`      | `EdDSA-Ed25519`   | the charge point operator | the whole document          |

The operator holds **two keys for `signCTRs`** and both sign, so the document
carries two signatures over the same content. That covers three cases that a
single-key fixture cannot: more than one key per key usage (which is the normal
state during a key rotation), two different signature algorithms side by side
(which is what adding a post-quantum algorithm looks like), and a key whose
stored representation differs from the one its id is computed over.

How the keys appear in the generated document, and their ids under this
document's `keyIdGeneration` of
`["SubjectPublicKeyInfo", "DER", "SHA-256", "hex"]`:

| Key pair                    | Stored in the document as              | Key id                                                             |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `energyMeter`               | `["SubjectPublicKeyInfo","DER","hex"]` | `0CFEFC81F7537DB1D2B85AE423BFA45835E664D6F4E77021F6ADBC5B83C7E89C` |
| `cpo_signEnergyMeterValues` | `["SubjectPublicKeyInfo","DER","hex"]` | `845352A3A3695B74785A8FED76BA21FBA3670AD63E12A7EB8E95FA2182AA7EC9` |
| `cpo_signCTRs`              | `["SubjectPublicKeyInfo","DER","hex"]` | `2D5BEE2B13118410C5FF9D6DDC0EEE2E03AB978FA1BC838AEE3655EB7095B9F1` |
| `cpo_signCTRs_Ed25519`      | `["raw","hex"]`                        | `A2F94A58FB75E25BC2CECDF582819B6D44F3705D0C3BADD6391E9D536D5671E8` |

The Ed25519 key is stored **raw**, deliberately: that is the representation
EdDSA and ML-DSA keys usually travel in, and ChargyCore's OCMF verification
requires it for those algorithms. Its id is nevertheless the hash of its
canonical `SubjectPublicKeyInfo` — hashing the stored raw bytes would give
`33B0E501CEB297863D0B5D8FD813DB983C7338CA5596FC29DC61760649670707` instead. See
[../README.md](../README.md) for why the canonical form wins.

The `.pem` files are `["PrivateKeyInfo", "DER", "base64", "PEM"]` and
`["SubjectPublicKeyInfo", "DER", "base64", "PEM"]` respectively, for OpenSSL
and other general-purpose tools.

These are **test keys without any protection** — they exist only to make the
fixtures verifiable and must never be used anywhere else.

## Expected verification result

OCMF does not embed the public key into the signed document, so importing the
OCMF documents on their own yields the measurement status `PublicKeyNotFound`.
Inside this document the keys are present, tagged by `keyUsage`.

## Regenerating

`generateOCMFTest01.mjs` reads the template and writes the whole series next to
itself, overwriting it every time:

    node tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/generateOCMFTest01.mjs

    node tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/generateOCMFTest01.mjs --incremental --template other__TEMPLATE.json --output other.json

`--output` names the **base**: `other.json` produces `other__0000.json`,
`other__0001.json` and so on.

Existing `privateKey_*.pem` files are reused, so the public keys and their key
ids stay stable; only new key pairs are generated when a private key file is
missing. The meter readings are reproducible, but every run still rewrites all
signature values: ECDSA is randomized by design, and although Ed25519 is
deterministic (RFC 8032), the content it signs is not — the OCMF documents
inside `signedMeterValues` carry ECDSA signatures of their own, and those are
part of the signed content.

Because the documents are chained, a rerun rewrites the whole series: a new
signature on `__0000.json` changes its `docRefId`, which changes the `updates`
of `__0001.json`, and so on down the chain. There is no way to regenerate a
single document of a series in place.

The generator evaluates the `keyIdGeneration` and `docRefIdGeneration`
pipelines of the template and the `encodings` of every public key entry instead
of hard-wiring SHA-256 and SPKI, and aborts if a placeholder is missing, occurs
twice or is left unresolved, if a key entry states an algorithm that does not
match its key pair, if the template lacks `keyIdGeneration`,
`docRefIdGeneration` or `created`, or if there is no empty `signatures`
array.
