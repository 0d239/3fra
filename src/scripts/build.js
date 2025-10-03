#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs-extra');
const ejs = require('ejs');

const { loadContent } = require('./content');

const projectRoot = path.resolve(__dirname, '..', '..');
const distDir = path.join(projectRoot, 'dist');
const viewsDir = path.join(projectRoot, 'src', 'views');

const pages = [
  { template: path.join('pages', 'index.ejs'), output: 'index.html' },
  { template: path.join('pages', 'blurbs-page.ejs'), output: 'blurbs.html' },
  { template: path.join('pages', 'tracks-page.ejs'), output: 'tracks.html' },
  { template: path.join('pages', 'runes-page.ejs'), output: 'runes.html' },
  { template: path.join('pages', 'info-page.ejs'), output: 'info.html' }
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
    const srcPath = path.join(projectRoot, entry.source);
    if (!(await fs.pathExists(srcPath))) {
      continue;
    }
    const destPath = path.join(distDir, entry.target);
    await fs.copy(srcPath, destPath);
  }
}

async function renderPages(content) {
  const shared = content || {};
  for (const page of pages) {
    const templatePath = path.join(viewsDir, page.template);
    const additional = typeof page.getData === 'function' ? page.getData(shared) : {};
    const templateData = Object.assign({}, shared, additional, page.data || {});
    const html = await ejs.renderFile(templatePath, templateData, {
      root: viewsDir
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
  const content = await loadContent(projectRoot);
  await Promise.all([renderPages(content), copyStatic()]);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
