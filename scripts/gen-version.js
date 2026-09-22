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

// ── SOURCE_HASH ──────────────────────────────────────────────────────────────
// Huella de los fuentes al momento del build. next build limpia .next/ durante
// la compilación, así que siempre guardamos en un tmp; postbuild lo mueve a
// .next/SOURCE_HASH una vez que la carpeta ya existe.
try {
  const hash = execSync(
    'find lib app/api "app/(app)" -name "*.ts" -o -name "*.tsx" 2>/dev/null | sort | xargs md5sum 2>/dev/null | md5sum | cut -d" " -f1',
    { encoding: 'utf8', shell: '/bin/bash', cwd: path.join(__dirname, '..') }
  ).trim();
  fs.writeFileSync(path.join(__dirname, '..', '.source_hash_tmp'), hash);
  console.log(`[gen-version] SOURCE_HASH ${hash} → .source_hash_tmp (postbuild lo moverá a .next/)`);
} catch (e) {
  console.warn('[gen-version] No se pudo generar SOURCE_HASH:', e.message);
}
