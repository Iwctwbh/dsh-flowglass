# Flowglass（流镜 · `dsh-flowglass`）

> DeepSeek Harness 的实时会话流程图插件。把当前会话画成三列泳道，展示工具调用、并行分组与子代理分支，并支持逐层钻取。
>
> A live session flowgraph for DeepSeek Harness. MIT License.

![实时流镜 · 三列泳道 · 子代理分支 · 并行分组](docs/screenshot.png)

## 流镜能做什么

- **三列泳道**：中列是用户与助手主干，工具调用从右侧发出、从左侧返回。
- **子代理分支**：子会话在触发步骤旁展开自己的分支和执行进度。
- **逐层钻取**：进入任意子代理会话，并通过面包屑逐级返回。
- **并行分组**：同一步中的并行调用集中显示，运行中的节点持续高亮。
- **完整详情**：点击消息或工具卡查看完整内容、参数、结果、模型和 token 信息。
- **Markdown 助手详情**：默认使用 Harness 官方 Markdown renderer 展示表格、代码块、列表和数学公式；点击预览图标可切回原始文本，复制始终保留原始 Markdown，无 renderer 的动态 Toolbox 保持纯文本。
- **详情侧栏可调宽**：左缘拖拽或外观设置「详情宽度」滑杆，自动记忆；助手消息详情头部带与卡片同款的分支按钮。
- **一键复制**：详情各内容框标题行「复制」按钮，直接写系统剪贴板。
- **实时刷新**：默认每 2 秒静默刷新；DSH 0.1.5+ 上额外订阅 Harness 原生会话事件窗，模型生成期间按事件即时刷新（不必等轮询）；页面/Tab 不可见时暂停，回到页面后继续。
- **生成过程可见**（DSH 0.1.5+）：模型流式输出实时增长；成功、失败、取消、重试与中断都以确定的结算态展示（真实错误码、重试链、max-tokens 截断标记），刷新或重连后与历史视图一致，不产生重复卡片。

## 安装

要求 DeepSeek Harness `0.1.5-rc.1` 或更高（`dsh --version` 查看）。

```powershell
dsh plugin --profile web add dsh-flowglass
```

升级到指定版本后重启 DSH：

```powershell
dsh plugin --profile web add dsh-flowglass@<新版本>
```

卸载：

```powershell
dsh plugin --profile web remove dsh-flowglass
```

`dsh-flowglass` 是本仓库的默认产品和默认构建目标。它是原生静态 Host/Client 插件，不使用 `dynamicCordisRunner`，也不产生 `dyn/*`。

## 右侧栏承载与降级

流镜的承载面按以下优先级自动选择（同一时刻只有一条注册路径生效）：

1. **Harness 原生右侧栏**（DSH 0.1.5+）：注册原生 page type `dsh-flowglass:flow`（definition id `dsh-flowglass/native`），出现在右侧栏 guide 的「流镜」入口；从流镜自有入口点击会 `openTab` 自动展开并聚焦。原生 Tab 按会话隔离（`props.sessionId` 是权威来源），Tab 不可见时自动暂停刷新。
2. **dsh-better-sidebar 原生桥**（可选依赖 `>=0.19.0`）：原生右侧栏不可用时，若安装了 better-sidebar，则注册其「流镜」Tab。
3. **固定右侧兜底面板**：以上都不可用、注册失败或被禁用时，保留自带入口，以覆盖方式固定在右侧，不挤压主会话，也不支持拖拽悬浮。

承载方式不再需要手动选择，始终按上述优先级自动适配；历史版本保存的 `drawer` 显示偏好会被忽略。

```powershell
dsh plugin --profile web add dsh-better-sidebar   # 可选；仅在原生右侧栏不可用时需要
dsh plugin --profile web add dsh-flowglass
```

## 默认构建 Flowglass

不传功能参数，或显式传入 `--flow`，都会构建 `dsh-flowglass`：

```powershell
node scripts/build-toolbox-bundle.mjs --version 0.5.0 --clean
# 等价：node scripts/build-toolbox-bundle.mjs --flow --version 0.5.0 --clean

node scripts/verify-bundle.mjs dist/toolbox-bundles/flow --pack
Push-Location dist/toolbox-bundles/flow
npm pack
Pop-Location
```

默认输出目录为 `dist/toolbox-bundles/flow/`，默认 npm 包名为 `dsh-flowglass`。只有构建其他功能组合时，才使用 `dsh-<bundleId>-toolbox` 命名；仍可通过 `--name` 显式覆盖。构建产物回填到 [`flowglass/`](flowglass/)（`Copy-Item dist/toolbox-bundles/flow/* flowglass/ -Recurse -Force`）。

## 开发与验证

```powershell
node make-payloads.mjs            # 动态桩/清单再生成（改 catalog 后）
node scripts/verify-generated.mjs # 生成物漂移检查
node scripts/verify-bundle.mjs flowglass --pack
node smoke.mjs                    # 全部契约冒烟（含 0.1.5-rc.2 真实组合，见下）
```

真实组合冒烟（`smoke/sim-rc2-composition.cjs`）装载真实 cordis/host-runner 走 define→批准→invoke→teardown 全链路，并核对 0.1.5 原生右侧栏/事件窗/better-sidebar 0.19.1 的发行包契约。它需要一个 0.1.5-rc.2 安装树（按优先级：`DSH_INSTALL_ROOT` → 仓库 `.scratch/dsh-rc2-composition/` → 全局）：

```powershell
New-Item -ItemType Directory -Force .scratch\dsh-rc2-composition | Out-Null
Push-Location .scratch\dsh-rc2-composition
npm init -y
npm install @deepseek-ai/dsh@0.1.5-rc.2 dsh-better-sidebar@0.19.1
Pop-Location
```

Flowglass 的静态产物位于 [`flowglass/`](flowglass/)，核心功能实现位于 [`plugins/flow/`](plugins/flow/)，共享界面框架位于 [`plugins/toolbox/`](plugins/toolbox/)。内部保留 `toolboxRegistry`、`toolbox.*` RPC 与 `.dsh-dynamic-toolbox/` 数据路径，以兼容现有框架和历史数据；这些内部名称不改变默认安装入口。

---

## 可选：完整 Toolbox

本仓库也能构建包含全部工具的次级产品 `dsh-dynamic-toolbox`；它与默认的 `dsh-flowglass` 相互独立。只有确实需要 Jira、Git、文件、HTTP、AI 助手等整套工具时才安装：

```powershell
dsh plugin --profile web add dsh-dynamic-toolbox
```

工具箱的重建、开发和历史说明单独维护：

- [`dynamic-toolbox/README.md`](dynamic-toolbox/README.md) — 工具箱包
- [`REBUILD.md`](REBUILD.md) — 动态工具箱重建与自举
- [`PLUGIN-DEV.md`](PLUGIN-DEV.md) — 工具箱插件开发
- [`插件.md`](插件.md) — 动态插件架构与经验记录

## License

[MIT](LICENSE) © 2026 Iwctwbh
