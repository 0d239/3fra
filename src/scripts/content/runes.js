'use strict';

const path = require('path');
const fs = require('fs-extra');

function parseDirName(name) {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!match) {
    return { date: null, slug: name };
  }
  return { date: match[1], slug: match[2] };
}

function fallbackTitleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractTitle(html) {
  if (!html) {
    return null;
  }
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].trim();
  }
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  return null;
}

function extractDate(html) {
  if (!html) {
    return null;
  }
  const timeMatch = html.match(/<time[^>]*datetime\s*=\s*"([^"]+)"/i);
  if (timeMatch) {
    return timeMatch[1].trim();
  }
  const mutedMatch = html.match(/<p[^>]*class="[^"]*muted[^"]*"[^>]*>([^<]+)<\/p>/i);
  if (mutedMatch) {
    return mutedMatch[1].trim();
  }
  return null;
}

async function readRuneMeta(dirPath, dirName) {
  const metaPath = path.join(dirPath, 'meta.json');
  const htmlPath = path.join(dirPath, 'index.html');
  let base = parseDirName(dirName);
  let meta = {};

  try {
    meta = await fs.readJson(metaPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Failed to read ${metaPath}: ${err.message}`);
    }
  }

  let html = '';
  try {
    html = await fs.readFile(htmlPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Failed to read ${htmlPath}: ${err.message}`);
    }
  }

  const title = meta.title || extractTitle(html) || fallbackTitleFromSlug(base.slug || dirName);
  const date = meta.date || extractDate(html) || base.date;
  const summary = meta.summary || null;
  const slug = meta.slug || base.slug || dirName;

  return {
    title,
    date,
    summary,
    slug
  };
}

async function loadRunes(projectRoot) {
  const runesDir = path.join(projectRoot, 'runes');
  const exists = await fs.pathExists(runesDir);
  if (!exists) {
    return [];
  }

  const entries = await fs.readdir(runesDir, { withFileTypes: true });
  const runes = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirName = entry.name;
    const dirPath = path.join(runesDir, dirName);
    const meta = await readRuneMeta(dirPath, dirName);
    const href = `runes/${dirName}/index.html`;

    runes.push({
      ...meta,
      href,
      dirName
    });
  }

  runes.sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA === dateB) {
      return a.title.localeCompare(b.title);
    }
    return dateA < dateB ? 1 : -1;
  });

  return runes;
}

module.exports = {
  loadRunes
};

