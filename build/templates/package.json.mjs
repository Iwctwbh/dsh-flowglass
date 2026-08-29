// ===== build/templates/package.json.mjs：原生 DSH 双端包 manifest =====
export const renderPackageJson = ({ packageName, version, description, bundleId, repositoryDirectory, hasModelTools }) => JSON.stringify({
  name: packageName,
  version,
  description,
  type: 'module',
  main: './lib/index.js',
  exports: {
    '.': './lib/index.js',
    './client': './lib/client.js',
    './remote': './lib/remote.js',
    './package.json': './package.json',
  },
  repository: {
    type: 'git',
    url: 'https://github.com/Iwctwbh/dsh-flowglass.git',
    ...(repositoryDirectory ? { directory: repositoryDirectory } : {}),
  },
  license: 'MIT',
  author: 'Iwctwbh',
  keywords: [...new Set(['deepseek-harness', 'dsh', 'plugin', 'toolbox'].concat(bundleId ? [bundleId] : []))],
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      platform: 'web',
      // inject 是信息性 package 依赖边（boot graph 预取/HMR diff）；client-runtime
      // 已随新 Harness 的 client-runtime 包删除移除，ui-session 是跨会话草稿写入
      // （ctx.uiSession）的实际运行时来源。
      inject: [
        '@deepseek-ai/dsh-client-ui-session',
        '@deepseek-ai/dsh-api-remotes',
        '@deepseek-ai/dsh-client-ui-layout',
        '@deepseek-ai/dsh-client-ui-sidebar',
      ],
    },
  },
  files: ['lib/**', 'manifest.json', 'BUILDINFO.json', 'cordis.patch.yml', 'README.md', 'LICENSE'],
  engines: { node: '>=22.19' },
  peerDependencies: {
    // Host 半的 lib/index.js 直接 import 该协议包（TypertRemoteService/Remote），
    // 由宿主 Harness 提供实体，这里只声明关系。semver 的 prerelease 规则下，
    // 裸下限/旧元组 caret 都不接受其他 patch 位的 prerelease，须显式并入当前
    // Harness 通道（0.1.2-alpha.*），否则对最新 Harness 判不兼容。
    '@deepseek-ai/dsh-typert-protocol': '^0.1.1-rc.2 || ^0.1.2-alpha.1',
    ...(hasModelTools ? { '@deepseek-ai/dsh-tools': '^0.1.0-rc.8 || ^0.1.2-alpha.1' } : {}),
    ...(bundleId === 'flow' ? {
      '@deepseek-ai/dsh-client-ui-primitives': '^0.1.1-rc.2 || ^0.1.2-alpha.1',
      'dsh-better-sidebar': '>=0.4.0',
      'react-dom': '^18.3.1',
    } : {}),
    react: '^18.3.1',
  },
  ...(bundleId === 'flow' ? {
    peerDependenciesMeta: {
      'dsh-better-sidebar': { optional: true },
    },
  } : {}),
}, null, 2) + '\n'
