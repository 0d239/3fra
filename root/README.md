# hacker-blog-starter

A tiny retro, hacker‑vibe personal site. Bare‑bones HTML. Notes-as-CSS. Songs with CSS manifests. Minimal JS to hydrate text and audio.

## How to run
Just open `index.html` in a browser. Or deploy the folder to Neocities or GitHub Pages.

## Add a new note
1. Copy `notes/welcome.note.css` to `notes/your-slug.note.css`.
2. Edit the CSS strings:
   ```css
   .note-your-slug{
     --title: "my title";
     --date: "2025-10-01";
     --tags: "#misc";
     --body: "first line\A second line";
   }
   ```
3. In `index.html`, duplicate one of the `<article class="note ...">` blocks and change the class to match: `note-your-slug`.

## Add a new song
1. Create a folder under `songs/your-song` and place an audio file (mp3 / wav / ogg).
2. Create `songs/your-song/song.css` with variables, for example:
   ```css
   .song-your-song{
     --song-title: "my_song";
     --song-year: "2025";
     --song-desc: "a chill track";
     --audio-src: "songs/your-song/my_song.mp3";
     --cover-grad-1: #001100;
     --cover-grad-2: #39ff14;
   }
   ```
3. In `index.html`, copy the existing `<article class="song ...">` and rename its class to `song-your-song`. The JS will set the audio src from your CSS manifest.

Optional: Add `transcript.txt` next to your audio. The page will try to load it when the details element is opened.

## Longer articles
Just make plain HTML files in `articles/YYYY-MM-DD-slug/index.html` and link them from the list on the homepage.

## Accessibility & fallback
- All text is hydrated into the DOM for screen readers (not only via `::before`).
- `prefers-reduced-motion: reduce` disables the glitch animation.
- Keyboard: `g` toggles glitch, `t` toggles tilt.
