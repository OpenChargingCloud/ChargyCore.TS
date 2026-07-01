# Chargy Core — Format Documentation

This folder documents the charge-transparency data formats that ChargyCore.TS can
parse and cryptographically verify, plus the container/representation formats
that transport them and the overall software architecture.

For the high-level feature overview see the [project README](../README.md).

## Signed meter value / signature formats

These formats carry the legally relevant, cryptographically signed meter
readings. Each document describes the data structure, the signed payload and the
signature verification.

| Format | Documentation | Summary |
|--------|---------------|---------|
| ALFEN | [Alfen/README.md](Alfen/README.md) | Compact, line-oriented signed meter values, usually transported inside a SAFE XML container. |
| BAUER BSM-WS36A | [BSM/README.md](BSM/README.md) | JSON snapshots of the BAUER Electronic smart meter (secp256r1), embedded in chargeIT containers. |
| ChargePoint | [chargePoint/README.md](chargePoint/README.md) | Separate payload / signature / public-key files, also read from archive containers. |
| EDL40 / ISA-EDL40 | [EDL40/README.md](EDL40/README.md) | SML-based signed meter readings used in German calibration-law contexts. |
| EMHCrypt01 | [EMH/README.md](EMH/README.md) | EMH metering readings (secp192r1, 320-byte payload), embedded in chargeIT containers. |
| GraphDefined (GDFCrypt01) | [GraphDefined/README.md](GraphDefined/README.md) | GraphDefined signature format. *(documentation pending)* |
| Mennekes EDL40 XML | [Mennekes/README.md](Mennekes/README.md) | XML signed charging processes (secp192r1, 320-byte payload). |
| OCMF | [OCMF/README.md](OCMF/README.md) | Open Charge Metering Format, legacy v0.1 through v1.4, incl. Bonner Eichrechtstage Tariff Text extensions. |
| PCDF | [PCDF/README.md](PCDF/README.md) | Porsche Charging Data Format — a single signed DC charging session. |

## Container & representation formats

These formats are envelopes that group and transport one or more signed meter
values.

| Format | Documentation | Summary |
|--------|---------------|---------|
| chargeIT | [chargeIT/README.md](chargeIT/README.md) | JSON container for a single charging session (old & new variant); carries BSM, EMH or ALFEN signed values. |
| SAFE XML | [SAFE_XML/README.md](SAFE_XML/README.md) | SAFE e.V. XML envelope carrying ALFEN/OCMF/EDL40 signed data, plus Chargy's `<chargingStation>` metadata extension. |
| PTB OCMF Container | [PTBContainer/README.md](PTBContainer/README.md) | JSON envelope wrapping two signed OCMF records plus public key and location data. |
| Namespace-less XML | [XML/README.md](XML/README.md) | A separate, namespace-less XML container of unknown origin (not the SAFE container). |

Additional representations accepted by the library — plain files, the Chargy
multi-session container, archive formats (tar, ZIP, tar.gz, …), QR-code images
and PDF/A-3 attachments — are summarized in the
[project README](../README.md#supported-data-representations).

## Architecture

- [SoftwareArchitecture.md](SoftwareArchitecture.md) — overall library
  architecture (also available as `SoftwareArchitecture.svg` / `.pdf`).
- Data flow overview: `DataFlow.svg` / `DataFlow.png` / `DataFlow.pdf`.
