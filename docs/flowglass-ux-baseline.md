# Flowglass UX 实施基线与兼容验证

记录日期：2026-09-20。本文区分已测结果与尚未取得的运行实例证据；不能据离线 fixture 的毫秒数宣称生产性能目标已经达到。

## 环境与证据范围

| 项目 | 本次记录 |
| --- | --- |
| 改造前 Flowglass | `bc919f70b6be7ca8509f4440c1748e3c4d13eb76`，package `0.6.1` |
| Harness 参考源码 | `ddefc45fbc7f8e46dd73185e68295696d1297887`，package `0.1.6-alpha.2` |
| 测试 Node | `v24.14.0` |
| 浏览器 | Playwright `1.63.0` / Chromium `153.0.8010.12` |
| 已有测试依赖 | `.scratch/dsh-rc2-composition/node_modules`，没有本轮安装依赖 |
| 实际 3080 | 只读 HTTP 探测返回 `401`；没有可复用的已认证浏览器标签。未确认其安装来源、实际 Harness build 或插件版本 |
| 真实协议内核测试 | 已安装 `0.1.5-rc.2` 的 Cordis / Host runner / Remote codec；不等同于当前 alpha.2 页面验收 |
| 用户实例操作 | 未重启、降级、安装、发送消息或改动 3080 |

所有浏览器数据均为 `smoke/fixtures/flowglass-ux.mjs` 中生成的虚构会话，不读取用户日志。Host 来自 `shared/runtime.js + shared/host.js + plugins/flow/tool.js`，样式来自真实 `toolboxCss`，外围仅模拟宿主尺寸与主题 token。基线模式从 Git ref 读取同一组产品源码，避免把新样式误当成旧版。报告记录时间、源码 SHA-256、环境和限制。

截图和 JSON 结果放在已忽略的 `.scratch/ux-baseline`、`.scratch/ux-current`；不将机器路径、真实日志或二进制截图写入发布包。

## 可重复的浏览器门禁

在仓库根执行：

```powershell
node scripts/test-flowglass-ux.mjs --baseline-ref bc919f70b6be7ca8509f4440c1748e3c4d13eb76
node scripts/test-flowglass-ux.mjs
node scripts/test-flowglass-stable.mjs
node scripts/test-flowglass-map.mjs
node scripts/test-flowglass-drawer.mjs
node scripts/test-toolbox-compat.mjs
node scripts/test-toolbox-style-compat.mjs
```

Playwright 解析顺序为 `PLAYWRIGHT_MODULE_PATH`、当前项目依赖、已有 `.scratch/dsh-rc2-composition`、`.scratch/pw-test`。改变 cwd 不再被当成解决 ESM 依赖解析的方法。没有依赖时明确报错，不自动下载浏览器或安装 npm 包。

| 门禁 | 已验证内容 | 边界 |
| --- | --- | --- |
| `test-flowglass-ux` | 12 场景 × 7 尺寸 × 深浅主题/14px/20px/降低动效，共 336 布局；360/480/720/960px 高 900px，1280×720、1440×900、1920×1080；普通流无水平滚动、卡片键盘语义、默认折叠上下文、历史 60 节点窗口 | 实际 Host HTML + CSS；不挂载完整 Drawer 或官方 Markdown |
| `test-flowglass-stable` | 13 项：真实 React 组件在 HTML 更新时保留 textarea 身份、焦点、选择；合成 IME 事件；工作区/会话草稿隔离；页面重载从 localStorage 恢复；详情选中文字与非零滚动位置；20 次重挂后节点数与 selection 监听清理 | 浏览器运行实际 `flow-stable.js`，不是操作系统输入法或真实服务器推流 |
| `test-flowglass-map` | 实际 Host 4 分支历史图及真实 Client graph effect；360/720/1440px 适应画布、缩放、键盘选择/移动、重置、HTML 更新后恢复 | 独立 effect 与真实 DOM；不代表整个 Harness 生命周期 |
| `test-flowglass-drawer` | 完整组装后的真实 React Client 从注册的 `shell.overlay` 挂载，24 项检查标记/查找/详情刷新/隐藏恢复、默认导出脱敏与 Blob 一致、两分支来源预览与准确追加草稿、360/480/960px 面板内工作台、详情/工作台焦点约束、关注过滤、回放与概览顶部对齐；不调用 prompt/create/fork | RPC 为 synthetic Host；草稿与宿主服务为 mock，不等同于真实原生 tab shell |
| `test-toolbox-style-compat` | 实际 flowedit 与 Flow 同页，360/720/1440px × 深浅主题 × 动态全局/编译 scope，共 12 组；flowedit 每个元素几何与所有非自定义 computed CSS 与 HEAD 基线一致 | 保留 flowedit 既有行为；不把旧布局问题误算为本次回归 |
| `test-toolbox-compat` | 全 catalog 显式构建；真实通用 `collectFields/onPanelClick` + calc/HTTP Host，输入/提交、异步结果、详情切换不重发请求；普通工具继续 HTML 路径 | RPC 传输与工作区状态容器为 mock，外部 HTTP 请求数为 0 |

