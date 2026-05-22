#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join('src', 'pages');
const OUT_DIR = '.';

function parseFrontMatter(content) {
  const match = content.match(/^<!--\n([\s\S]*?)\n-->\n?/);
  if (!match) return { vars: {}, rest: content };
  const vars = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    vars[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { vars, rest: content.slice(match[0].length) };
}

function resolveIncludes(content, baseDir) {
  return content.replace(/<!--#include "([^"]+)"-->/g, (_, rel) => {
    const fullPath = path.join(baseDir, rel);
    const included = fs.readFileSync(fullPath, 'utf8');
    return resolveIncludes(included, path.dirname(fullPath));
  });
}

function applyVars(content, vars) {
  return content
    .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
    .replace(/\{\{activeNav:(\w+)\}\}/g, (_, page) =>
      vars.activeNav === page ? ' aria-current="page"' : '');
}

function buildPage(file) {
  const src = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
  const { vars, rest } = parseFrontMatter(src);
  const withIncludes = resolveIncludes(rest, 'src');
  const final = applyVars(withIncludes, vars);
  fs.writeFileSync(path.join(OUT_DIR, file), final, 'utf8');
  console.log(`  built → ${file}`);
}

function buildAll() {
  console.log('Building...');
  for (const file of fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.html'))) {
    buildPage(file);
  }
  console.log('Done.\n');
}

buildAll();

if (process.argv.includes('--watch')) {
  console.log('Watching src/ for changes…');
  fs.watch('src', { recursive: true }, (_, filename) => {
    if (filename?.endsWith('.html')) {
      console.log(`\nChanged: ${filename}`);
      try { buildAll(); } catch (e) { console.error(e.message); }
    }
  });
}
