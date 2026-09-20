// ===== 原生 DSH Host 功能子入口 =====
// 仅供拆分组件的静态工具箱使用：每个 Loader 行拥有独立 Fiber，停用即卸载对应工具。

export const renderNativeFeatureHost = ({
  packageName, profile, feature, runtimeSource, sharedHostSource, bridgeMethods, hasModelTools,
}) => {
  const id = feature.key.replace(/[^A-Za-z0-9_$]/g, '_')
  const inject = [...new Set([
    ...(feature.inject || []),
    profile.registryService,
    ...(bridgeMethods.length ? [profile.bridgeService] : []),
    ...(hasModelTools ? ['tools'] : []),
  ])]
  return `// ===== ${profile.displayName} · ${feature.key} 原生静态 Host 组件（构建生成，勿手改） =====
${hasModelTools ? "import { defineTool } from '@deepseek-ai/dsh-tools'" : ''}

export const name = ${JSON.stringify(packageName + '/feature/' + feature.key)}
export const inject = ${JSON.stringify(inject)}

const TOOLBOX_RUNTIME_OVERRIDES = ${JSON.stringify(profile, null, 2)}
${runtimeSource}
${sharedHostSource}

let applyingContext = null
const harness = {
  handle(name, handler) {
    const bridge = applyingContext && applyingContext.get(TOOLBOX_RUNTIME.bridgeService)
    if (!bridge || typeof bridge.register !== 'function') throw new Error('静态工具箱 Bridge 服务不可用')
    return bridge.register(name, handler)
  },
  ${hasModelTools ? `defineTool,
  registerTool(ctx, tool) {
    const service = ctx.get('tools')
    if (!service || typeof service.register !== 'function') throw new Error('tools 服务不可用')
    const dispose = service.register(tool)
    if (typeof dispose === 'function') ctx.effect(() => dispose)
    return dispose
  },` : `defineTool(tool) { return tool },
  registerTool() { throw new Error('当前静态组件未启用模型工具服务') },`}
}

const create_${id} = () => {
${feature.source}
}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_${id}()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: ${feature.key}')
  } finally {
    applyingContext = null
  }
}
`
}
