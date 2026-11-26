# AI CenterChart 思考过程"渐进 Markdown 渲染"重构：原理、可行性与修改过程

> 组件：`src/components/Ai/components/CenterChart.vue`
> 关联：`src/components/Ai/components/MessageCard.vue`、`src/components/Ai/utils/chatRender.ts`
> 日期：2026-10-30
> 涉及：打字机流式渲染架构（tokenQueue → markdown 前缀全量重渲染）

---

## 一、问题现象与根因（原理）

### 1.1 现象

思考过程卡片（纯 markdown 回答）在打字机流式输出期间，markdown 语法始终以**原文形态**展示（`#`、`**`、`|...|`、`-` 等标记直接可见），直到整条消息输出完毕的一瞬间才"突跳"为正确的渲染格式（标题、加粗、表格）。

### 1.2 根因链

打字机阶段展示的 HTML 与流结束后展示的 HTML **来自两条不同的渲染管线**：

```
流式阶段（旧）：  delta 文本 ──makeHtml(delta)──▶ token 队列 ──逐 token 拼接──▶ typedHtml（碎片 HTML）
流结束后（旧）：  完整 message ──makeHtml(message)──▶ v-html（正确渲染）
```

三个叠加成因：

| # | 成因 | 位置（修改前） | 说明 |
|---|------|----------------|------|
| 1 | **按 delta 独立转换** | `pushTokens(makeHtml(delta.text))` | `item.message` 虽然完整累积，但送进 showdown 的只是本次增量小片段 |
| 2 | **markdown 语法有上下文依赖** | showdown 解析特征 | `**加粗` 在闭口 `**` 到达前不成对；表格需要第二行 `\|---\|` 分隔行才成立；`#`/`-` 独立的碎片不能成为语法标记 |
| 3 | **展示源切换点** | `plainHtml` computed（MessageCard）| `isLast && typing` 时返回 `typedHtml`（碎片拼出来的），结束后切换为 `makeHtmlCached(item.message)`（全量解析）——于是"渲染完成后才是正确格式" |

本质：**打字机管线丢了语法上下文**，且"已打出的错误片段"永久滞留在 `currentTyped` 里，要等打字结束、展示源切换才能被纠正一次。

---

## 二、可行性分析（修改前论证）

### 2.1 候选方案

**方案 A（本次采用）**：打字机指针改指**原始 markdown**，每 tick 前移 `ptr`，对 `message.slice(0, ptr)` 做 `makeHtml` 全量转换后整体替换 `typedHtml`；节流由帧驱动（rAF + 20ms 步长）+ 自适应批量控制成本。

**方案 B**：纯节流全量渲染 `makeHtml(item.message)`，不做逐字打字机。实现最简但失去打字观感，块级内容整块浮现。

方案 A 保住了打字机体验，且每帧只多一次"前缀解析"，成本可控，故采用 A。

### 2.2 可行性要点逐一验证

| 维度 | 结论 | 论证 |
|------|------|------|
| 正确性 | ✅ 根治 | 前缀整体转换 = 语法上下文始终完整；已渲染部分随内容增长**自我修正**（闭口的 `**`、表格分隔行到达后，1~2 tick 内变为正确渲染），不再"保留错误直到流结束" |
| HTML 截断问题 | ✅ 不存在 | 只对**原始 markdown**取前缀、永远整体转换输出合法 HTML；若对转换产物 HTML 切片才会出现 `<ta|ble>` 这类截断 |
| 收尾一致性 | ✅ 消除终局突变 | 流结束时打字机的最后一帧渲染 = `makeHtml(完整 message)`，与结束后的常态渲染（`makeHtmlCached`）**完全一致**，旧版打字结束瞬间的 DOM 翻转消失 |
| 性能 | ✅ 可控 | showdown 对几 KB 文本单次解析毫秒级；帧间隔 20ms、每帧最多 1 次解析，积压大时批量加速（`ceil(backlog/40)`，上限 12 字/帧），追帧超限丢弃债务（`MAX_CATCH_UP_STEPS`），整体 O(n²) 但 n 为消息长度（KB 级），风险可接受；超长文本可再加"稳定前缀缓存"优化，本次未做 |
| 视觉副作用 | ⚠️ 可接受 | markdown 向后生效带来的瞬时重排：表格首行在分隔行到达前以段落展示、列表缩进跳变、空行导致的段落拆分——均为局部、瞬态（≤1~2 tick），远优于旧版"整段错误直到结束" |
| 对外行为 | ✅ 不变 | `sendMessage / setMessages /`事件（streaming-start/end、taskFinish、recommendedQuestions、sendQuestion、newChat）签名与触发语义不变；`MessageCard` 的 `typingHtml` prop 协议不变 |

