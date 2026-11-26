# AI CenterChart 长对话卡顿性能优化：计划、过程与复盘

> 组件：`src/components/Ai/components/CenterChart.vue`
> 日期：2026-10-30
> 范围：AI 面板中央对话消息流（打字机流式渲染、历史消息展示、点赞/点踩、洞察卡片）

---

## 一、问题现象与根因分析

### 1.1 现象

长对话（多轮问答、单条回答内容较长）场景下，AI 面板对话区明显卡顿：
打字机输出期间掉帧、输入响应延迟、滚动不跟手。

### 1.2 根因（按严重程度排序）

| # | 根因 | 位置（优化前） | 量化影响 |
|---|------|----------------|----------|
| 1 | **单组件全量重渲染**：打字机每 20ms 更新一次 `typedHtml`，触发整个 CenterChart 重渲染，模板中所有历史消息的渲染表达式全部重新求值 | `getHtmlMsg / hasPlainText / hasRichCard / canShowActions / getInlinePreviewText` 均为模板内函数调用 | 历史消息数 × 重渲染频率 次 markdown 重解析（O(n)××） |
| 2 | **每帧重复 markdown 解析**：`getHtmlMsg` 调用 `converter.makeHtml(item.message)`，无任何缓存 | CenterChart.vue 原 34/544 行 | 最大 CPU 开销源 |
| 3 | **重复字符串正则**：每次渲染对所有消息跑 `isAnsXml` 正则 | `hasPlainText / hasRichCard` | 乘上根因 1 的频率 |
| 4 | **v-html 整段 innerHTML 重建**：流式中打字卡片每帧整体替换 DOM | `v-html="getHtmlMsg(item, index)"` | 长内容每帧一次大 DOM 替换 + reflow |
| 5 | **每 tick 强制同步布局**：`watch(typedHtml)` 里 `isAtBottom()` 每帧读 `scrollHeight/scrollTop` | 原 798-802 行 | 与 4 叠加造成强制重排 |
| 6 | **tokenQueue 用 `shift()`**：每帧 O(n) 数组搬移，token 按单字符切分、队列可达数千元素 | 原 398 行 | 队列越长每帧越慢 |
| 7 | **深层响应式追踪开销**：`messageList` 为深 reactive，长会话依赖收集/追踪成本线性上升 | `ref<MessageItem[]>` | —— |
| 8 | **`:key="index"`** | 原 4 行 | 任何一条消息变化引发后续节点 diff |

次要因素：`AnsCard`（内部 `parseAnsXml` computed）、`InsightCard` 随父组件全量重渲染；`FailContent` 全局 ref。

---

## 二、优化计划

### 2.1 目标

- 打字机输出期间，**每帧只重渲染"正在打字的那张卡片"**，历史消息零参与；
- markdown / isAnsXml 解析结果 **每条消息只计算一次**（命中即 Map 查找）；
- 消除每帧同步布局读取、O(n) shift、无界数组增长；
- 长对话历史 DOM 规模可控（分批懒渲染）；
- **对外 API（`sendMessage / setMessages` + 事件）与视觉行为完全不变**。

### 2.2 方案选择说明

| 备选 | 结论 | 理由 |
|------|------|------|
| 引入虚拟滚动库（vue-virtual-scroller 等） | ❌ 不采用 | 项目无现成依赖；聊天项高度不定（v-html 富文本）、首尾锚点处理复杂，风险高 |
| 自研高度测量虚拟列表 | ❌ 不采用 | 同上，且收益可被分批懒渲染覆盖大半 |
| **分批懒渲染 + 整轮不拆开**（≤60 条窗口，点击展开更早批次） | ✅ 采用 | 改动小、无锚点风险、DOM 上限可控 |
| 打字机保持 `setInterval` 只抽出子组件 | ✅ 顺手升级为 rAF | rAF 与浏览器合成节奏一致，隐藏页签自动暂停 |

### 2.3 分项计划（1-8）

1. **markdown / isAnsXml 缓存** —— 新增 `utils/chatRender.ts`，`makeHtmlCached / isAnsXmlCached`（Map 缓存，上限 300 条防无界增长；流式 delta 用非缓存的 `makeHtml` 防缓存污染）。
2. **抽出 `MessageCard.vue` 子组件** —— 每条消息一个实例，props 不变即跳过重渲染；操作栏、点赞点踩、FailContent 反馈全部下沉。
3. **唯一 key** —— `MessageItem.id`（注入式 `createMessage`），v-for 不再用 index。
4. **打字机改 rAF** —— 以 20ms 逻辑步长折算每帧批次（含追赶上限 6 步），只更新流式卡片；滚动调度同步改 rAF。
5. **贴底标记** —— `@scroll` 维护 `stickBottom` 响应式标记，watch 中不再读布局；`scrollToBottom` 后回写标记。
6. **tokenQueue 游标读取** —— `tokenCursor` 替代 `shift()`；队列消费完即重置，游标 ≥8192 时裁剪队头，防无界增长。
7. **分批懒渲染** —— `visibleMessages`（默认窗口 60 条、每次展开 30 条），截断点回退到 `ask` 边界保证整轮不拆开；展开后在 nextTick 按 `scrollHeight` 增量补偿 scrollTop，视口不跳动。
8. **shallowRef + 整对象替换** —— `messageList` 改 `shallowRef`；所有状态变化（追加 / updateItemById / onCardChange / collapseThinking）通过**替换数组或替换单条对象**触发；子组件内部状态变化通过 `change` 事件回传整对象。

