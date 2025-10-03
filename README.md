playing in the sand

## Quick Layout

- `src/views/pages/` – top-level pages rendered during the build.
- `src/views/partials/` – shared layout pieces like the header, nav, and footer.
- `src/views/sections/` – reusable content sections shared across pages.
- `src/scripts/build.js` – static site build entry point wired to `npm run build`.
- `src/templates/` – scaffolding blueprints used by the helper CLIs.
- `assets/`, `blurbs/`, `runes/`, `tracks/` – content and static assets served as-is.
- `dist/` – generated site output (safe to blow away and rebuild).
- `node_modules/` – installed dependencies; recreate with `npm install`.

## Housekeeping Tips

- Consider grouping content-first folders (blurbs, runes, tracks) under a `content/` namespace once you wire data loaders.
- Document any new generators or scripts beside their entrypoints to keep the layout discoverable.
