# Flowglass 对 DSH 0.1.5-rc.1 与 Better Sidebar 的适配计划

> 日期：2026-09-10  
> 目标基线：`@deepseek-ai/dsh@0.1.5-rc.1`、`dsh-better-sidebar@0.19.x`  
> 范围：Flowglass 原生静态包、完整 Dynamic Toolbox 包、Better Sidebar 可选集成及对应生成与验证链路。

## 1. 背景与现状

当前仓库版本为 `0.4.5`，主要实现仍以 DSH 0.1.2 的事件与组合方式为基线。虽然大部分模拟冒烟仍能通过，但它们没有覆盖 DSH 0.1.5 的新助手流协议，也没有在最新 Harness 和 Better Sidebar 上完成真实挂载验证。

已确认的兼容问题如下：

| 优先级 | 问题 | 影响 |
| --- | --- | --- |
| P0 | `peerDependencies` 仍只覆盖 DSH 0.1.1/0.1.2 | 在 DSH 0.1.5-rc.1 安装树中产生 peer 冲突，无法声明当前组合受支持 |
| P0 | 流程解析仍依赖已删除的 `assistant/chunk` | 模型生成期间无法实时显示助手节点 |
| P0 | 未消费 `agent/assistant-stream` | 瞬时 start/chunk/end 帧不进入 Session 日志，现有日志轮询永远看不到它们 |
| P0 | 未解析 `assistant/attempt` | 失败、取消、流错误以及被重试的模型尝试从流镜中消失 |
| P0 | 缓存只以 Session 日志条数判断变化 | 实时帧到达但 `session.seq` 未变化时错误复用旧视图 |
| P1 | `single: true` 与 Better Sidebar 原生多 pane 语义不完全一致 | 不同 pane 中可能出现多个流镜页，需要明确产品行为 |
| P1 | Harness rc.1 已恢复 guide `description`，当前集成只有标题和图标 | 流镜入口无法展示第二行用途说明 |
| P1 | 真实组合冒烟锁死 `0.1.2-alpha.2` | 测试在版本门提前退出，不能证明最新组合可挂载 |
| P2 | 注释、测试名和说明仍混用 rc.2、alpha.2、alpha.4 | 容易把历史兼容分支误认为当前基线 |

## 2. 目标与非目标

### 2.1 目标

1. Flowglass 和 Dynamic Toolbox 的发布清单明确支持 DSH 0.1.5-rc.1。
2. 流镜同时正确处理实时助手帧与已落盘的最终/失败尝试记录。
3. 实时显示、刷新、重试、失败、中断以及会话切换行为具有确定的生命周期和有界内存占用。
4. Flowglass 在 Better Sidebar 存在时注册原生流镜页，不存在或集成不可用时保留独立抽屉能力。
5. 真实组合冒烟覆盖最新 Harness 的 Host、Remote、Client、Sidebar 和 teardown 路径。
6. 所有源文件、生成包、BUILDINFO 和验证结果保持一致。

### 2.2 非目标

- 不修改 deepseek-harness 源码。
- 不修改 Better Sidebar 的内部状态或原生面板实现；跨插件交互只使用其公开服务。
- 不在本轮重构工具箱整体 UI、插件管理器或其他非流镜工具。
- 不长期保留 0.1.2 与 0.1.5 两套完整实现；只在成本很低且有明确用户需求时保留旧读取兼容。

## 3. 适配设计

### 3.1 统一助手流折叠器

新增一个与 UI 无关的助手流折叠逻辑，将三种输入归一成同一种视图记录：

| 输入 | 来源 | 处理方式 |
| --- | --- | --- |
| `agent/assistant-stream` | 进程内实时事件 | 按 `sessionId + attemptId` 接收 start/chunk/end，驱动实时卡片 |
| `assistant/message.stream` | Session 最终事件 | 重放精确 stream，生成成功或已中断的最终卡片 |
| `assistant/attempt.stream` | Session 日志事件 | 重放失败、取消、重试前失败等未形成 surface message 的尝试 |

折叠器至少输出：

- `turn`、`step`、`attemptId` 或可稳定推导的本地键；
- 文本与 reasoning 前缀；
- tool-call 迹象；
- start/end 时间和耗时；
- finish reason、failure code/message；
- `streaming`、`interrupted`、`failed`、`settled` 状态；
- usage 与 provider/model 信息（存在时）。

同一套逻辑必须供实时帧和持久事件使用，避免实时视图与刷新/重启后的历史视图不一致。

### 3.2 实时缓冲与生命周期

Host 侧维护进程内有界缓冲：

```text
sessionId
  -> attemptId
      -> { revision, frames, foldedSnapshot, updatedAt }
```

约束：

