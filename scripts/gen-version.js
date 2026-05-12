#!/usr/bin/env node
// Genera lib/version.ts con metadatos del build.
// Se ejecuta en `prebuild`. El archivo generado está en .gitignore.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function git(cmd, fallback = 'unknown') {
  try { return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return fallback; }
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const info = {
  version: pkg.version,
  commit: git('rev-parse --short HEAD'),
  fullCommit: git('rev-parse HEAD'),
  branch: process.env.DEPLOY_BRANCH || git('rev-parse --abbrev-ref HEAD'),
  commitDate: git('log -1 --format=%cI'),
  buildDate: new Date().toISOString(),
  env: process.env.DEPLOY_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  tag: git('describe --tags --exact-match', '') || null,
};

const ts = `// AUTO-GENERADO en prebuild — no editar
export const VERSION_INFO = ${JSON.stringify(info, null, 2)} as const;
export type VersionInfo = typeof VERSION_INFO;
`;

const outPath = path.join(__dirname, '..', 'lib', 'version.ts');
fs.writeFileSync(outPath, ts);
console.log(`[gen-version] ${info.version} ${info.commit} (${info.branch}) → ${outPath}`);
