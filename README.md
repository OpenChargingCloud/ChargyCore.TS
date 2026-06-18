# Chargy Core TS

Shared TypeScript core for ChargyDesktopApp, ChargyWebApp, and the future ChargyMobileApp.

## Usage

```ts
import { Chargy } from "@open-charging-cloud/chargy-core";
import { OCMF } from "@open-charging-cloud/chargy-core";
```

The package is published as modern ESM and ships generated TypeScript declarations.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The build emits the package into `dist/`.


```bash
npm pack --dry-run
npm pack
npm publish
```


## Funding

This Open Source project is partially funded by the [NGI Zero Commons Fund](https://nlnet.nl/commonsfund/) as part of our [EVQI project](https://nlnet.nl/project/EVQI/).

We also appreciate any additional funding and long-term support for the Chargy family, for example via [GitHub Sponsors](https://github.com/sponsors/GraphDefined), as it helps us keep the project sustainable, independent and useful for the entire e-mobility community.

<center>
  <img src="images/NGI0_tag.svg" height="30">
</center>
