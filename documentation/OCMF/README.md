# Open Charge Metering Format (OCMF)

The Chargy Transparency Software supports the [Open Charge Metering Format (OCMF)](https://github.com/SAFE-eV/OCMF-Open-Charge-Metering-Format) from the legacy version __v0.1__ through __v1.4__.

## Supported Versions

All OCMF 1.x versions are backward compatible and use the same structural
parser. Chargy additionally recognizes the relevant fields introduced by each
minor version:

| Version | Relevant format additions handled by Chargy |
|---------|---------------------------------------------|
| `0.1` | Legacy `VI`/`VV` gateway aliases and string-based `IS` values. |
| `1.0` | Base 1.x payload, transaction pagination, meter and user assignment. |
| `1.1` | Ad-hoc charging and tariff text in `TT`. |
| `1.2` | Cable loss compensation in `LC` and cumulative reading loss in `CL`. |
| `1.3` | EVSE charge-controller firmware in `CF`. |
| `1.4` | Unified IEC 62056-6-1 OBIS representation. |

`FV` has cardinality `0..1` and is therefore genuinely optional. If it is
missing, Chargy parses the payload with the generic OCMF parser and retains the
format version as unknown. It does not insert a version into the signed payload
or claim a concrete version based only on optional feature fields. Legacy and
version-specific fields are still mapped normally.

The version matrix is covered by deterministic randomized test data. Each
supported version is signed and tested once with its `FV` value and once with
the same semantic data but without `FV`:

```text
tests/fixtures/OCMF/versionTestData.ts
tests/OCMFVersions.tests.ts
```

### Bonn Calibration-Law Days Tariff Extension

The Bonn Calibration-Law Days defined a structured interpretation for selected
OCMF `TT` values. Fields are separated by semicolons and monetary parameters
are expressed in euro cents:

| Profile | Format | Interpretation |
|---------|--------|----------------|
| `001` | `001;EUR;W;X;Y;Z` | `W` cents start fee, `X` cents/kWh, plus `Y` cents/minute blocking fee beginning with minute `Z`. |
| `002` | `002;EUR;W;X;Y` | `W` cents start fee, `X` cents/kWh, plus `Y` cents/minute blocking fee after charging ends. |
| `003` | `003;EUR;W;X` | `W` cents start fee plus `X` cents/minute. |

Chargy parses these forms into `IOCMFBonnTariff001`,
`IOCMFBonnTariff002` or `IOCMFBonnTariff003`. The parsed structure is retained
as `CTR.ocmf.tariffTextInterpretation`, while the unmodified `TT` remains in
`CTR.ocmf.tariffText`.

The corresponding CTR `IChargingTariff` uses the original `TT` as its `@id`:

| Bonn value | CTR price component |
|------------|---------------------|
| Start fee | `FLAT`, converted from cents to EUR. |
| Energy fee | `ENERGY`, converted to EUR/kWh. |
| Time fee | `TIME`, converted from cents/minute to EUR/hour, with a 60-second step. |
| Blocking fee | `PARKING_TIME`, converted from cents/minute to EUR/hour, with a 60-second step. |

For profile `001`, `Z` is converted to a tariff restriction of
`min_duration = Z * 60` seconds. For profile `002`, the `PARKING_TIME`
component expresses that the blocking price applies after charging has ended.

Chargy exposes the generated tariff through `CTR.chargingTariffs`, and links it
from the charging session through both `tariffId` and `chargingTariffs`.
Unrecognized free-form `TT` strings remain valid tariff identifiers but do not
receive generated tariff elements.

### Charge Point Assignment

Chargy maps the signed `CT`/`CI` assignment into the standard CTR session
fields:

| `CT` | `CI` format | CTR mapping |
|------|-------------|-------------|
| `EVSEID` | EVSE identifier | `chargingSession.EVSEId` |
| `CBIDC` | `<chargeBoxId> <connectorId>` | `chargingSession.chargingStationId` and `chargingSession.ConnectorId` |

An empty `CI` is treated as no assignment. Signed OCMF identifiers take
precedence over conflicting unsigned metadata from a surrounding container;
container identifiers only fill fields that are absent from OCMF.

From OCMF 1.3 onward, `CF` identifies the charge-controller firmware. When a
charging station can be resolved through `CBIDC` or surrounding container
metadata, Chargy maps it to `chargingStation.firmware.version`. The signed `CF`
value takes precedence over a container firmware version and is additionally
retained as `CTR.ocmf.controllerFirmwareVersion`.

From OCMF 1.2 onward, `LC` describes the charging cable used for loss
compensation. Chargy maps it to `chargingSession.Connector.cable` as follows:

| OCMF | `ICable` |
|------|----------|
| `LN` | `lossCompensation` |
| `LI` | `lossCompensationId` |
| `LR` | `resistance` |
| `LU` | `resistanceUnit` |

Existing unsigned cable metadata such as `length` is retained, while the signed
loss-compensation fields take precedence.

## Parsing OCMF documents

The general structure of an OCMF document is the following:

```
OCMF|<payload>|<signature>
```

Our OCMF parser understands OCMF data on a singe line or on multiple lines. Even within the embedded JSON you can use newline characters, e.g. to pretty print the JSON document:

```
OCMF|{"FV":"1.0","GI":"SEAL AG","GS":"1850006a","GV":"1.34","PG":"T9289","MV":"Carlo Gavazzi","MM":"EM340-DIN.AV2.3.X.S1.PF","MS":"******240084S","MF":"B4","IS":true,"IL":"TRUSTED","IF":["OCCP_AUTH"],"IT":"ISO14443","ID":"56213C05","RD":[{"TM":"2019-06-26T08:57:44,337+0000 U","TX":"B","RV":268.978,"RI":"1-b:1.8.0","RU":"kWh","RT":"AC","EF":"","ST":"G"}]}|{"SD":"304402201455BF1082C9EB8B1272D7FA838EB44286B03AC96E8BAFC5E79E30C5B3E1B872022006286CA81AEE0FAFCB1D6A137FFB2C0DD014727E2AEC149F30CD5A7E87619139"}
```

```
OCMF|
{"FV":"1.0","GI":"SEAL AG","GS":"1850006a","GV":"1.34","PG":"T9289","MV":"Carlo Gavazzi","MM":"EM340-DIN.AV2.3.X.S1.PF","MS":"******240084S","MF":"B4","IS":true,"IL":"TRUSTED","IF":["OCCP_AUTH"],"IT":"ISO14443","ID":"56213C05","RD":[{"TM":"2019-06-26T08:57:44,337+0000 U","TX":"B","RV":268.978,"RI":"1-b:1.8.0","RU":"kWh","RT":"AC","EF":"","ST":"G"}]}|
{"SD":"304402201455BF1082C9EB8B1272D7FA838EB44286B03AC96E8BAFC5E79E30C5B3E1B872022006286CA81AEE0FAFCB1D6A137FFB2C0DD014727E2AEC149F30CD5A7E87619139"}
```

```
OCMF|
{
    "FV": "1.0",
    "GI": "SEAL AG",
    "GS": "1850006a",
    "GV": "1.34",
    "PG": "T9289",
    "MV": "Carlo Gavazzi",
    "MM": "EM340-DIN.AV2.3.X.S1.PF",
    "MS": "******240084S",
    "MF": "B4",
    "IS": true,
    "IL": "TRUSTED",
    "IF": [
        "OCCP_AUTH"
    ],
    "IT": "ISO14443",
    "ID": "56213C05",
    "RD": [
        {
            "TM": "2019-06-26T08:57:44,337+0000 U",
            "TX": "B",
            "RV": 268.978,
            "RI": "1-b:1.8.0",
            "RU": "kWh",
            "RT": "AC",
            "EF": "",
            "ST": "G"
        }
    ]
}|
{
    "SD": "304402201455BF1082C9EB8B1272D7FA838EB44286B03AC96E8BAFC5E79E30C5B3E1B872022006286CA81AEE0FAFCB1D6A137FFB2C0DD014727E2AEC149F30CD5A7E87619139"
}
```

Multiple OCMF documents within e.g. a single text document are possible, e.g. for individual signed START and STOP meter values of a charging session. But a single OCMF document having a valid START and STOP meter value and just a single signature can already be a valid charge transparency record (_see also:_ [Limitations](Limitations)):

```
OCMF|<payload1>|<signature1>
OCMF|<payload2>|<signature2>
```

```
OCMF|
<payload1>|
<signature1>
OCMF|
<payload2>|
<signature2>
```


## Differences to the Specification

1. The specification defines that the `|` separator must not appear within the OCMF payload or signature sections. Despite this, Chargy is cautious about relying on vendors to remember this rule, particularly since the `|` character frequently appears in the free text section of charging tariffs. As a precaution, Chargy employs a stateful parser capable of handling the `|` character within the OCMF payload and signature sections.

2. The specification isn't clear on the correct handling of an empty `Identification Flags` (`IF`) property. Although the _Identification Flags_ array is __optional__, the expectation is that if it's empty, it should be sent as such rather than being omitted. However, it appears that vendors tend to remove this property altogether when it's empty. Therefore Chargy has to tread this property as ___optional___ when parsing OCMF documents.

3. The specification includes `ECDSA-secp384r1-SHA256` and `ECDSA-brainpool384r1-SHA256` algorithms. However, within the cryptographic community, there's a consensus that pairing these elliptic curves with the `SHA256` hash algorithm is not as secure as advertised. The concern arises because the 256-bit output of SHA256 is significantly smaller than the 384-bit block size of the ECC algorithms making the hash algorithm the weakest part of the entire algorithm. Chargy has implemented these algorithms to maintain interoperability, but it also supports the more secure pairings of `ECDSA-secp384r1-SHA384` and `ECDSA-brainpool384r1-SHA384` to address these severe security concerns.

4. `ISO 15118-20` specifies `SHA512` and `secp521r1` as the standard algorithms. Given this standard, it is reasonable to also support these algorithms in the context of the calibration law. Consequently, Chargy extends the OCMF specification to include `ECDSA-secp521r1-SHA512` signatures.



## Limitations

1. OCMF defines a container format designed to encapsulate multiple meter values, rather than focusing on individual signed meter values. Consequently, the OCMF signature serves to authenticate the entire container of meter values as a single entity, ___even when the individual meter values have very different timestamps___, instead of validating each meter value independently. This distinction has significant implications for its integration within EV roaming protocols such as OICP or OCPI. These protocols require that each charging session explicitly provides a START and STOP meter value, with each being digitally signed independently. Also for security reasons it is recommended not to group meter values of very different timestamps within a single OCMF document!

2. As OCMF does not define a __canonical format__ for the JSON serialization of the payload, we have to use the original payload _(ocmfRAWPayload)_ for calculating the signature. This means that non-functional JSON whitespaces can break the signature calculation and therefore inhibit a meaningful interoperability of the signature verification process with other data formats! While Chargy is capable of converting between the OCMF format and other Charge Transparency Formats, this conversion is only possible if the original digital signature was created using the canonical JSON representation of the OCMF payload.  This is a ___major design flaw___ in the OCMF standard!    
Some vendors for instance use a JSON serialization format like `OCMF|{"FV" : "1.0", "GI" : "SEAL AG", ...`.
This practice results in the previously mentioned interoperability issues. 
