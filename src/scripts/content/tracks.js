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
  const items = rawTracks
    .map((track, index) => buildTrack(track, index, sharedCover, coverAlt))
    .filter(Boolean);

  return {
    title: albumTitle,
    subtitle: albumSubtitle,
    note: albumNote,
    coverArt: sharedCover,
    coverAlt,
    items
  };
}

module.exports = {
  loadTracks
};