- start 创建 attempt；chunk 追加并递增 revision；end 结算。
- 收到对应 `assistant/message` 或 `assistant/attempt` 后，以持久事件为准并删除实时副本。
- agent 结束、会话释放或插件卸载时清理相关条目。
- 每个 attempt 限制帧数或总字符数；每个 session 限制 attempt 数，防止长会话常驻增长。
- 不把瞬时帧写回 Session 日志，不制造新的模型可见事件。
- 事件监听和清理必须挂到 Cordis 生命周期。

### 3.3 日志缓存与刷新

现有缓存命中条件从：

```text
sessionId + session.seq
```

调整为：

```text
sessionId + session.seq + liveRevision
```

面板返回的数据或内部快照应暴露足以驱动刷新判断的 revision。实时帧到达时，即使 Session 日志长度不变，也必须让下一次面板刷新得到新内容。

最终事件落盘后需要避免重复显示：实时 attempt 与同一 turn/step 的 `assistant/message` 或 `assistant/attempt` 只保留一个结算结果。

### 3.4 Better Sidebar 集成

继续通过 `ctx.inject(['betterSidebar'], ...)` 和 `service.registerTab()` 接入，不 value-import Better Sidebar 的实现代码。

需要补齐以下行为：

1. 在 Better Sidebar 恢复对应公开字段后，为流镜 descriptor 提供简短 `description`。
2. 明确单例策略：
   - 默认建议接受 Harness 的“目标 pane 内去重”，允许用户在多个 pane 同时观察不同上下文；
   - 若产品要求全局单例，则必须通过公开激活/打开能力聚焦现有页，不能读取 Sidebar 内部 store。
3. 仅在 Better Sidebar 服务与实际注册均成功时隐藏独立入口；注册失败或服务消失时恢复抽屉，避免出现无入口状态。
4. 保持 `props.scope.sessionId` 与 `props.scope.cwd` 为嵌入视图的权威会话信息。
5. 保持组件根节点 `width: 100%`、`height: 100%`、`min-height: 0`，适配 Harness 原生 tab body 的确定高度容器。

### 3.5 版本和清单

统一检查并更新三份发布清单：

- 根 `package.json`；
- `flowglass/package.json`；
- `dynamic-toolbox/package.json`。

版本策略：

- DSH 运行时包以 `0.1.5-rc.1` 为最低受测基线；
- `react` / `react-dom` 与 Harness 当前 18.3.1 安装树保持单实例兼容；
- Better Sidebar 继续作为 Flowglass 的 optional peer；
- 不新增不必要的 Host 运行时依赖；Client 使用的共享模块继续由 Harness 平台模块表提供。

## 4. 实施阶段

### 阶段 A：Harness 事件适配

- [ ] 在 `plugins/flow/tool.js` 中抽出统一 stream 折叠器。
- [ ] 支持 `assistant/message.stream`。
- [ ] 支持 `assistant/attempt.stream`。
- [ ] 增加 `agent/assistant-stream` 监听与有界缓冲。
- [ ] 将缓存键扩展为 `session.seq + liveRevision`。
- [ ] 处理实时记录与最终记录的去重和替换。
- [ ] 处理 error、aborted、interrupted、max-tokens 和无可见文本的 tool-call 流。

### 阶段 B：Better Sidebar 适配

- [ ] 为 Flowglass descriptor 补充可选 guide description。
- [ ] 决定并测试多 pane 下的单例语义。
- [ ] 将独立抽屉隐藏条件改为“集成注册成功且启用”。
- [ ] 验证 Sidebar 启停、HMR 和服务重新 provide 后不重复注册。
- [ ] 验证切换会话后嵌入面板使用正确 session/cwd。

### 阶段 C：清单和构建产物

- [ ] 更新三份 `package.json` 的 DSH peer 范围。
- [ ] 更新构建器模板或共享源，禁止直接手改 `flowglass/lib/*` 与 `dynamic-toolbox/lib/*`。
- [ ] 重新生成 Flowglass 与 Dynamic Toolbox bundle。
- [ ] 更新两份 `BUILDINFO.json` 的版本、fingerprint 和 source hash。
- [ ] 运行生成一致性与 bundle 完整性检查。

### 阶段 D：验证体系

- [ ] 为 stream 折叠器增加纯逻辑测试。
- [ ] 在 `smoke/sim-flow.cjs` 增加实时 start/chunk/end 用例。
- [ ] 增加 `assistant/message.stream` 重放用例。
- [ ] 增加 `assistant/attempt` 的 error、aborted、retry 用例。
- [ ] 增加实时缓冲结算、清理、容量上限和重复最终事件用例。
- [ ] 将旧 `sim-rc7-composition.cjs` 升级为 DSH 0.1.5-rc.1 真实组合冒烟。
- [ ] 增加 Better Sidebar 存在、缺失、晚到、移除和注册失败场景。
- [ ] 在真实 Web profile 中验证 Host Remote、Client bundle、原生流镜页和独立抽屉降级。

