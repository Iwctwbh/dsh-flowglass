// Canonical plain-script Client assembly used by native builds, disk RPC loaders,
// inline payloads and tests. These files contain no ESM imports at runtime.
export const TOOLBOX_CLIENT_FILES = Object.freeze([
  'plugins/toolbox/flow-launch.js',
  'plugins/toolbox/flow-stable.js',
  'plugins/toolbox/client.js',
])

export const clientImplFiles = (entryOrFile, { includeRuntime = false } = {}) => {
  const file = typeof entryOrFile === 'string' ? entryOrFile : entryOrFile && entryOrFile.clientFile
  const files = file === 'plugins/toolbox/client.js' ? TOOLBOX_CLIENT_FILES : file ? [file] : []
  return (includeRuntime ? ['shared/runtime.js'] : []).concat(files)
}

export const assembleClientSource = (readSource, entryOrFile, options) =>
  clientImplFiles(entryOrFile, options).map((file) => readSource(file)).join('\n')
