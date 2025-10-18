'use strict';

const path = require('path');
const { loadRunes } = require('./runes');
const { loadTracks } = require('./tracks');

async function loadContent(projectRoot) {
  const root = projectRoot || path.resolve(__dirname, '..', '..', '..');

  const [runes, tracks] = await Promise.all([
    loadRunes(root),
    loadTracks(root)
  ]);

  return {
    runes,
    tracks
  };
}

module.exports = {
  loadContent
};