空态、正常、工具运行、工具/生成失败、等待重试、子代理、1200 事件历史、并发概览、对比、关系图、详情及 Composer 均有 fixture。关系图与用户选择的宽对比允许平移；普通时间流不以整体缩放来掩盖溢出。

当前矩阵尚不含真实官方 Markdown 文件提及/图片和全部版本的实际页面；这些仍属于发布环境验收。

## 已测基线

以下为 360px 面板、深色、14px 字号的阶段内快照。面板两侧内边距后正文可用宽度为 344px。Host 每场景采样 25 次，按排序第 24 个样本取 P95；日志服务来自内存，包含暖缓存。载荷是 fixture 返回对象序列化的 UTF-8 字节数，包含测试用事件计数字段，不能当成实际网络 RPC 字节数。

| 场景 | 改造前正文 client/scroll px | 改造后正文 client/scroll px | 前/后 DOM 元素 | 前/后序列化字节 | 前/后 Host P95 ms |
| --- | --- | --- | --- | --- | --- |
| 正常 | 344 / 560 | 344 / 344 | 115 / 161 | 9836 / 14605 | 0.58 / 0.90 |
| 工具运行 | 344 / 560 | 344 / 344 | 64 / 107 | 6512 / 10251 | 0.32 / 0.52 |
| 失败 | 344 / 560 | 344 / 344 | 68 / 114 | 6722 / 10665 | 0.74 / 0.47 |
| 1200 事件历史 | 344 / 560 | 344 / 344 | 1033 / 1076 | 67274 / 91170 | 7.42 / 7.96 |
| 并发概览 | 344 / 344 | 344 / 344 | 101 / 111 | 11168 / 10906 | 0.98 / 1.65 |
| 工具详情 | 344 / 560 | 344 / 344 | 137 / 191 | 15576 / 21112 | 0.90 / 1.63 |

普通流在窄容器的 216px 横向溢出得到消除；长历史仍只渲染 60 个可选节点。新控制与语义结构增加了 DOM 和载荷，不能宣称整体更快。上述单次运行的亚毫秒差异受机器负载影响；继续改动时应重新生成报告，不以此表作为最终性能承诺。

尚未测得：实际网络延迟、live revision→DOM 提交 P95、真实刷新提交次数、加载历史锚点偏移及长时间并发生成下的官方 renderer 成本。测试组件的选择/滚动保持不等于已证明全部真实运行目标。

## 第 11.6 节 Toolbox 发布门禁

