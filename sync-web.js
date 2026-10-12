#!/usr/bin/env node
/* sync-web.js — copy the game's web files into www/ for Capacitor.
 *
 * Capacitor copies one folder (`webDir`) into the native projects, and the
 * game lives at the repo root beside package.json, tools/ and node_modules.
 * Rather than move the game, this pulls just the files the page loads into a
 * clean www/. The list comes from index.html's own <script> and <link> tags,
 * so a new script can't silently miss the app. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'www');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const clean = (ref) => ref.split('?')[0];
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/gi)].map((m) => clean(m[1]));
const links = [...html.matchAll(/<link[^>]+href="([^"]+)"/gi)].map((m) => clean(m[1]));

const files = new Set(['index.html', 'version.json', ...scripts, ...links]);
fs.rmSync(out, { recursive: true, force: true });
for (const rel of files) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) { console.error('sync-web.js: index.html names ' + rel + ', which does not exist'); process.exit(1); }
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.copyFileSync(src, path.join(out, rel));
}
console.log('www/ populated with ' + files.size + ' files');
