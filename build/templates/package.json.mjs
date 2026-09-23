// ===== build/templates/package.json.mjs：原生 DSH 双端包 manifest =====
export const renderPackageJson = ({ packageName, version, description, bundleId, repositoryDirectory, hasModelTools, featureExports = [] }) => JSON.stringify({
  name: packageName,
  version,
  description,
  type: 'module',
  main: './lib/index.js',
  exports: {
    '.': './lib/index.js',
    './client': './lib/client.js',
    './remote': './lib/remote.js',
    ...Object.fromEntries(featureExports.map((key) => ['./feature/' + key, './lib/features/' + key + '.js'])),
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
      // inject 是信息性 package 依赖边（boot graph 预取/HMR diff）：
      //   ui-session / api-session-controller —— ctx.sessions 与事件窗（binding().eventSource）来源；
      //   ui-sidebar-right —— ctx.sidebarRightTabs / ctx.sidebarRight 与 sidebar.right.pane.tab Slot；
      //   ui-layout / ui-sidebar —— shell.overlay 与导航注入兜底。
      inject: bundleId === 'flow' || bundleId === 'dynamic-toolbox' ? [
        '@deepseek-ai/dsh-client-ui-session',
        '@deepseek-ai/dsh-api-session-controller',
        '@deepseek-ai/dsh-api-workspace-controller',
        '@deepseek-ai/dsh-api-remotes',
        '@deepseek-ai/dsh-client-ui-workspace',
        '@deepseek-ai/dsh-client-ui-layout',
        '@deepseek-ai/dsh-client-ui-sidebar',
        '@deepseek-ai/dsh-client-ui-sidebar-right',
      ] : [
        '@deepseek-ai/dsh-client-ui-session',
        '@deepseek-ai/dsh-api-session-controller',
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
    // 由宿主 Harness 提供实体，这里只声明关系。基线 DSH 0.1.5-rc.1+：
    // 0.1.5 通道（含 rc.2+）与后续 0.1.x/0.2.0 正式版兼容。
    '@deepseek-ai/dsh-typert-protocol': '^0.1.5-rc.1 || ^0.1.6-alpha.2 || ^0.1.7-alpha.2',
    ...(hasModelTools ? { '@deepseek-ai/dsh-tools': '^0.1.5-rc.1 || ^0.1.6-alpha.2 || ^0.1.7-alpha.2' } : {}),
    ...(bundleId === 'flow' ? {
      '@deepseek-ai/dsh-client-ui-primitives': '^0.1.5-rc.1 || ^0.1.6-alpha.2 || ^0.1.7-alpha.2',
      'dsh-better-sidebar': '>=0.19.0',
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