### 2.3 架构适配点（当前工作区的新形态）

工作区同期已有一轮性能优化（单卡渲染、shallowRef、缓存解析，见 `docs/AI-center-chart长对话卡顿性能优化.md`），本次重构必须在它之上兼容：

- `messageList` 是 `shallowRef`，内部item 会**整对象替换**（`onCardChange`/`updateItemById`）→ 打字机不能持有对象引用，改为**按 `id` 解析目标**（`getTypingTarget()`）；
- 展示由 `typedHtml` 驱动、通过 `:typing-html` prop 传给打字中的卡片，协议不变；
- 增量事件仍原地 `lastItem.message += ...`（shallowRef 下不影响展示），打字机每帧从 `item.message` 取前缀，**内容层与展示层彻底解耦**。

---

## 三、修改过程

### 3.1 删除：tokenQueue 一套管线

移除以下内容（CenterChart.vue）：

- 状态：`tokenQueue / tokenCursor / currentTyped`；
- 函数：`tokenize()`、`pushTokens()`、`remainingTokens()`、`trimTokenQueue()`；
- 三处流式事件里的 `pushTokens(makeHtml(delta))` 调用；
- `newChat` / `sendMessage` 中对 token 队列的重置代码。

### 3.2 新增：markdown 前缀打字机

```ts
let typingTargetId = '';   // 打字目标消息 id（shallowRef 整对象替换后只能按 id 解析）
let typingPtr = 0;         // 原始 markdown 打字指针
```

核心逻辑（`typingFrame`，rAF 驱动，20ms 步长）：

```ts
if (typingPtr < target.message.length) {
  const backlogLength = target.message.length - typingPtr;
  const batch = Math.min(
    Math.max(TYPE_BATCH_MIN, Math.ceil(backlogLength / 40)),
    TYPE_BATCH_MAX,
    backlogLength,
  );
  typingPtr += batch;
  // 对原始 markdown 前缀整体转换：语法上下文完整，已完成部分自动修正
  typedHtml.value = makeHtml(target.message.slice(0, typingPtr));
} else if (!isStreaming.value) {
  // 追平且流已结束：按完整消息做最终渲染，与结束后的常态渲染一致
  typedHtml.value = makeHtml(target.message);
  stopTyping(); isTyping.value = false; emit('streaming-end'); return;
} else { /* 300ms 后置 isLoading，维持"思考中"指示 */ }
```

外围函数与语义：

| 函数 | 职责 | 与旧版对应关系 |
|------|------|----------------|
| `getTypingTarget()` | 按 id 从 messageList 解析打字目标 | 替代旧对象引用（兼容整对象替换） |
| `hasTypingBacklog()` | `ptr < target.message.length` | 替代旧 `remainingTokens() > 0`（done/finish 分支的 `hideRecommended` 判定） |
| `startTyping(targetId)` | 切换目标时 `ptr=0` 重打；目标相同则保留指针只打增量；保证 rAF 循环运行 | 替代旧无参 `startTyping()` |
| `finalizeTyping()` | 不等 backlog 立即收尾：全量渲染 + `isTyping=false` + emit streaming-end | 替代旧 `watch(isStreaming)` 里的收尾段 |
| `stopTyping()` | 取消 rAF 与 loadingTimer | 不变 |

### 3.3 流式事件接入（内容层不动、展示层换线）

