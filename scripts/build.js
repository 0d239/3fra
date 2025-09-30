#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs-extra');
const ejs = require('ejs');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const pages = [
  { template: 'index.ejs', output: 'index.html' },
  { template: 'blurbs-page.ejs', output: 'blurbs.html' },
  { template: 'tracks-page.ejs', output: 'tracks.html' },
  { template: 'runes-page.ejs', output: 'runes.html' },
  { template: 'info-page.ejs', output: 'info.html' }
];

const staticEntries = [
  { source: 'assets', target: 'assets' },
  { source: 'blurbs', target: 'blurbs' },
  { source: 'tracks', target: 'tracks' },
  { source: 'runes', target: 'runes' },
  { source: 'CNAME', target: 'CNAME' }
];

async function cleanDist() {
  await fs.remove(distDir);
}

async function copyStatic() {
  for (const entry of staticEntries) {
    const srcPath = path.join(rootDir, entry.source);
    if (!(await fs.pathExists(srcPath))) {
      continue;
    }
    const destPath = path.join(distDir, entry.target);
    await fs.copy(srcPath, destPath);
  }
}

async function renderPages() {
  for (const page of pages) {
    const templatePath = path.join(rootDir, page.template);
    const html = await ejs.renderFile(templatePath, page.data || {}, {
      root: rootDir
    });
    const outputPath = path.join(distDir, page.output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, html);
  }
}

async function main() {
  const cleanOnly = process.argv.includes('--clean');

  if (cleanOnly) {
    await cleanDist();
    return;
  }

  await cleanDist();
  await fs.ensureDir(distDir);
  await Promise.all([renderPages(), copyStatic()]);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
