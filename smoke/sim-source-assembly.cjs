// Validate the real generated disk RPC and native bundle use the same preludes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const ROOT = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const check = (name, value) => { assert.ok(value, name); console.log('PASS | ' + name) }
;(async () => {
  const { assembleClientSource, clientImplFiles } = await import('../build/source-assembly.mjs')
  const { PLUGINS } = await import('../build/plugin-catalog.mjs')
  const { buildDynamicPayload } = await import('../build/payload-builder.mjs')
  const { buildBundle } = await import('../build/build-bundle.mjs')
  const { makeSourceLoader } = await import('../build/source-loader.mjs')
  const entry = PLUGINS.find((item) => item.key === 'toolbox')
  const expected = assembleClientSource(read, entry, { includeRuntime: true })
  const payload = buildDynamicPayload(entry, { readSource: read })
  const handlers = new Map()
  const ctx = {
    get(name) {
      if (name === 'fs') return { async resolve(file) { return file }, async stat() { return {} }, async readText(file) { return file === 'loader.js' ? 'return { fixtureLoader: true }' : read(file) } }
      if (name === 'sandboxPolicy') return { workspaceRoot: ROOT }
      return undefined
    },
    effect(fn) { fn() },
  }
  const harness = { handle(name, handler) { handlers.set(name, handler); return () => {} } }
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + payload.code.host + '\n})()')(ctx, harness, console)
  await plugin.apply(ctx)
  const response = await handlers.get(entry.clientRpc)()
  check('generated dynamic Host RPC reads canonical ordered client sources', response.ok && response.code === expected)
  const raw = await new Function('return (async () => {\n' + response.code + '\n})()')()
  check('assembled plain script evaluates without runtime ESM imports', raw && raw.name === 'toolbox' && typeof raw.apply === 'function')
  const built = buildBundle(makeSourceLoader(pathToFileURL(ROOT + path.sep)), { features: ['flow'], version: '0.0.0-test' })
  check('native bundle builds with extracted helpers', built.ok)
  const native = built.files.get('lib/client.js')
  const hashes = JSON.parse(built.files.get('BUILDINFO.json')).sourceHashes
  check('native Client includes stable factory and recovery helper once each', (native.match(/const createFlowStableRuntime =/g) || []).length === 1 && (native.match(/const runFlowLaunchBatch =/g) || []).length === 1)
  check('build provenance hashes every canonical Client source', clientImplFiles(entry).every((file) => typeof hashes[file] === 'string' && hashes[file].length === 64))
})().catch((error) => { console.error(error); process.exitCode = 1 })
