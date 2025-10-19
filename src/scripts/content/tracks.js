'use strict';

const path = require('path');
const fs = require('fs-extra');

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'track';
}

function normalisePublicPath(slug, value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) {
    return trimmed;
  }
  const normalised = trimmed.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalised.startsWith('/')) {
    return normalised;
  }
  if (normalised.includes('/') && !normalised.startsWith('./')) {
    return normalised;
  }
  return path.posix.join('tracks', slug, normalised);
}

function normaliseTrackNumber(value, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isFinite(number) && number > 0) {
    return number;
  }
  return fallback;
}

function normaliseTracklist(rawList) {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .map((entry, index) => {
      const baseIndex = index + 1;

      if (typeof entry === 'string') {
        const title = entry.trim();
        if (!title) return null;
        return {
          slug: slugify(title),
          title,
          number: baseIndex,
          note: ''
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const rawTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
      const slug = slugify(entry.slug || rawTitle || `track-${baseIndex}`);
      const title = rawTitle || slug;
      const note = typeof entry.note === 'string' ? entry.note.trim() : '';
      const number = normaliseTrackNumber(entry.number, baseIndex);

      return {
        slug,
        title,
        number,
        note
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.number !== b.number) {
        return a.number - b.number;
      }
      return a.slug.localeCompare(b.slug);
    });
}

function buildTrack(rawTrack, index, sharedCover, sharedCoverAlt) {
  if (!rawTrack || typeof rawTrack !== 'object') return null;
  const slug = slugify(rawTrack.slug || rawTrack.id || rawTrack.title || `track-${index + 1}`);
  const title = rawTrack.title?.trim() || slug;
  const audioSrc = normalisePublicPath(slug, rawTrack.audio || rawTrack.file || rawTrack.audioSrc || '');
  if (!audioSrc) {
    return null;
  }
  const year = rawTrack.year ? String(rawTrack.year).trim() : '';
  const description = rawTrack.description?.trim() || '';

  const lyricsSrc = normalisePublicPath(slug, rawTrack.lyrics || rawTrack.transcript || rawTrack.lyricsSrc || '');
  const commentarySrc = normalisePublicPath(slug, rawTrack.commentary || rawTrack.commentarySrc || 'commentary.txt');
  const transcript = lyricsSrc || audioSrc.replace(/\.(mp3|wav|ogg|m4a)(\?.*)?$/i, '.txt');

  const coverOverride = normalisePublicPath(slug, rawTrack.cover || rawTrack.coverArt || '');
  const coverAlt = rawTrack.coverAlt?.trim() || sharedCoverAlt;

  return {
    slug,
    title,
    year,
    description,
    audio: audioSrc,
    transcript,
    lyrics: lyricsSrc,
    commentary: commentarySrc,
    coverArt: coverOverride || sharedCover,
    coverAlt
  };
}

async function loadTracks(projectRoot) {
  const root = projectRoot || path.resolve(__dirname, '..', '..', '..');
  const manifestPath = path.join(root, 'tracks', 'tracks.json');

  let manifest = {};
  try {
    manifest = await fs.readJson(manifestPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const coverArtDefault = manifest.coverArt || manifest.cover || 'assets/cover-art-placeholder.svg';
  const sharedCover = normalisePublicPath('', coverArtDefault);
  const coverAlt = manifest.coverAlt?.trim() || 'cover art';

  const albumTitle = [manifest.albumTitle, manifest.title]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value) || '';
  const albumSubtitle = [manifest.albumSubtitle, manifest.subtitle]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value) || '';
  const albumNote = typeof manifest.note === 'string' ? manifest.note.trim() : '';

  const rawTracks = Array.isArray(manifest.tracks) ? manifest.tracks : [];
  const rawAlbumTracklist = manifest.albumTracklist || manifest.albumTracks || manifest.fullTracklist || manifest.tracklist || [];
  const albumTracklist = normaliseTracklist(rawAlbumTracklist);
  const numberBySlug = new Map(albumTracklist.map((entry) => [entry.slug, entry.number]));
  const numberByTitle = new Map(
    albumTracklist
      .filter((entry) => entry.title)
      .map((entry) => [entry.title.toLowerCase(), entry.number])
  );

  const items = rawTracks
    .map((track, index) => buildTrack(track, index, sharedCover, coverAlt))
    .filter(Boolean)
    .map((track) => {
      const albumNumber = numberBySlug.get(track.slug) || (track.title ? numberByTitle.get(track.title.toLowerCase()) : undefined);
      if (typeof albumNumber === 'number' && Number.isFinite(albumNumber)) {
        track.number = albumNumber;
      }
      return track;
    });

  return {
    title: albumTitle,
    subtitle: albumSubtitle,
    note: albumNote,
    coverArt: sharedCover,
    coverAlt,
    items,
    tracklist: albumTracklist
  };
}

module.exports = {
  loadTracks
};
