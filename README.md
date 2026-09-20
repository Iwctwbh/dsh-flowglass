# Flowglass（流镜 · `dsh-flowglass`）

> DeepSeek Harness 的实时会话流程图插件：把用户、助手、工具调用、并行任务和子代理绘制成可钻取的执行流。

![Flowglass：实时流镜、三列泳道、并行分支](docs/screenshot.png)

Flowglass 是本仓库的默认产品和默认构建目标，当前版本 `0.6.1`。它是原生静态 Host/Client 插件，不使用 `dynamicCordisRunner`，也不产生 `dyn/*`。

<details>
<summary>界面预览（1920×1080）</summary>

### 流镜

![流镜主视图](docs/screenshots/flowglass-flow-1920x1080.png)

### 大流镜：远观 / 全景 · 简略

![大流镜远观简略视图](docs/screenshots/flowglass-large-remote-simple-1920x1080.png)

### 插件详情设置

![Flowglass 插件设置](docs/screenshots/flowglass-settings-1920x1080.png)

</details>

## 安装

要求 DeepSeek Harness `0.1.5-rc.1` 或更高；推荐使用 `0.1.6-alpha.2` 及以上版本。

### 方式一：Harness 插件管理器（推荐）

打开 Harness Web 侧栏的「插件」→「添加插件」，输入以下任一项：

| 输入 | 示例 |
| --- | --- |
| npm 包名 | `dsh-flowglass@0.6.1` |
| GitHub 仓库地址 | `https://github.com/Iwctwbh/dsh-flowglass` |
| 本地插件目录 | `C:\work\dsh-flowglass` |
| 本地 tarball | `C:\work\dsh-flowglass-0.6.1.tgz` |

点击「安装」，安装完成后选择「启用」。插件管理器会先读取包的名称、版本和说明，再执行安装；本地插件代码会以当前用户权限运行，请只安装可信来源。

### 方式二：命令行

```powershell
# npm，推荐固定版本
dsh plugin --profile web add dsh-flowglass@0.6.1

# GitHub，建议固定 tag 或 commit
dsh plugin --profile web add github:Iwctwbh/dsh-flowglass#v0.6.1

# 本地目录或 tarball
dsh plugin --profile web add C:\work\dsh-flowglass
dsh plugin --profile web add C:\work\dsh-flowglass-0.6.1.tgz
```

升级或卸载：

```powershell
dsh plugin --profile web add dsh-flowglass@0.6.1
dsh plugin --profile web remove dsh-flowglass
```

安装后重启 Harness；如已安装 `dsh-better-sidebar`，它会作为原生右侧栏不可用时的兼容后备，不是 Flowglass 的必需依赖。

## 能力概览

### 流镜

- 三列泳道：用户/助手主干居中，工具调用从右侧发出、从左侧返回。
- 实时显示助手生成、工具调用、并行分组和子代理分支。
- 点击消息或工具卡查看完整内容、参数、结果、模型和 token 信息。
- 支持子代理逐层钻取、面包屑返回、分支续跑和 Harness Session 联动。
- 默认使用 Harness 官方 Markdown renderer；页面不可见时暂停刷新，返回后继续。
- 支持声明式工具显示规则：Git、GitHub CLI、pnpm、npm、DSH、Python 默认随包提供。

### 大流镜

- 用「全景 / 近观」切换并发任务和单 Session 视角。
- 支持 2/3/4 分支、精简/详细/导图视图。
- 保存拓扑历史和分支轮次，不覆盖旧历史，可表达 `1→2→1→2` 等并发演进。
- 导图按「会话竖列 × 历史轮次」展示分叉、沿用和跨轮关系；节点可拖动、画布可平移。
- 支持添加/移除并发成员、从任意回答节点发起新的 `1→N` 任务。

### 官方插件设置

在 Harness 侧栏「插件」中打开 `flowglass` 详情页，可配置：

- 界面语言切换（简体中文 / English）；
- 切换 Session 时是否保持流镜展开；
- 是否启用大流镜；
- 默认分支数量；
- 大流镜默认视图；
- 轮询刷新间隔；
- 工具显示规则的启停、编辑、删除和恢复。

设置通过 Harness 官方 `plugins.bundle.config` 扩展点提供，仅保存于当前浏览器，不写入 Git、Session 日志或 npm 包。

## 承载与降级

Flowglass 按以下顺序选择承载面，同一时刻只启用一条路径：

1. Harness 原生右侧栏（DSH 0.1.5+）；
2. `dsh-better-sidebar >=0.19.0` 的原生桥；
3. Flowglass 自带的固定右侧兜底面板。

无需手动选择承载方式，插件会自动适配当前 Harness 能力。

## 本地开发与验证

### 构建静态 Flowglass

```powershell
node make-payloads.mjs
node scripts/build-toolbox-bundle.mjs --flow --version 0.6.1 --clean
node scripts/verify-generated.mjs
node scripts/verify-bundle.mjs dist/toolbox-bundles/flow --pack
node smoke.mjs
```

构建产物位于 `dist/toolbox-bundles/flow/`；如需回填仓库内的默认产品目录：

```powershell
Copy-Item dist/toolbox-bundles/flow/* flowglass/ -Recurse -Force
```

### 最新 Harness 联调

在最新 Harness 源码 checkout 中：

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web --no-open --port 3080
```

另开终端构建并安装本地 Flowglass：

```powershell
node scripts/build-toolbox-bundle.mjs --flow --version 0.6.1 --clean
node scripts/verify-bundle.mjs dist/toolbox-bundles/flow --pack
Push-Location dist/toolbox-bundles/flow
$flowglassPackage = npm pack
Pop-Location
dsh plugin --profile web add <flowglassPackage>
```

截图验收建议使用 1920×1080，分别检查流镜、大流镜和「插件 → flowglass」设置页。

## 动态 Toolbox（可选）

本仓库也提供独立的完整工具箱 `dsh-dynamic-toolbox`，包含 Jira、Git、文件、HTTP、AI 助手等工具。它不是 Flowglass 的运行前置：

```powershell
dsh plugin --profile web add dsh-dynamic-toolbox
```

相关文档：[`dynamic-toolbox/README.md`](dynamic-toolbox/README.md)、[`REBUILD.md`](REBUILD.md)、[`PLUGIN-DEV.md`](PLUGIN-DEV.md)。

## License

[MIT](LICENSE) © 2026 Iwctwbh
