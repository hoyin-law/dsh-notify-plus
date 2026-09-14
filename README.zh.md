# dsh-notify-plus

[English](README.md) | [中文](README.zh.md)

为 **DSH Desktop** 提供带上下文的原生通知。

DSH Desktop 内置的通知只告诉你「有一个回合结束了」，从不告诉你**是哪个会话**、
**这一回合究竟产出了什么**，所以收到通知也无法判断要不要跟进：

| | 内置通知 | dsh-notify-plus |
| --- | --- | --- |
| 标题 | `用户回合已完成` | `重构通知插件` —— 实时会话标题 |
| 正文 | `一个由你发起的回合已完成。` | `已经修复了通知排序，现在会优先选择最近的助手…` —— 提炼后的一句话 |

本插件会替换内置通知行，并复用同一个设置命名空间，因此 Desktop 上原有的开关继续
生效，用户已有的偏好不会丢失。

## 功能

- **标题始终是当前会话标题。** 标题取自基于日志的会话标题服务，会跟随重命名和自动
  标题修订，而不是一个常量。
- **正文提炼为一句话。** 中文回复取 10–20 个中文字，英文回复控制在 Windows 通知
  正文的安全长度内。整个过程不调用模型，因此不消耗 token、不引入延迟。
- **保留失败原因。** 失败回合会给出真实错误，而不是一句笼统的致歉；上下文用尽会单独
  标注。
- **后台任务带标签。** 多个后台任务同时结束时，可以分辨出究竟是哪个（例如 `pnpm
  test`）完成了。
- **不为内部扇出发通知。** 委派出的子代理会话，以及没有任何用户消息发起的回合，一律
  忽略——与内置行的行为一致。

## 环境要求

| | |
| --- | --- |
| DSH Desktop | 2.0.x（已在 2.0.3 上验证） |
| Harness | `@deepseek-ai/dsh 0.1.1-rc.x` |
| Node | `>=22.19.0`（仅开发和测试需要） |

本插件只依赖一个 harness 已挂载的模块 `@deepseek-ai/schemastery`，无需自行安装。

## 安装

### 通过 DSH Desktop 插件市场

在 Desktop 插件市场搜索 `dsh-notify-plus` 安装。市场会把包写入当前 profile 的
`dsh.profile.bundles`，这正是本插件需要的全部。

### 通过命令行

```powershell
dsh plugin --profile <你的 profile> add dsh-notify-plus
```

`dsh plugin` 是 pnpm 的转发器：它把包装进 profile，并根据安装结果对账
`dsh.profile.bundles`。声明了 `dsh.bundle.patch` 的包（本插件即是）会自动加入组合层
栈。

### 从本地检出安装

```powershell
git clone https://github.com/hoyin-law/dsh-notify-plus.git
dsh plugin --profile <你的 profile> add C:\path\to\dsh-notify-plus
```

然后重启 DSH Desktop。不要凭感觉假设它生效了，先确认行已挂载：

```powershell
dsh --profile <你的 profile> dump-config | Select-String "dsh-notify-plus"
```

## 替换机制

两者都是 Cordis 插件。本插件不与内置观察者竞争（那会导致每回合弹出两条通知），而是
随包附带一份补丁，禁用内置行并插入自己的行：

```yaml
- id: desktop-notifications
  disabled: true

- insert:
    - id: dsh-notify-plus
      name: dsh-notify-plus
```

顺序决定了这次替换是否安全。DSH Desktop 的组合层次为：

1. `dsh.profile.bundles` 中的各层，按顺序叠加；launcher 会把自己的
   `dsh-plugin-desktop` 层插在 `@deepseek-ai/dsh-web-app` 之后；
2. 当前 profile 的 `cordis.patch.yml`；
3. `$DSH_HOME/cordis.patch.yml`；
4. launcher 按安装计算出的补丁。

第三方 bundle 排在 launcher 层之后，所以本包 `cordis.patch.yml` 中按 id 定位的补丁
会覆盖 `desktop-notifications`。补丁命中一个不存在的行只会告警而不会报错，因此在非
DSH Desktop 宿主上这段补丁保持惰性，而不会中断启动。

## 设置

