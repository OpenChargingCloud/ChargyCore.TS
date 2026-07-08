# Chargy Core

Chargy Core is a transparency software library for the validation of secure and transparent e-mobility charging processes, as defined by the *German Calibration Law ("Eichrecht")* in combination with the [Alternative Fuels Infrastructure Regulation (AFIR)](https://transport.ec.europa.eu/transport-themes/clean-transport/alternative-fuels-sustainable-mobility-europe/alternative-fuels-infrastructure_en) and the new [Measuring instruments (MID)](https://single-market-economy.ec.europa.eu/single-market/goods/european-standards/harmonised-standards/measuring-instruments-mid_en) of the European Commission and the [European Digital Quality Infrastructure](https://www.qi-digital.de/en/). The software allows you to verify the cryptographic signatures of energy measurements within charge detail records and comes with a couple of useful extentions to simplify the entire process for endusers and operators.

This software is written as a modern ESM TypeScript package with generated declaration files, providing shared core functionality for the Chargy Desktop, Web & Mobile applications.


## Benefits of Chargy

1. Chargy comes with __*meta data*__. True charging transparency is more than just signed smart meter values. Chargy allows you to group multiple signed smart meter values to entire charging sessions and to add additional meta data like EVSE information, geo coordinates, tariffs, ... within your backend in order to improve the user experience for the ev drivers.
2. Chargy is __*secure*__. Chargy implements a public key infrastructure for managing certificates of smart meters, EVSEs, charging stations, charging station operators and e-mobility providers. By this the ev driver will always retrieve the correct public key to verify a charging process automatically and without complicated manual lookups in external databases.
3. Chargy is __*Open Source*__. In contrast to other vendors in e-mobility, we belief that true transparency is only trustworthy if the entire process and the required software is open and reusable under a fair copyleft license (AGPL).
4. Chargy is __*open for your contributions*__. We currently support adapters for the protocols of different charging station vendors like chargeIT mobility, ABL (OCMF), chargepoint. The certification at the Physikalisch-Technische Bundesanstalt (PTB) is provided by chargeIT mobility. If you want to add your protocol or a protocol adapter feel free to read the contributor license agreement and to send us a pull request.


## Supported Charge Transparency Data Formats

ChargyCore.TS supports a broad range of charge transparency data formats used by charging stations, energy meters, backend systems, and invoice-related exports.

Currently supported formats include:
- **Alfen** charge transparency data
- **Bauer** energy meter data (2 format variants)
- **ChargePoint** transparency data (2 format variants)
- **EDL40** and **ISA-EDL40 SML** data
- **EMH** energy meter data
- **Mennekes** XML
- **OCMF**, versions v1.1 to v1.4
  - Bonner Eichrechtstage **Tariff Text** Extensions
- **Porsche Charging Data Format (PCDF)**

Detailed per-format documentation (data structures, signed payloads and signature verification) is available in [`documentation/`](documentation/README.md).

The long-standing, consumer-oriented CTR data model is described in the draft
[Charge Transparency Record format specification](documentation/CTR_Format.md).
CTR connects signed technical evidence with charging sessions, tariffs, costs,
and PDF/A-3 invoices so EV drivers can assess a bill without having to understand
each meter vendor's cryptographic format.
Additional draft CTR extension specifications are available for
[legally relevant log messages](documentation/CTR_Legally_Relevant_Log_Messages.md)
and [time synchronization sources](documentation/CTR_Time_Synchronization_Sources.md),
including event pagination, hash chaining, NTS source information, clock
quality, and significant time-source changes.


## Supported Data Representations

ChargyCore.TS accepts multiple data representations in order to simplify the validation of individual charge transparency files as well as larger collections of transparency data, for example data sets attached to monthly invoices or exported from backend systems.

Supported representations include:
- **Plain Files** containing a single charge transparency data set.
- **chargeIT Container Format**, a JSON-based container format for a single charging session (2 format variants).
- **Chargy Container Format**, a JSON-based container format for multiple charging sessions.
- **SAFE XML Container Format**, an XML-based container format for a single charging session, optionally enriched with additional Chargy metadata about the charging session.
- **PTB Container Format**, a JSON-based container format for a single charging session.
- **Archive formats** such as ***tar, ZIP, tar.gz***, and similar formats that combine or compress multiple charge transparency files.
- **QR-Code images**, such as ***PNG, JPG, JPEG or SVG files***, where the QR-Code represents a charge transparency data set.
- **PDF/A-3** files transporting a charge transparency file as an embedded additional data stream.

This allows applications to pass transparency data to ChargyCore.TS in the form in which it was originally received, without having to manually unpack, decode, or normalize every file beforehand.


## Applications based on this library

- [Chargy Web App](https://github.com/OpenChargingCloud/ChargyWebApp/) (node.js), live demo at [https://chargy.charging.cloud](https://chargy.charging.cloud)
- [Chargy Desktop App](https://github.com/OpenChargingCloud/ChargyDesktopApp/) (Electron)
- [Chargy Mobile Apps](https://github.com/OpenChargingCloud/ChargyMobileApp/) (Android/iOS)


## Usage

This package is published on npm as [`@open-charging-cloud/chargy-core`](https://www.npmjs.com/package/@open-charging-cloud/chargy-core)

First install it e.g. via npm
```bash
npm install @open-charging-cloud/chargy-core@latest
```

or, for reproducible builds, pin a specific version:
```bash
npm install @open-charging-cloud/chargy-core@<version>
```

Basic Import (TypeScript / ESM) TypeScript
```ts
import { Chargy } from "@open-charging-cloud/chargy-core";
```
The package ships as a modern ESM package and includes generated TypeScript declarations, so it can be used directly in TypeScript projects without additional type packages.


### Signature providers

ChargyCore uses audited Noble implementations for modern signature algorithms. The common `SignatureSuite` API supports ECDSA over secp256k1, P-256, P-384 and P-521; Ed25519, Ed25519ctx, Ed25519ph, Ed448 and Ed448ph; and the FIPS 204 ML-DSA-44, ML-DSA-65 and ML-DSA-87 parameter sets. The older `elliptic` implementation is restricted to verification of legacy P-192 charging data.

Keys and signatures use `Uint8Array`, and every serialized JSON signature records its algorithm and encoding. For example:

```ts
import {
  generateSignatureKeyPair,
  signMessage,
  verifyJSONMessageSignatures
} from "@open-charging-cloud/chargy-core";

const keyPair = generateSignatureKeyPair("ML-DSA-65");
const record = { sessionId: "DE*TEST*E1", energy: 12.5 };

await signMessage(record, keyPair);
const valid = await verifyJSONMessageSignatures(record);
```

Use the distinct `Ed25519ph`, `Ed448ph`, or ML-DSA algorithm identifier when a protocol requires that variant. The generic `prehashed` option is intentionally rejected for these schemes so that pure and pre-hash signatures cannot be confused accidentally.


### Runtime Architecture

ChargyCore is consumed in different JavaScript runtimes. The browser-based Chargy WebApp and Electron renderer processes have Web APIs such as `DOMParser`, `Blob`, `TextEncoder`, `ImageData`, `DOMMatrix`, `Path2D`, and browser worker loading semantics. Node.js-based tests, command line tools, server-side verification, and build-time checks do not provide the same environment.

For that reason the package ships two JavaScript builds behind one public import:

```text
dist/browser/index.js
dist/node/index.js
```

The runtime-specific file is selected through conditional package exports in `package.json`. Browser bundlers should resolve the `browser` condition and receive `dist/browser/index.js`. Node.js resolves the `node` condition and receives `dist/node/index.js`.

This split is especially important for PDF.js. Browser contexts should use the normal `pdfjs-dist` build, because the browser already provides the canvas and DOM APIs PDF.js expects. Node.js should use `pdfjs-dist/legacy/build/pdf.mjs`, because the legacy build contains Node-oriented setup for the missing canvas-related globals and avoids the modern browser-only assumptions.

Keeping these paths separate has several advantages:

- Browser bundles do not include the Node/legacy PDF.js path as an unused lazy chunk.
- Node tests and CLI-style usage do not depend on browser-only PDF.js behavior.
- Chargy apps do not need local Webpack aliases or test polyfills for ChargyCore internals.
- Bundle checks can verify that the browser build only references browser PDF.js imports and the Node build only references legacy PDF.js imports.

When adding runtime-sensitive dependencies, avoid branching on runtime inside shared source code if that would make bundlers see both implementations. Prefer a small adapter under `src/` and let the build or conditional exports select the runtime-specific implementation.



## Development

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run test:node
npm run test:bundle
npm run test:browser
npm test
npm run verify
```

The build emits the package into `dist/`.


### Expected Test Flow

For code changes, use the full verification flow before publishing or handing a package to the Chargy apps:

```bash
npm run verify
```

`verify` runs the following checks:

- `npm run typecheck`: validates the TypeScript sources and test/config TypeScript files.
- `npm run lint`: runs the strict type-aware ESLint setup and fails on every warning or error.
- `npm test`: runs all runtime checks:
  - `npm run test:node`: runs the Chargy fixture tests in Vitest's Node environment and uses the Node PDF.js adapter.
  - `npm run build`: creates both package builds.
  - `npm run test:bundle`: checks the generated bundles so the browser build only references the browser PDF.js path and the Node build only references the legacy PDF.js path.
  - `npm run test:browser`: imports `dist/browser/index.js` in headless Chromium via Vitest Browser Mode and verifies the public browser entry can be loaded and instantiated.
- `npm run build`: recreates the final publishable `dist/` output.

For dependency, build, export, PDF.js, or browser-facing changes, run the individual steps while iterating and finish with `npm run verify`. The browser test requires Playwright's Chromium browser; if it is missing locally, run:

```bash
npx playwright install chromium
```

## Publishing

```bash
npm version 0.11.0 --no-git-tag-version
npm run verify
npm pack --dry-run
npm pack
npm login
npm whoami
npm publish
```


## Funding

This Open Source project is partially funded by the [NGI Zero Commons Fund](https://nlnet.nl/commonsfund/) as part of our [EVQI project](https://nlnet.nl/project/EVQI/).

We also appreciate any additional funding and long-term support for the Chargy family, for example via [GitHub Sponsors](https://github.com/sponsors/GraphDefined), as it helps us keep the project sustainable, independent and useful for the entire e-mobility community.

<center>
  <img src="images/NGI0_tag.svg" height="30">
</center>