```ts
// 新建 question（首条 / 上一条是 ask / 上一条是富卡片）
const created = appendMessage({ type: 'question', message: data.content, messageId, collapsed: true });
startTyping(created.id);

// "data" 整段推送：delta 判定不变，只改展示接入
lastItem.message += (delta.newLine ? '\n' : '') + delta.text;   // 不再需要手工补 <br/>
startTyping(lastItem.id);

// "delta" 逐字增量
lastItem.message += data.content;
startTyping(lastItem.id);
```

`getDataEventDelta` 的增量判定逻辑保持原样；旧版 `newLine 时插 <br/>` 在新方案中由 showdown `simpleLineBreaks` 自然处理（原文 `\n` → `<br>`），且与最终渲染完全一致。

配套：`appendMessage` 改为返回创建的 item（供 `startTyping(created.id)` 使用）。

### 3.4 lined 收尾条件迁移

```ts
watch(isStreaming, (val) => {
  // 流结束且打字机没有 backlog 时立即收尾；有 backlog 则由 typingFrame 追平后自行收尾
  if (!val && !hasTypingBacklog()) {
    finalizeTyping();
  }
});
```

边缘场景推演：

- **流结束但还有 backlog** → rAF 循环继续追帧，追平后当帧 finalize，延迟 ≤ 一个 tick（与旧版"队列排空后才 finalize"语义一致）；
- **流结束、已追平、rAF空转** → 立即 finalize（对应旧版 `remainingTokens()===0` 分支）；
- **流中长时间无新数据** → 300ms loadingTimer → `isLoading=true`，底部"正在思考中…"指示不变；
- **追加态续打**（同一条消息追平后又收到增量）→ 目标 id 未变、指针保留在旧长度，只打增量，且续打首帧的前缀渲染与收尾帧渲染相同，无视觉跳变；
- **新提问 / 新会话** → `sendMessage`/`newChat` 重置 `typingTargetId=''`、`typingPtr=0`、`typedHtml=''`。

### 3.5 未改动

- `MessageCard.vue`（`typingHtml` 协议、`plainHtml` 切换逻辑原样适用）；
- `chatRender.ts`（`makeHtml` 供前缀解析、`makeHtmlCached` 供终态，分工明确）;
- 增量/快照判定 `getDataEventDelta`、结论折叠 `maybeCollapseThinking`、滚动跟随、推荐问题等下游依赖全部不受影响。

---

## 四、验证结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| Lint | `pnpm exec oxlint src/components/Ai/components/CenterChart.vue src/components/Ai/components/MessageCard.vue src/components/Ai/utils/chatRender.ts` | ✅ 0 warnings / 0 errors（106 规则） |
| Typecheck | `pnpm type:check`（vue-tsc 全仓） | ✅ 三个修改文件 0 错误（仓内其它页面的数百个历史错误与本次改动无关） |
| 残留引用扫描 | `rg "tokenQueue\|tokenCursor\|currentTyped\|remainingTokens\|pushTokens\|tokenize"` | ✅ 无残留（仅注释中一处说明性提及） |

## 五、预期效果与已知取舍

**效果**：
1. 打字过程中的 markdown 语法（标题/加粗/表格/列表）在**语法完成后的 1~2 帧内（40~60ms）** 即正确渲染，而非等整个流结束；
2. 打字结束瞬间不再出现"DOM 突变/翻转"（打字末帧与终态渲染一致）；
3. 流式展示层与内容累积层解耦，后续任何内容层改造（换协议、换解析器）不影响打字机。

**已知取舍**：
1. 表格、列表等"向后生效"语法在前缀渲染中会先短暂显示为普通文本/段落，随后自动重排为正确结构（瞬态、局部，约 20~60ms）；
2. 每帧一次全量前缀解析，超长消息（数十 KB）下 CPU 占用线性上升，若实际出现瓶颈，可补"稳定前缀缓存"（已定稿段落只解析一次）；
3. 历史消息（非打字中）仍走 `makeHtmlCached` 缓存路径，不新增开销。
