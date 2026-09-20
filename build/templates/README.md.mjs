// ===== build/templates/README.md.mjs：生成包说明模板 =====
export const renderReadme = ({ packageName, version, bundleId, displayName, featureLines, isFlowglass }) => {
  const positioning = isFlowglass
    ? '这是 dsh-flowglass 仓库的默认产品与默认构建目标，是 **DSH 原生静态 Host/Client 插件**。'
    : '这是 dsh-flowglass 仓库提供的**可选工具箱产品**，与默认的流镜包独立。只需要会话流程图时，请安装 `dsh-flowglass`；只有需要下列整套工具时才安装本包。\n\n本包是 DSH 原生静态 Host/Client 插件。'
  const flowglassPresentation = isFlowglass
    ? '\n- 流镜顶部“显示规则”首次提供 Git、GitHub CLI、pnpm、npm、DSH、Python 六条默认规则；默认和自定义规则都支持启停、删除和单条编辑，并保留可折叠 JSON 源码。规则仅保存在浏览器并且不修改 Session 日志。\n'
    : ''
  return `# ${displayName}（${packageName}）

${positioning}

- bundleId: \`${bundleId}\`
- 版本: ${version}
- 动态批准: **不需要**（不使用 dynamicCordisRunner，不产生 dyn/*）
- 功能:
${featureLines}
${flowglassPresentation}

## 安装 / 升级 / 卸载

\`\`\`powershell
npm pack
dsh plugin --profile web add <tgz>
# 或已发布于 npm registry 时直接在线安装：
dsh plugin --profile web add ${packageName}
# 重启 DSH 后由原生 Loader 直接挂载 Host 与 Client
dsh plugin --profile web remove ${packageName}
\`\`\`

升级时提高版本、重新构建发布，然后对新版本再执行 add 并重启 DSH。

## 运行结构

- \`lib/index.js\`：原生 Host 插件；
- \`lib/client.js\`：通过 package.json 的 \`dsh.client\` 和 \`exports["./client"]\` 原生加载；
- \`lib/remote.js\`：Host/Client Remote 描述；
- 不读取源码仓库的 loader.js / plugins.json / payload.json；
- 不调用 dynamicCordisRunner；
- 业务数据仍按工具约定写当前工作区的 \`.dsh-dynamic-toolbox/\`。
`
}
