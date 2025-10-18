# Tracks quickstart

1. Update `tracks/tracks.json` with your songs. Each entry supports:
   - `slug`: folder name used for the static files and CSS class.
   - `title`: what shows up in the player.
   - `year`: optional string.
   - `description`: optional blurb under the title.
   - `audio`: either a file name that lives in `tracks/<slug>/` or a relative/absolute path.
   - `lyrics`: optional text file with the words (defaults to the audio name with `.txt`).
   - `cover`/`coverAlt`: optional per-track overrides if you ever diverge from the shared art.
2. Drop the shared cover image somewhere in the repo (default is `assets/cover-art-placeholder.svg`) and set `coverArt` + `coverAlt` at the top of the manifest.
3. Put the audio plus lyrics in `tracks/<slug>/`. A simple `.txt` lyric sheet loads fastest in the browser viewer.
4. Run `npm run build` and open `dist/tracks.html` to verify everything wired up.
