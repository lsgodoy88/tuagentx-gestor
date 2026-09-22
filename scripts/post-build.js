#!/usr/bin/env node
// Corre en `postbuild` (después de next build).
// Mueve el SOURCE_HASH desde el tmp de prebuild a .next/

const fs = require('fs');
const path = require('path');

const tmp = path.join(__dirname, '..', '.source_hash_tmp');
const dest = path.join(__dirname, '..', '.next', 'SOURCE_HASH');

try {
  if (fs.existsSync(tmp)) {
    const hash = fs.readFileSync(tmp, 'utf8').trim();
    fs.writeFileSync(dest, hash);
    fs.unlinkSync(tmp);
    console.log(`[post-build] SOURCE_HASH ${hash} → .next/SOURCE_HASH`);
  } else {
    console.warn('[post-build] .source_hash_tmp no encontrado — SOURCE_HASH no generado');
  }
} catch (e) {
  console.warn('[post-build] Error moviendo SOURCE_HASH:', e.message);
}
