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
- **完整详情**：点击消息或工具卡查看完整内容、参数、结果、模型和 token 信息；`skill` 调用卡直接显示实际技能名，详情按技能名称、基础目录、资源说明和 Markdown 使用说明分区展示，原始 XML 保留在折叠区。
- **大流镜 Zoom（拓扑历史）**：每条记录是一条带继承前缀的并发拓扑历史，内部按“初始 → 第 1 轮 → 第 2 轮…”保存源 Session 集合和输出 Session 集合；从旧轮继续会复制此前轮次前缀并创建新的历史分支，原历史不被覆盖，因此可表达 `1→2→1→2`、`1→2→2→2` 等不同总体形态。右侧历史树的折叠行只显示任务摘要与拓扑，展开后再按“轮次 → 对话”展示导航明细。
- **本次并发归属**：切换 Harness 会话或进入“大流镜视角”时，以当前选中会话为锚点，选择包含该会话（含作为后续轮次来源）的最近活跃历史，并展示该历史的最新一轮；顶部摘要只显示任务、拓扑、轮次和对话数，不暴露内部的“大流镜 A/B/C”编号。
- **大流镜包含流镜**：大流镜是并发任务的容器，顶部以“全景 / 近观”开关改变观察尺度，而不是用“进入 / 返回”导航页面。全景查看所选并发的全部分支；从全景点入分支会自然放大到近观，并用原单会话流镜的完整时间顺序与纵向流程铺满画布。在近观中切换分支或 Harness Session 会保持近观；外部切换 Session 也不会擅自改变当前观察模式。过渡只在主动缩放时播放，实时刷新不会反复动画。
- **分支续跑**：全景支持“精简 / 详细 / 导图”三种视图；路径、目标 Session 与输入框统一在顶部发送区展示，不再另占一条“当前并发/并发路径”成员行。全景发送是 N→N，按钮明确写成“发送到当前 N 个会话”；近观发送才是从当前单 Session 发起 1→N。绑定分支组时成员关系优先，旧轮来源关系不会把全景劫持到新建输出 Session。
- **导图与轮次操作**：导图是按「会话竖列 × 历史轮次」展开的整棵分支树：根任务位于顶部，第 1/2/3…轮依次向下，每条会话各占一条竖列（分叉的新会话插到来源列右侧）——同列竖线是沿用继续，跨列斜线是分叉，覆盖全部轮次而不只看最新一轮。节点可拖动、画布可平移；连接线自动吸附节点边缘，无遮挡时直接连线，只有穿过其他节点时才改用折线，节点移动后实时重新路由。任意回答节点都可直接“从这里发起 1→N”。
- **并发成员管理**：发送区的“添加其他 Session”复用“带入会话”式两级树（工作区文件夹 → Session），当前工作区默认展开；选择框锚定在触发按钮下方，空间不足时自动向上。同工作区非成员支持选择或拖入目标区，也可“新建并加入”，全程不切换 Harness 当前会话。左侧会话行的三点菜单会在存在当前并发组时追加“加入当前并发分支”，已加入、跨工作区或组已满时给出对应禁用状态。
- **对比显示**：精简与详细模式都采用居中的 Git diff 网格；详细模式无子代理时为“助手 → skill/工具”双泳道，有子代理时扩为三泳道。
- **并发命名**：开工会话自动命名为“任务 · 分支 i/N · 模型”，在 Harness 侧栏和大流镜中都能直接看出批次方向。
- **差异语义**：整体“流程一致/有差异”以输入、工具调用结构和涉及文件集合为准；回答结果文本单独显示“结果 同/异”并着色，不因措辞天然不同就把流程判错，不同文件仍会明确判为差异。
- **开工台（多代理并发开工 + 模型分支）**：采用接近 Harness 输入框的两层 composer——上方输入任务，下方放模型/思考强度、明确的 2/3/4 并发数量和发送按钮；旧会话从当前完成轮次分叉，新会话同时继承当前选中 Session 的 `workspaceId`（无工作区归属时才回退 `cwd`），并在开工后自动进入第一个分支。
- **会话互通**：分支头卡的「⇪」把该会话的最新助手结论暂存为带入内容，点选目标分支后一键「带入草稿」（沿用带入会话机制，追加到输入区）或「直接发送」（ISession.prompt 排队执行，运行中的会话收到后继续推进）；开工台输入内容时自动暂停刷新，模型分支选择经 Host state 回写、重渲染不丢。
- **官方插件详情设置**：在 Harness 侧栏打开「插件」并进入 `flowglass`，通过官方 `plugins.bundle.config` 页面集中配置 Session 切换保持展开、大流镜开关、默认分支数量、默认视图、轮询间隔与工具显示规则；表单控件复用 Harness UI primitives。
- **声明式显示规则**：首次使用默认提供 Git、GitHub CLI、pnpm、npm、DSH、Python 六条规则；默认规则与自定义规则一样均可编辑、启停或删除。规则按原始工具名、命令中的可执行文件 basename 与允许的子命令匹配，仅改变显示并保存在当前浏览器。
- **Markdown 助手详情**：默认使用 Harness 官方 Markdown renderer 展示表格、代码块、列表和数学公式；点击预览图标可切回原始文本，复制始终保留原始 Markdown，无 renderer 的动态 Toolbox 保持纯文本。
- **详情侧栏可调宽**：左缘拖拽或外观设置「详情宽度」滑杆，自动记忆；助手消息详情头部带与卡片同款的分支按钮。
- **一键复制**：详情各内容框标题行「复制」按钮，直接写系统剪贴板。
- **实时刷新**：默认每 2 秒静默刷新；DSH 0.1.5+ 上额外订阅 Harness 原生会话事件窗，模型生成期间按事件即时刷新（不必等轮询）；页面/Tab 不可见时暂停，回到页面后继续。
- **生成过程可见**（DSH 0.1.5+）：模型流式输出实时增长；成功、失败、取消、重试与中断都以确定的结算态展示（真实错误码、重试链、max-tokens 截断标记），刷新或重连后与历史视图一致，不产生重复卡片。