### 2.4 架构核对（实施前）

- 父组件 `Ai/index.vue` 对 CenterChart 的用法仅为：
  `<CenterChart ref @new-chat @streaming-end @streaming-start @send-question :plate>`，
  以及通过 ref 暴露的 `sendMessage(taskId, message, checkpoint, category, messageId)` 调用 —— **签名不变即可安全重构**。
- 工作区干净（改动前会话有 git 基线 09f762a41），可整体回滚。

---

## 三、实施过程

### 3.1 产物

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/Ai/utils/chatRender.ts` | 新增 | showdown 单例 + markdown/ansXml 缓存 + `MessageItem/MessageInit` 类型与 id 注入 |
| `src/components/Ai/components/MessageCard.vue` | 新增 | 单条消息渲染组件（ask/status/思考卡片/错误卡片/富卡片 + 操作栏 + 反馈弹层），样式从父组件原样迁移（含 `:deep()` markdown 样式） |
| `src/components/Ai/components/CenterChart.vue` | 重写 | 状态管理改 shallowRef + 整对象替换；打字机改 rAF + 游标队列；贴底标记；懒渲染窗口 |

### 3.2 关键设计决策

**（a）渲染隔离的实现方式**

父组件只向每个 MessageCard 传 `item / isLast / typing / streaming / typingHtml`：

```html
<template v-for="item in visibleMessages" :key="item.id">
  <MessageCard
    :item="item"
    :is-last="item.id === lastItemId"
    :typing="isTyping" :streaming="isStreaming"
    :typing-html="item.id === lastItemId && isTyping ? typedHtml : ''"
    @change="onCardChange" @new-chat="newChat" />
