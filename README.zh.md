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
  verify-layering.mjs  用真实的 dsh CLI 合成补丁层级
```

## 许可证

MIT
