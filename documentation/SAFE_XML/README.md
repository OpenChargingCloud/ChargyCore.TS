# SAFE XML Container Format

The SAFE e.V. XML container is an XML envelope that transports one or more
*signed data* blocks of another transparency format (ALFEN, OCMF or EDL40)
together with the public key needed to verify them. It is the container produced
by the [SAFE e.V. transparency software](https://safe-ev.de/) and documented in
the SAFE reference [`XML_Format.md`](https://github.com/SAFE-eV/transparenzsoftware/blob/archive/XML_Format.md).

Chargy parses the SAFE container, decodes each signed data block and hands the
list of blocks to the matching format parser. On top of the base format Chargy
understands an **optional `<chargingStation>` extension** (its own namespace)
that adds the station, EVSE, connector, firmware and geo-location metadata the
base SAFE format does not carry.

> This is not the same as the namespace-less XML container documented under
> [`documentation/XML/`](../XML/README.md), which is a different, unrelated
> format of unknown origin.

## Detection

Chargy routes an XML document to the SAFE parser when its **root element is
`values`** — matched by both node name and local name, so the document is
accepted whether the SAFE XML namespace is present, empty or missing entirely.
This is intentional: the SAFE transparency software v1.0 does not understand its
own XML namespace, so real-world files appear with and without it. The
`SAFE-Testdata-02` fixtures exercise all three variants and produce identical
results.

## Base Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<values>

    <value transactionId="..." context="Transaction.Begin">
        <signedData format="OCMF" encoding="plain">OCMF|{...}|{...}</signedData>
        <publicKey encoding="hex">3059301306...</publicKey>
    </value>

    <value transactionId="..." context="Transaction.End">
        <signedData format="OCMF" encoding="plain">OCMF|{...}|{...}</signedData>
        <publicKey encoding="hex">3059301306...</publicKey>
    </value>

</values>
```

The base schema (see [`SAFE-TransparencySoftware.xsd`](SAFE-TransparencySoftware.xsd)):

| Element | Cardinality | Notes |
|---------|-------------|-------|
| `values` | root | Container of `value` elements. |
| `value` | 0..n | One signed reading. Commonly carries `transactionId` and `context` (e.g. `Transaction.Begin` / `Transaction.End`) attributes. |
| `value/signedData` | 1 | The signed payload, with `format` and `encoding` attributes. |
| `value/publicKey` | 0..1 | The public key, with an `encoding` attribute. May be absent for formats that do not need an external key. |

### `signedData` `format`

The format attribute (case-insensitive) selects the parser for the decoded
blocks:

| `format` | Parser |
|----------|--------|
| `alfen` | [ALFEN](../Alfen/README.md) |
| `ocmf` | [OCMF](../OCMF/README.md) |
| `edl_40_p`, `isa_edl_40_p`, `sml_edl40_p` | [EDL40 / ISA-EDL40](../EDL40/README.md) |

For `ocmf` and `edl40` the container `publicKey` is passed to the parser (OCMF
also receives the public-key `encoding`). ALFEN takes its key from the meter/PKI
instead.

### `signedData` `encoding`

Each block is decoded to text according to the `encoding` attribute before being
handed to the parser:

| `encoding` | Meaning |
|------------|---------|
| *(empty)* / `plain` | UTF-8 text. |
| `base32` | RFC 4648 Base32. |
| `base64` | Base64. |
| `hex` | Hexadecimal; whitespace, `-` and `:` separators are stripped first. |

The `publicKey` `encoding` (e.g. `hex`, `plain`) is captured and forwarded to the
format parser.

### Consistency rules

A container must be internally consistent. Across all `value` elements the
following must be identical, otherwise the whole container is rejected with
`InvalidSessionFormat`:

- the `signedData` `format`,
- the `signedData` `encoding`,
- the `publicKey` `encoding`,
- the `publicKey` value.

Each `value` must contain a non-empty `signedData` block; a `value` with only a
`publicKey` is rejected.

## Chargy Extensions — the `<chargingStation>` element

The base SAFE format only transports the signed data and the public key. To
provide "true transparency" (station identity, location, connector type, …),
Chargy adds an **optional** `<chargingStation>` element in its own namespace:

```text
https://open.charging.cloud/CTR/2020/01
```

```xml
<values>

    <chargingStation id="DE*GEF*STATION*CI*TESTS*1*A"
                     xmlns="https://open.charging.cloud/CTR/2020/01">

        <description language="en">GraphDefined Charging Station - Station A</description>

        <firmware>
            <version>3.0.25.2089</version>
            <checksum>...</checksum>
        </firmware>

        <geoLocation>
            <latitude>50.387945</latitude>
            <longitude>10.4304</longitude>
        </geoLocation>

        <EVSE id="DE*GEF*EVSE*CI*TESTS*1*A*1">
            <description language="en">GraphDefined EVSE - Station A / EVSE 1</description>
            <connector id="1">
                <type>Type-2</type>
            </connector>
        </EVSE>

    </chargingStation>

    <value ...>...</value>

</values>
```

Chargy parses this into container metadata and merges it into the resulting
charge transparency record:

| XML | Parsed into |
|-----|-------------|
| `chargingStation@id` | `chargingStations[].@id` and the session's `chargingStationId` |
| `chargingStation/description[@language]` | `chargingStations[].description` (`I18NString`) |
| `chargingStation/firmware/version`, `.../checksum` | `chargingStations[].firmware` |
| `chargingStation/geoLocation/latitude`, `.../longitude` | `chargingStations[].geoLocation` (`{ lat, lng }`) |
| `EVSE@id` | `chargingStations[].EVSEs[].@id` and the session's `EVSEId` |
| `EVSE/description[@language]` | `EVSEs[].description` |
| `EVSE/connector@id` | `EVSEs[].connectors[].@id` and the session's `ConnectorId` |
| `EVSE/connector/type` | `EVSEs[].connectors[].type` and the session's `Connector.type` |

The extension is parsed leniently so a metadata problem never fails an otherwise
valid signature:

- More than one `chargingStation`, `EVSE` or `connector` element adds a **low
  level warning** ("Only one … is allowed …") and the first element is used.
- A missing/invalid `chargingStation@id`, `EVSE` or `connector` element drops the
  extension metadata for that level but the signed values are still verified.

Only the field values themselves are metadata; the cryptographic evidence comes
solely from the signed data blocks. The `<chargingStation>` element is **not**
covered by any signature — it is descriptive context, not signed data.

## Transport / Representations

A SAFE XML container is accepted:

- as a plain `.xml` file (namespace present, empty or absent),
- embedded inside a **PDF/A-3** document as an additional data stream
  (`SAFE-Testdata-02_withXMLNamespace.pdf`),
- and inside the usual archive formats handled by Chargy.

## Test Fixtures

```text
tests/fixtures/SAFE/SAFE-Testdata-01_OCMFv0.1.xml
tests/fixtures/SAFE/SAFE-Testdata-02_withXMLNamespace.xml
tests/fixtures/SAFE/SAFE-Testdata-02_withoutXMLNamespace.xml
tests/fixtures/SAFE/SAFE-Testdata-02_emptyXMLNamespace.xml
tests/fixtures/SAFE/SAFE-Testdata-02_withXMLNamespace.pdf
tests/fixtures/SAFE/SAFE-Testdata-03_singleMeasurement_ShouldFail.xml
tests/fixtures/SAFE/SAFE-Testdata-04.xml
tests/fixtures/SAFE/withChargyExtensions/SAFE-Testdata-01_OCMFv0.1_withExtensions.xml
tests/fixtures/SAFE/withChargyExtensions/SAFE-Testdata-02.xml
tests/fixtures/SAFE/withChargyExtensions/SAFE-Testdata-02_multipleEVSEs_shouldFail.xml
tests/fixtures/SAFE/withChargyExtensions/SAFE-Testdata-02_multipleConnectors_shouldFail.xml
```

They are exercised by `tests/SAFE.tests.ts` (base container, namespace variants,
PDF/A-3) and `tests/SAFE_withChargyExtensions.tests.ts` (the `<chargingStation>`
extension, including the warning-only behaviour for multiple EVSE/connector
elements).

## References and Related Formats

- SAFE e.V. XML format reference:
  <https://github.com/SAFE-eV/transparenzsoftware/blob/archive/XML_Format.md>
- Base schema: [`documentation/SAFE_XML/SAFE-TransparencySoftware.xsd`](SAFE-TransparencySoftware.xsd)
- Implementation: [`src/SAFE_XML.ts`](../../src/SAFE_XML.ts)
- Carried formats: [ALFEN](../Alfen/README.md), [OCMF](../OCMF/README.md),
  [EDL40 / ISA-EDL40](../EDL40/README.md)
- The unrelated namespace-less [XML container](../XML/README.md).
