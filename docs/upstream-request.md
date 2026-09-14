# 上游建议草稿：让 `desktop-notifications` 的文案可覆盖

目标仓库：<https://github.com/anywhere-labs/deepseek-harness-desktop>

下面整段可直接作为 issue 正文粘贴；标题用引号里的那句。

---

**标题：`[Feature] desktop-notifications 的文案应可注入，或提供通知文案 provider seam`**

## 问题

`dsh-plugin-desktop/notifications` 的通知文案是硬编码常量：

```js
const NOTIFICATION_COPY = {
  zh: {
    "turn-completed": {
      title: "用户回合已完成",
      body: "一个由你发起的回合已完成。"
    },
    ...
  }
}
```

它拿不到会话标题，也拿不到这一回合的回复内容，所以发出来的是：

| | 现状 |
|---|---|
| 标题 | `用户回合已完成` |
| 正文 | `一个由你发起的回合已完成。` |

用户无法判断是**哪个**会话结束了、这一回合**产出了什么**、要不要马上跟进。而通知的全部
价值就在于回答这三个问题。

## 为什么第三方插件无法正当地解决它

一个第三方插件想提供更丰富的通知，直觉做法是「自己再注册一个观察者」。但这条路被堵住了：

内置行的设置命名空间是 `dsh-desktop-notifications`。如果第三方插件注册**同一个**命名空间
来复用 Desktop 上已有的通知开关，`@deepseek-ai/dsh-settings` 会直接抛错：

```js
register(ns, schema, options) {
  const parsedNs = parseSettingsNamespace(ns);
  if (this.registrations.has(parsedNs)) throw new Error(`settings namespace "${parsedNs}" is already registered`);
  ...
}
```

结果是两个插件**根本无法共存**：

- 同时启用 → 后注册的那一行激活失败；
- 改用自有命名空间 → 内置那条常量通知照样弹，每回合两条；
- 唯一可行的做法 → 在 bundle patch 里 `- id: desktop-notifications / disabled: true`。

而最后这种做法又有两个代价：

1. **它违反 DSH STORE 的上架规则**。DSH STORE 的自动检查会以
   `SUBMISSION_PATCH_PROTECTED` 驳回任何禁用随发行 entry 的 patch，于是这类插件只能
   被排除在商城之外，作者也没有合规的替代路径。
2. **它把「禁用他人组件」变成了安装副作用**。这件事本该由用户在自己的 profile 层显式
   决定，而不是随插件安装静默发生。

换句话说：不是插件作者想动官方组件，而是**缺少一个正当的扩展点**。

## 建议

按侵入性从小到大，任选其一即可解除这个死结：

1. **把文案变成行 `config`**：允许 `desktop-notifications` 行的 `config` 覆盖四类文案
   （`turnCompleted` / `turnFailed` / `jobCompleted` / `jobFailed`）。最小改动，但表达力有限
   ——`config` 是静态的，而我们需要的是按会话、按回合动态生成。

2. **提供文案 provider seam（推荐）**：暴露一个可选服务，第三方按优先级注册一个
   provider；内置行在发通知前调用它，未注册或返回 `undefined` 时回退到现有常量。例如：

   ```js
   // 内置行侧
   const copy = ctx.get('desktopNotifications')?.resolve({ session, event, reason })
     ?? NOTIFICATION_COPY[locale][kind];
   runtime.notifyAttention(copy);

   // 第三方侧
   ctx.desktopNotifications.register(({ session, event }) => ({ title, body }));
   ```

   命名空间、开关归属、节流与聚焦抑制都留在官方行，第三方只贡献文案。这样：
   - 不需要禁用任何 entry，bundle patch 可以纯新增；
   - 第三方不必注册第二个观察者，重复通知不可能发生；
   - 设置页的五个开关继续由官方行拥有，行为不变。

3. **允许行被替换而非禁用**：目前补丁的 `name` 字段是**校验守卫**而不是赋值
   （`if (name && name !== target.name) { warn(...); continue }`），所以无法把某一行指向
   另一个包。若允许按 id 改写 `name`，第三方就能合法地「替换」这一行而不是「禁用」它。

## 复现与版本

- DSH Desktop 2.0.3（`dsh-plugin-desktop@2.0.3`，`@deepseek-ai/dsh@0.1.1-rc.2`）
- 第三方插件：<https://github.com/hoyin-law/dsh-notify-plus>
- 「无法共存」可直接验证：任意两个注册同一命名空间的 settings consumer，第二个
  `settings.register()` 必抛 `settings namespace "..." is already registered`。

## 附：受影响方不止一个

任何想改进通知行为的插件都会撞到同一面墙（任务失败原因、后台任务标签、按工作区区分、
免打扰时段……）。一个文案 provider seam 能用很小的面积解开整类需求，同时把「禁用官方
组件」这种灰区做法从生态里去掉。

---

## 提交前要确认的事

- [ ] 标题与正文是否符合仓库 issue 模板要求（若仓库有模板，按其字段调整）
- [ ] 是否要先在本地或一次性 profile 里做一次最小复现，把输出贴进 issue
- [ ] 是否需要 @ 某位维护者（若非必要，不要 @）
- [ ] 语言：正文以中文为主；若仓库以英文为主，可另附英文摘要