| 形态 | 本轮验证方式 | Flow 增强与降级 |
| --- | --- | --- |
| 独立 `dsh-flowglass` | 原生静态 Host/Client/Remote 构建及 `sim-static-native-bundle`；离线 Flow 布局、稳定组件、图行为 | 原生 Flow 默认增强；官方 Markdown / UI primitives 由该静态模板声明依赖 |
| `dsh-dynamic-toolbox` 发布包 | 显式请求 19 个可选 catalog 功能，生成 19 条 Host 组件行；临时产物 `.scratch/ux-toolbox-compat`；`verify-bundle --pack` 通过 | 内嵌 flow 复用 Host、稳定组件、搜索/筛选/回放与图；官方 Markdown 注入为 null 时保留原文，不要求独立 Flowglass 注入 |
| 源码动态 Toolbox | `sim-source-assembly` 执行生成的 Client 源码 RPC 并断言与规范组装逐字相同；loader Timer 清理与真实 rc.2 内核仿真 | 普通工具继续通用 HTML 动作协议；Flow 专属模块是普通 JS prelude，不引入 ESM 动态执行或新的批准步骤 |

三形态仍依赖原有宿主服务能力；没有 Session 日志服务时不能提供完整数据，不能把空内容当成成功读取。跨会话导航和草稿写入沿用原有能力检测。服务兼容事实应以测试和错误提示为准。

`sim-toolbox-host` 覆盖注册表、多工作区路由、独立启停与归属；`sim-toolbox-client` 覆盖 Toolbox 单独启用、原生侧栏/降级与卸载；`sim-compiled-namespace` 覆盖两个 bundle 同页的 RPC、DOM、样式、事件与 storage 隔离；`sim-host-stop-degrade`、`sim-client-loader-stub` 覆盖停止和计时器释放。`sim-calc`、`sim-flowedit`、`sim-http` 继续覆盖工具自身行为，不以 Flow 截图替代普通工具测试。

完整执行：

```powershell
node smoke.mjs
node scripts/test-toolbox-compat.mjs
$env:npm_config_cache = Join-Path (Get-Location).Path '.scratch/npm-cache'
node scripts/verify-bundle.mjs .scratch/ux-toolbox-compat --pack
```

`--pack` 只检查本地打包清单，不发布。指定仓库内临时 npm cache 是因为沙箱不能写入用户级 npm cache，不改变 npm 全局配置。

本轮 `node smoke.mjs` 已完成 26/26 套件；最终 `sim-flow` 208 项（含 11 项投影缓存失效测试）、发送恢复 10 项、`sim-toolbox-client` 119 项、真实 rc.2 组合 34 项通过。期间发现并修复了临时 non-enumerable bookmarks 字段进入 Remote state 的 lossless JSON 回归；严格 wire 校验继续保留。

最终有界缓存加入后的完整布局复测报告为 `.scratch/ux-final/report.json`，仍为 336 / 336 通过，并记录最终源码哈希。上表保留缓存加入前的阶段快照；最终长历史整条 Host 渲染 P95 为 8.04ms（25 次样本，包含首轮冷读取，其他测试同时运行），不能与单独预热后测量的投影缓存微基准直接比较。缓存局部实验及失效边界见 [实施记录](flowglass-ux-implementation.md)。

也尝试了新的隔离 `DSH_HOME=.scratch/ux-web-home`、`ux-validation` profile 的 CLI 初始化/帮助。CLI 建立测试 profile 后提示现有 SOCKS 代理不受支持，持续没有帮助或 ready 输出，已中断该进程。未因此声称真实 Web 页面通过；旧用户 profile、3080 与认证配置均未修改。`scripts/web-smoke.mjs` 已更新为相同的显式 Playwright 解析方式和 `data-flow-scope/data-autorefresh` 稳定钩子，等待可用的独立已认证实例时即可运行。

## 源码组装与后续测量

`build/source-assembly.mjs` 是 Client 文件顺序的唯一入口：`flow-launch.js` → `flow-stable.js` → `client.js`。静态构建、动态 Client RPC、无 Host 的内联路径共用这一入口；helpers 无 runtime ESM imports，`loader.js` 继续普通脚本拼接。构建来源哈希包括所有 helper。新增 `sim-source-assembly` 防止仅更新静态链路而遗漏动态加载。

稳定交互与发送状态机已按职责拆出；全画布 keyed React、投影缓存重做、窗口化等继续由实测瓶颈决定。未为了达到拆文件数量目标改动 Session 格式或另建日志层。
