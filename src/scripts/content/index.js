'use strict';

const path = require('path');
const { loadRunes } = require('./runes');

async function loadContent(projectRoot) {
  const root = projectRoot || path.resolve(__dirname, '..', '..', '..');

  const [runes] = await Promise.all([
    loadRunes(root)
  ]);

  return {
    runes
  };
}

module.exports = {
  loadContent
};