插件注册的 `dsh-desktop-notifications` 命名空间与 DSH Desktop 已渲染的五个开关完全
一致，因此 **设置 → 通知** 无需任何改动即可控制本插件：

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `enabled` | `true` | 所有通知的总开关 |
| `notifyOnTurnCompletion` | `true` | 会话回合完成 |
| `notifyOnTurnFailure` | `true` | 会话回合失败或上下文用尽 |
| `notifyOnJobCompletion` | `true` | 后台任务完成 |
| `notifyOnJobFailure` | `true` | 后台任务失败 |

DSH Desktop 在窗口聚焦时本来就会抑制通知，因此你正在盯着看的工作不会打扰你。

### 一个已知的上游问题

在带有 `profile-preferences` 记录的 DSH Desktop 版本上，**设置 → 通知**里的改动可能在下次
启动时被还原。桌面端把 `mode`、`openBrowser`、`networkExposure`、`notifications` 私下存了一份
在 `<userData>/profile-preferences/<profileHash>/state.json`，启动时镜像回
`settings.yaml`，而设置页只写 `settings.yaml`。本插件读到什么就用什么，因此会像内置行一样
继承这个还原。

上游已记录为
[issue #947](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/947)。
DSH Desktop 2.0.3 不含该机制、不受影响；报告针对的是 2.0.9，镜像代码在晚于 2.0.3 的某个版本
才出现。

这里**刻意不做规避**。那份记录是另一个组件的私有真源：插件去写它，等于给一份同时装着用户
浏览器与网络暴露选择权的单文档记录增加第二个写入方。

## 正文是怎么来的

`lib/summarize.js` 无依赖且完全确定，流程为：

1. 去掉围栏代码块、行内代码、链接目标、裸 URL、HTML 标签、标题符、列表符、引用符、
   强调符和控制字符；
2. 余下内容按句子切分，保留句末标点；
3. 去掉开头的寒暄从句（`好的，`、`Sure,` 之类），让正文从「做了什么」开始；
4. 逐句累加直到满足该文字系统的最小长度；
5. 在预算内优先从句读边界截断，并追加 `…`。

长度预算集中在一处，便于讨论：

```js
export const DEFAULT_LIMITS = Object.freeze({
  cjk: Object.freeze({ min: 10, max: 20 }),
  latin: Object.freeze({ min: 40, max: 140 }),
});
```

当一回合只做了工具调用、完全没有散文输出时，正文回退为工具调用次数
（`已完成 3 项工具调用…`），而不是一句空泛的「已完成」。

## 兼容性

本插件读取的是 harness 内部接口，它们不是稳定的公共契约：
`desktopRuntime.notifyAttention`、`sessions.on("session/event")`、
`ctx.get("sessionTitle")`、`jobs.onJobDone`。接线固定在 DSH Desktop 2.0.3，并有
针对该形状的测试守护。

如果 harness 改了这些服务形状，插件会在启动时**明确失败**，而不是静默丢弃通知
——`desktopRuntime` 是声明的硬依赖，行会等待 Desktop shell 而不是盲目激活。若真
的发生，请附上你的 DSH Desktop 版本开 issue。

## DSH STORE 上架状态

本插件**未在 [DSH STORE](https://dsh.store/) 上架**。商城的自动策略会拒绝任何「禁用随发行
组件」的 bundle patch，而禁用正是本插件能工作的前提：不禁用，内置的
`desktop-notifications` 行会继续弹它自己那条通知，而且两个插件根本无法共存——它们注册的是
同一个 `dsh-desktop-notifications` 设置命名空间，`settings.register()` 遇到重复会直接抛错，
后注册的那一行会激活失败。

这是明确记录的取舍，不是疏漏：

- 被禁用的是 `dsh-plugin-desktop`（DSH Desktop launcher）自带的行，不属于任何
  `@deepseek-ai/*` 包。没有修改任何官方 harness 包、entry ID 或命名空间。
- 替换是等价的：本插件用同样的五个键重新注册同一个设置命名空间，Desktop 上的开关继续有
  效，用户已有偏好不丢失。
- 安装与启动已在 DSH Desktop 2.0.3 上端到端验证，见[在真机上验证](#在真机上验证)。

请从仓库安装：

```powershell
dsh plugin --profile <你的 profile> add https://github.com/hoyin-law/dsh-notify-plus
```

后续版本可能把「禁用」改为用户在**自己的** profile 层显式开启的选项，那时 bundle patch 就能
变成纯新增。但那需要插件在内置行仍存在时回退到自有设置命名空间，属于行为变更而非打包调整。

### 上游进展

本插件补上的这个能力正在被原生实现。上游 `master` 目前仍是硬编码文案，但
[PR #969](https://github.com/anywhere-labs/deepseek-harness-desktop/pull/969)
已经为通知标题接入会话标题、并为回合完成加上最终回答预览，
[issue #951](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/951)
则在要求 host 侧统一治理第三方插件通知。
[`docs/upstream-request.md`](docs/upstream-request.md) 记录了让我们**没有**另开
issue 的查重结果、相关线索，以及值得贡献给这些讨论的实证。

这项工作一旦进入 DSH Desktop 发行版，本插件应当**退役**，而不是靠禁用一个已经正确的官方行
继续存在。

### 兼容性声明

`package.json` 通过 `dsh.compatibility.dshReleases` 提供逐版本声明。每一条都是**运行验证**或
**接口验证**的结论，没有靠假设：

| DSH 版本 | 依据 |
| --- | --- |
| `0.1.1-rc.2` | 运行验证：装进 DSH Desktop 2.0.3 上真实 `web` profile，并观测到形状正确
的通知 |
| `0.1.5-alpha.2` | 接口验证：所有被消费的接口签名与载荷形状完全一致 |
| `0.1.5-rc.1` | 接口验证：同上 |
| `0.1.5-rc.2` | 接口验证：同上 |

「接口验证」指本插件消费的四个界面——`sessions.on("session/event")` 及其
`turn/start`、`turn/end`、`assistant/message`、`user/message` 载荷；`sessionTitle.get(session)`；
`jobs.onJobDone(snapshot)` 与 `JobSnapshot.label`；以及 `settings.register(ns, schema, options)`
——已逐个与各版本已发布的类型与源码比对，确认未变。这是**来源层**的结论，不是运行时验收，
并且按此标注。

只声明了 `win32` 与 DSH Desktop 宿主。通知链路本身与平台无关，但其余组合没有实际跑过。

## 开发

```powershell
npm install            # 仅用于补齐 harness 提供的 schemastery
npm test               # 4 个套件、64 条断言，无需 harness
npm run verify:layering   # 用真实的 dsh CLI 合成补丁层级
```

测试覆盖纯逻辑层——文本提炼、文案、会话投影、回合/任务状态机——使用手工构造的事件
夹具，因此无需启动 Electron 就能校验行为契约。

`verify:layering` 是唯一需要本机安装 DSH Desktop 的检查。它会建一个临时
`DSH_HOME`、伪造 launcher 层，再让真实的 `dsh --dump-config` 合成整棵树，断言内置行
最终为 `disabled: true`、本插件行紧随其后，以及在没有内置行的宿主上仍然以退出码
`0` 结束、只留一条告警。若安装位置非默认，可指定：

```powershell
node scripts/verify-layering.mjs --app "D:\Apps\DSH Desktop\DSH Desktop.exe"
```

```
lib/
  index.js       Cordis 接线：settings、jobs、sessions 观察者
  turn.js        会话事件 -> 通知载荷 状态机
  summarize.js   确定性文本提炼
  copy.js        各语言文案
  session.js     对 DSH 会话值的只读投影
  settings.js    共享的 dsh-desktop-notifications 命名空间
cordis.patch.yml 随包补丁：禁用内置行，插入本插件行
scripts/
  verify-layering.mjs     用真实的 dsh CLI 合成补丁层级
tools/
  asar.mjs                从 app.asar 中读取 harness 接口
  read-windows-toasts.mjs 从 Windows 通知历史库中读回已投递的通知
```

### 在真机上验证

DSH Desktop 窗口聚焦时 `notifyAttention` 会直接返回，而它弹的是 Electron
`Notification`，应用日志里不留痕——所以在窗口聚焦的情况下测试，看起来会像「什么都没
发生」。唯一可靠的检查是读 shell 自己的通知历史：

```powershell
node tools/read-windows-toasts.mjs --limit 10
```

替换成功时应该看到切点正好落在重启那一刻：

```
2026/9/14 04:33:35  title="重构通知插件"   body="已经修复了通知排序逻辑，现在会优先…"
2026/9/14 04:23:24  title="用户回合已完成"  body="一个由你发起的回合已完成。"
```

每回合一条、标题是真实会话名、正文是截断后的提炼而非固定句；而且硬编码那条是**在重启
处停止**出现的，不是与新通知并存——这才证明内置观察者是被真正禁用，而不只是被并列。

## 许可证

MIT
