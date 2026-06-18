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