### 插件详情设置与工具显示规则

Flowglass 使用 Harness 官方 `plugins.bundle.config` 扩展点：侧栏「插件」→ `flowglass` 的详情页直接承载配置表单，插件管理页负责导航、标题与生命周期，Flowglass 不修改 Harness，也不创建另一套插件管理页面。设置先在表单中暂存，点击“保存设置”后写入当前浏览器，并立即刷新已打开的流镜。

详情页可配置切换 Session 时是否保持流镜展开、是否启用大流镜、默认 2/3/4 分支、默认精简/详细/导图视图、轮询刷新间隔，以及完整的工具显示规则。显示规则首次使用会加入 Git、GitHub CLI（`gh`）、pnpm、npm、DSH、Python 六条普通规则。默认规则和后来添加的自定义规则使用完全相同的交互；删除后的默认规则不会在刷新后自动补回，即使清空全部，空列表也会持久化。规则按顺序匹配并采用第一条命中项。

`tools` 匹配日志中的原始工具名；`executables` 按命令 token 的 basename 匹配，不依赖机器上的绝对路径；`actions` 为空时接受任意紧随其后的子命令；`displayName` 为空时不添加名称，卡片只保留匹配到的子命令；`badge` 为空时不渲染徽章。格式错误的规则会被拒绝，未匹配调用继续显示原始工具名。

```json
[
  {
    "enabled": true,
    "tools": ["pwsh"],
    "executables": ["engram-memory.ps1"],
    "displayName": "engram-lattice",
    "actions": ["search", "recall", "memory"],
    "badge": "记忆",
    "color": "#81c784"
  }
]
```

该示例把匹配的卡片显示为 `engram-lattice search`、`engram-lattice recall` 或 `engram-lattice memory`。完整输入、输出以及会话日志中的 `pwsh` 工具名均保持不变。规则存储在浏览器 `localStorage` 中，设置面板打开时会暂停自动刷新，避免覆盖尚未保存的编辑内容。

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
