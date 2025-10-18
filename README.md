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

## Tracks Workflow

- Edit `tracks/tracks.json` to list each song. Fields: `slug` (folder name), `title`, `year`, `description`, `audio` (file name or explicit path), and `lyrics` (text file with the words). Provide file names when the assets live beside each other in `tracks/<slug>/` or a full relative path if you keep them elsewhere.
- Drop the shared cover art image in `assets/` and point `coverArt` in the manifest at it. Update `coverAlt` so screen readers have a useful description.
- For every entry, place the audio file and lyric sheet inside `tracks/<slug>/`. Plain `.txt` keeps the in-browser lyric viewer happy.
- Run `npm run build` when you are ready; the build copies `assets/` and `tracks/` into `dist/`, so the player and transcript fetches will just work.