### 阶段 E：文档收口

- [ ] 更新 README 的支持版本和安装要求。
- [ ] 更新 REBUILD/PLUGIN-DEV 中的构建与验证命令。
- [ ] 清理 rc.2、alpha.2、alpha.4 等已过期的当前态描述；需要保留的内容明确标为历史兼容说明。
- [ ] 记录 Better Sidebar 最低版本、可选依赖和无 Sidebar 时的降级行为。

## 5. 文件改动矩阵

| 文件或目录 | 计划改动 |
| --- | --- |
| `plugins/flow/tool.js` | stream 折叠、attempt 解析、实时缓冲读取、缓存 revision、渲染状态 |
| `shared/host.js` | 如需跨 feature 复用，承载助手实时事件缓冲及生命周期；否则保持在 flow feature 内 |
| `plugins/toolbox/client.js` | Better Sidebar descriptor、注册成功状态、抽屉降级和多 pane 行为 |
| `scripts/build-toolbox-bundle.mjs` | 生成模板和依赖清单同步 |
| `package.json` | 根发布包 peer 与版本信息 |
| `flowglass/package.json` | Flowglass 发布包 peer 与版本信息 |
| `dynamic-toolbox/package.json` | 完整工具箱发布包 peer 与版本信息 |
| `flowglass/lib/*` | 由构建器重新生成，不直接编辑 |
| `dynamic-toolbox/lib/*` | 由构建器重新生成，不直接编辑 |
| `flowglass/BUILDINFO.json` | 由构建器更新 |
| `dynamic-toolbox/BUILDINFO.json` | 由构建器更新 |
| `smoke/sim-flow.cjs` | DSH 0.1.5 助手流与失败尝试测试 |
| `smoke/sim-trace.cjs` | 如共享日志读取器变化，同步缓存和历史读取测试 |
| `smoke/sim-toolbox-client.cjs` | Sidebar 注册、降级、重复注册和设置同步测试 |
| `smoke/sim-rc7-composition.cjs` | 更名并升级为 0.1.5-rc.1 真实组合冒烟 |
| `README.md`、`REBUILD.md`、`PLUGIN-DEV.md` | 支持矩阵、构建步骤和适配说明 |

## 6. 验证命令

实施后至少执行：

```powershell
node make-payloads.mjs
node scripts/build-toolbox-bundle.mjs --flow --version <next-version> --clean
node scripts/build-toolbox-bundle.mjs --version <next-version> --clean
node scripts/verify-generated.mjs
node scripts/verify-bundle.mjs
node smoke.mjs
```

还需要一条使用 DSH 0.1.5-rc.1 和目标 Better Sidebar 版本的真实 Web profile 挂载测试。该测试必须验证：

1. 两个包无 peer 冲突地安装和启动；
2. Flowglass Client bundle 成功物化；
3. Better Sidebar 中出现流镜入口并能打开；
4. 模型输出期间内容实时增长；
5. 成功、失败、重试和中断后状态正确结算；
6. 切换会话不会串流；
7. 停止插件后 listener、Remote、timer、Sidebar registration 和实时缓冲全部释放；
8. 不安装 Better Sidebar 时独立抽屉仍可使用。

## 7. 验收标准

- 三份发布清单均声明并实际验证 DSH 0.1.5-rc.1。
- 代码不再以 `assistant/chunk` 作为当前协议输入。
- 实时生成期间，流镜无需等待最终 `assistant/message` 即可更新。
- `assistant/message`、`assistant/attempt` 与实时帧使用同一折叠语义。
- 重试失败 attempt 可见，最终成功不会与实时草稿重复。
- 实时缓冲有明确上限，插件停止和会话结束后无残留。
- Better Sidebar 注册失败时不会隐藏唯一可用的独立入口。
- 模拟冒烟与 DSH 0.1.5-rc.1 真实组合冒烟全部通过。
- `verify-generated` 和 `verify-bundle` 证明源文件、生成文件及 BUILDINFO 一致。
- 三个仓库的适配不要求修改 Harness 源码。

## 8. 建议提交顺序

1. `test: add DSH 0.1.5 assistant stream fixtures`
2. `fix: adapt Flowglass to assistant stream records`
3. `fix: align Better Sidebar integration lifecycle`
4. `build: regenerate native Flowglass bundles`
5. `test: run DSH 0.1.5-rc.1 composition smoke`
6. `docs: update supported Harness and Sidebar versions`

每个提交都应保持生成产物与对应源同步；涉及构建输出的提交不得只改 `lib/`。