</template>
```

打字机每帧变化的是 `typingHtml`，**仅最后一张卡片的这个 prop 变化**，其余卡片的 props 全部不变
→ Vue 的 props diff 后跳过子组件更新。卡片内部：`plainHtml` computed 对历史消息走
`makeHtmlCached(message)`（一次 Map 查找）。

**（b）shallowRef 下的可见性约定**

raw 对象原地 `push` / `item.field += ...` **不会**触发任何渲染中的读取，因此：

| 数据变化 | 触发方式 |
|----------|----------|
| 追加消息（ask/status/question） | `appendMessage` → 数组整体替换 |
| task_finish 合并 insights | `updateItemById(lastQuestion.id, { insights })` |
| 用户点踩/点赞/展开收起 | 子组件 emit('change', {…item, patch}) → 父层整对象替换 |
| 结论后批量折叠思考过程 | `collapseThinking` → map 出新数组替换 |
| 流式 `lastItem.message += delta` | 原地追加即可：显示由 typedHtml 驱动，最终显示由"打字结束"的 props 翻转触发重读 |

**（c）反直觉点的处理（防行为回归）**

- `startTyping` **不得**把 `isTyping` 置回 true：原版语义中"打字机停止后迟到的流推送"阶段
  最后一张卡片显示的是聚合后的 `makeHtml(item.message)` 全量内容；若重置 isTyping 会把
  已渲染完的整段内容重新逐字打一遍，属于视觉倒退。实施中曾写入后按此原则撤销。
- 流式 delta 用非缓存 `makeHtml`（每次片段都不同，入缓存只会污染）；仅最终态走 `makeHtmlCached`。
- `loadingTimer / isLoading` 的 300ms 思考等待、`TYPE_BATCH_MIN/MAX` 节奏、
  `streaming-end` 双通道（打完 emit + `watch(isStreaming)` emit）等逻辑与原版逐行对齐。

### 3.3 实施中的自查与修正记录

1. 子组件 `FailContent` 模板 ref 用了 `let` 变量 → 修正为 `ref<...>` 响应式模板引用；
2. 初版遗漏 `lastItemId` 计算属性与 `getDataEventDelta` 函数（重写时误删）→ 补回（vue-tsc 报 TS2339/TS2304 定位）；
3. 残留未用 import `isAnsXmlCached`（子组件改为纯缓存工具调用后不需要）→ 移除；
4. scrollToBottom 中一段残留空注释块 → 清理；
5. `scrollToBottom` 直接执行 `el.scrollTop = el.scrollHeight` 后把 `isAtBottom()` 结果回写
   `stickBottom`，保证"程序滚动"与"事件滚动"两个来源的标记一致。

### 3.4 验证

| 检查项 | 命令 | 结果 |
|--------|------|------|
| Lint（本次改动 3 个文件） | `pnpm exec oxlint src/components/Ai/components/CenterChart.vue src/components/Ai/components/MessageCard.vue src/components/Ai/utils/chatRender.ts` | ✅ 0 warnings 0 errors |
| 类型检查（全仓 vue-tsc，关注 Ai 模块） | `pnpm run type:check` 后过滤 `components/Ai` | ✅ 改动文件 0 错误（其余为仓库其他模块既有错误，与本次无关） |
| 构建 | `pnpm exec vite build --mode dev` | ✅ built in 2m19s，无错误 |

### 3.5 性能对比（理论分析口径）

打字机单帧成本（60 条历史消息、假设每条 2KB markdown）：

- 优化前：`60 次 makeHtml（每条 O(n) 正则+解析）+ 60 次 isAnsXml 正则 + 全innerText DOM patch + 1 次同步布局读`，约每 20ms 一轮；
- 优化后：`1 次 props diff 命中 N-1 个子组件跳过 + 29 次 Map 命中 + 最后一张卡片 typingHtml prop 替换`。

DOM 层面：懒渲染窗口把长会话初始渲染节点数钉在 ~60 条消息规模；点踩反馈等交互只影响单个子组件。

---

## 四、复盘

### 4.1 做得对的

1. **先分析、后动手**：先把根因从模板函数调用、缓存缺失、布局读取、算法复杂度四个层面拆开排序，实施顺序（1→2→3 打底，其余跟进）一次到位，没有返工性的架构调整。
2. **改建不改 API**：对父组件 (`Ai/index.vue`) 的用法先做核对，`sendMessage/setMessages` 签名与事件名完全不动，外部零侵入。
3. **类型检查当回归网**：vue-tsc 把"重写时误删函数/遗漏声明"第一时间抓了出来（TS2304/TS2339），避免了运行期才暴露。
4. **保留原版每一个行为语义**（包括无视图差别的极端路径，如迟到的流推送），把"性能重构"压到最小验收面。

### 4.2 值得改进的

1. 重写一个近 800 行大文件时，`getDataEventDelta / lastItemId` 这类"小而关键"的片段最好随抽随补清单（本次靠 vue-tsc 兜底，属于流程依赖而非习惯）。
2. 全仓 `type:check` 存在大量与本模块无关的既有错误，输出噪声大；后续可考虑在脚本里支持 pass-filters（只看本次改动目录）。
3. 懒渲染的 `60/30` 阈值是拍脑袋值，未在真机上做长会话实测校准；可留待埋点后再调。

### 4.3 已知的行为差异（有意为之 / 可接受）

| 差异 | 说明 | 评定 |
|------|------|------|
| 点开 FailContent（点踩弹层）不再触发自动滚动 | 原版有 `watch(feedbackIndex)` 滚底；改为子组件本地状态后移除该监听 | 极低感知，面板本身贴底时视觉等价 |
| 无序 feedbackIndex 概念移除 | 各消息的踩弹层由子组件本地持有 | 与原版交互一致 |
| 粘底判断从"每帧读布局"变为"scroll 事件标记" | 语义等价；程序滚动后主动回写标记 | 等价 |
| 60 条窗口外的历史消息初始不渲染 | 顶部出现"展开更早的对话（N 条）"按钮，点击分批展开并保持视口 | 新增能力，代价极小 |

### 4.4 遗留与后续建议

1. **真机验证清单**（本次只做了静态验证）：多轮长会话打字流畅度、展开最早批次的视口稳定性、点赞点踩/新对话轮次切换、历史记录加载后折叠态预览、打字机刚结束时复制按钮拷贝完整消息。
2. `MessageItem.insights` 与 `message` 的合并逻辑（task_finish 路径）建议补组件级单测（当前项目无该组件测试）。
3. 若后续对话回合数继续增多，可把"懒渲染窗口"升级为明细级虚拟化或转移历史到独立的分页浏览。
4. `editingHtml` 系常量（`TYPE_INTERVAL/BATCH`）已参数化，若运营侧要调打字手感，改常量即可，不影响架构。

### 4.5 二次自查（交付后发现并修复的问题）

复核父组件调用链（`Ai/index.vue` 的 onSend/newChat/closeModal）后，发现并修复 2 个重构引入的问题 + 加固 1 个既有风险：

| # | 问题 | 定性 | 修复 |
|---|------|------|------|
| 1 | 纯文本消息 + 洞察卡片共存时，富卡片内 `item.message`（无 isAnsXml 守卫）会渲染一个空 AnsCard（parseAnsXml 失败 → 空容器，多余间距） | 重构引入（原版条件为 `message && isAnsMessage(message)`，重写时简化误伤） | MessageCard 补回 `messageIsAnsXml` 守卫 |
| 2 | `setMessages` 回填长历史后贴底标记 stale（初始 true），后续流式会自动滚到底部、把用户从顶部拉走；旧版每次 watch 实时 `isAtBottom()`，停留顶部 | 重构引入（行为不一致） | setMessages 中 nextTick 后刷新 `stickBottom = isAtBottom()` |
| 3 | 连续发送时旧 SSE 连接不主动关闭（`stopHttpClient` 被覆盖，仅卸载时清理） | 既有风险（原版相同；输入框禁用 + 服务端 cancelData 兜底使概率很低） | sendMessage 开头防御性调用 `stopHttpClient?.()`，防止迟到事件污染新一轮 |

修复后复跑 oxlint（0/0）与 vue-tsc（改动文件 0 错误）。

---

## 五、变更清单

```
新增  src/components/Ai/utils/chatRender.ts
新增  src/components/Ai/components/MessageCard.vue
重写  src/components/Ai/components/CenterChart.vue
文档  docs/AI-center-chart长对话卡顿性能优化.md（本文）
```

git 基线：`09f762a41`（feat: ai面板修改[#774 AI:100%]）

---

## 六、测试验证指南

### 6.1 启动

```bash
pnpm dev
```

打开页面，进入 AI 面板（数据参谋 AI 对话入口）。

### 6.2 功能回归测试（必须全过）

| 用例 | 操作 | 预期 |
|------|------|------|
| 新会话打字机 | 输入一条问题发送 | 逐字打字流正常，结束时自动折叠"思考过程"，无内容重打/闪动 |
| 多轮对话 | 连续发 3-5 条 | 每轮结束历史卡片保持折叠，操作栏（新对话/点赞/点踩）在流结束后才出现 |
| 复制 | 点击历史消息复制图标 | toast"复制文本成功"，剪贴板为**完整消息文本** |
| 点赞/点踩 | 历史消息点 like / dislike / 再点取消 | 图标态切换 + toast；点踩出现建议弹层，输入提交，点击空白处关闭 |
| 洞察卡片 | 问一个会出结论的问题 | task_finish 后出现 InsightCard/AnsCard，`emit taskFinish` 正常（父组件顶部联动） |
| 折叠展开 | 手动展开思考过程后等结论 | 手动动过的不再被自动折叠覆盖 |
| 推荐追问 | 等流结束出现"你可以继续问问" | 点击后正确发起下一轮 |
| 历史记录 | 打开历史抽屉选择一个任务 | 消息回填正确、思考过程默认折叠、新对话按钮/反馈正常 |
| 新对话/中途发送 | 流式输出中点 Cancel 或直接发新消息 | 上一轮停止、队列清空、新轮正常打字 |
| 错误路径 | 断网或返回 error 事件 | 错误卡片纯文本显示，可复制、可点赞点踩 |

### 6.3 性能验证（对比优化效果）

Chromium DevTools → Performance 面板：

1. 开始录制 → 发送一条长回答问题（或用节流模拟：**CPU 6x slowdown** 效果更明显）→ 等 30s → 停止。
2. 观察打字机期间：
   - 优化前：主线程每 20ms 一大块 Scripting（60 次 markdown 解析）+ Layout/Paint 连片 → 掉帧；
   - 优化后：每帧只有一小段（单卡片 patch），Scripting 条高下降，FPS ≈ 60。
3. 长会话（>8-10 轮）后重复录制，确认帧时延不随消息数增长。
4. 内存：DevTools → Memory 面板拍快照，多次轮次后 `tokenQueue` / 缓存 Map 无持续无界增长。

### 6.4 懒渲染专项

- 造一个 >60 条消息的会话（历史回填最方便）：顶部出现"展开更早的对话（N 条）"，点击后补充 30 条且**视口位置不跳动**，重复点可继续展开。
- 确认打字机期间不因新消息追加导致旧内容异常消失/跳动。

### 6.5 边界检查

- Windows 缩放（useCockpitScale）+ 全屏按钮后，InsightCard 仍正常四等分。
- 页面卸载/关闭弹窗时无 rAF 泄漏（DevTools Performance 里不再有持续 frame 回调）。
- 缩窄窗口宽度打字，折叠态同行预览省略号正常。

### 6.6 门槛判定

**用 CPU 6x slowdown 跑一个 10 轮会话**：优化应使同样场景基本保持流畅（对比优化前的深度卡顿）。
通过该项 + 6.2 用例全绿即视为验收通过。
