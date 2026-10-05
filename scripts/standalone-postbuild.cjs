// Post-build step for SELF-HOSTED (standalone) builds: copies the client
// assets into .next/standalone so `node .next/standalone/server.js` can serve
// them. On Vercel there is no standalone output — this is a harmless no-op so
// the same `build` script works everywhere.
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standalone)) {
  console.log('[postbuild] no standalone output — skipping (Vercel serves assets itself)')
  process.exit(0)
}

try {
  fs.cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
    recursive: true,
  })
  fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true })
  console.log('[postbuild] standalone ready: static + public copied')
} catch (e) {
  console.error('[postbuild] copy failed:', e instanceof Error ? e.message : e)
  process.exit(1)
}
