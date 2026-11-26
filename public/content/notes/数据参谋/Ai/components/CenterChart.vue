<template>
  <div class="center-chart">
    <div ref="chatMessagesRef" class="chat-messages" @scroll="onListScroll">
      <!-- 历史懒渲染：更早的消息分批展开 -->
      <div v-if="hiddenCount > 0" class="load-earlier" @click="loadEarlier">
        展开更早的对话（{{ hiddenCount }} 条）
      </div>
      <template v-for="item in visibleMessages" :key="item.id">
        <MessageCard
          :item="item"
          :is-last="item.id === lastItemId"
          :typing="isTyping"
          :streaming="isStreaming"
          :typing-html="item.id === lastItemId && isTyping ? typedHtml : ''"
          @change="onCardChange"
          @new-chat="newChat"
        />
      </template>
      <div v-if="isLoading && !lastItemCollapsedTyping" class="loading-indicator">
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-text">正在思考中...</span>
      </div>
      <div v-if="showRecommended" class="recommended-section">
        <div class="recommended-header">
          <span class="recommended-label">你可以继续问问</span>
        </div>
        <div class="recommended-list">
          <div
            v-for="(q, qIdx) in recommendedQuestions"
            :key="qIdx"
            class="recommended-item"
            @click="emit('sendQuestion', q)"
          >
            <span>{{ q }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
  import MessageCard from './MessageCard.vue';
  import { useHttpClient } from '../utils/useHttpClient';
  import {
    createMessage,
    hasPlainText,
    hasRichCard,
    isAnsXmlCached,
    makeHtml,
    type MessageInit,
    type MessageItem,
  } from '../utils/chatRender';
  import { parseTaskFinishContent } from '../utils/ansXmlParser';
  import { useUserStore } from '@/store/modules/user';

  const props = defineProps({
    plate: {
      type: String,
      default: '',
    },
  });

  const userStore = useUserStore();

  const emit = defineEmits<{
    (e: 'streaming-start'): void;
    (e: 'streaming-end'): void;
    (e: 'newChat'): void;
    (e: 'taskFinish', insights: any[]): void;
    (e: 'recommendedQuestions', questions: string[]): void;
    (e: 'sendQuestion', question: string): void;
  }>();

  // —— 消息列表：shallowRef + 整对象替换（优化8）——
  const messageList = shallowRef<MessageItem[]>([]);

  /** 当前渲染列表最后一条的 id（供子组件判定 isLast / typingHtml 传递） */
  const lastItemId = computed(() => messageList.value[messageList.value.length - 1]?.id ?? '');

  function setMessages(messages: MessageInit[]) {
    // 历史记录已有结论，思考过程默认折叠
    messageList.value = messages.map((item) =>
      item.type === 'question' && !!item.message && !isAnsXmlCached(item.message)
        ? createMessage({ ...item, collapsed: item.collapsed ?? true })
        : createMessage(item),
    );
    renderLimit.value = Math.min(messageList.value.length, RENDER_LIMIT_INIT);
    recommendedQuestions.value = [];
    // 内容整体替换后刷新贴底标记：回填的长历史停在顶部时不应被后续流自动滚走（行为与旧版一致）
    nextTick(() => {
      stickBottom.value = isAtBottom();
    });
  }

  function appendMessage(init: MessageInit) {
    const created = createMessage(init);
    messageList.value = [...messageList.value, created];
    return created;
  }

  function updateItemById(id: string, patch: Partial<MessageItem>) {
    messageList.value = messageList.value.map((it) => (it.id === id ? { ...it, ...patch } : it));
  }

  function onCardChange(updated: MessageItem) {
    messageList.value = messageList.value.map((it) => (it.id === updated.id ? updated : it));
  }

  const typedHtml = ref('');
  const isLoading = ref(false);
  const isStreaming = ref(false);
  const isTyping = ref(false);
  const recommendedQuestions = ref<string[]>([]);
  const hideRecommended = ref(false);
  // 本轮结论（洞察卡片）是否已到达
  const conclusionArrived = ref(false);

  const chatMessagesRef = ref<HTMLElement>();

  // —— 历史/长列表分批渲染（优化7）：初始只渲染最近一轮消息窗口 ——
  const RENDER_LIMIT_INIT = 60;
  const RENDER_BATCH = 30;
  const renderLimit = ref(RENDER_LIMIT_INIT);
  const visibleMessages = computed(() => {
    const list = messageList.value;
    if (list.length <= renderLimit.value) return list;
    // 截断点向前找到 ask 边界保证整轮不拆开
    let cutoff = list.length - renderLimit.value;
    while (cutoff > 0 && list[cutoff].type !== 'ask') cutoff--;
    return list.slice(cutoff);
  });
  const hiddenCount = computed(() =>
    Math.max(messageList.value.length - visibleMessages.value.length, 0),
  );

  function loadEarlier() {
    const el = chatMessagesRef.value;
    const beforeHeight = el?.scrollHeight ?? 0;
    const beforeTop = el?.scrollTop ?? 0;
    renderLimit.value += RENDER_BATCH;
    // 展开的是顶部内容，补偿 scrollTop 保持视口位置不动
    nextTick(() => {
      if (el) el.scrollTop = beforeTop + (el.scrollHeight - beforeHeight);
    });
  }

  // —— 打字机（rAF 驱动）：对原始 markdown 前缀整体转换渲染 ——
  // 每帧把打字指针前移批量字符，再对 message.slice(0, ptr) 做 makeHtml 全量转换。
  // 与旧的“逐 delta 独立转换（pushTokens）”相比，markdown 语法上下文始终完整：
  // 到达闭口的语法（如 **、表格分隔行）会在下一帧自动修正，而不是错误地保留到流结束。
  let typingTargetId = '';
  let typingPtr = 0;
  let typingRaf: number | null = null;
  let loadingTimer: number | null = null;
  let lastTickMs = 0;

  const TYPE_INTERVAL = 20;
  // 每帧吐出的字符数：积压越多打得越快，短文案保持逐字观感
  const TYPE_BATCH_MIN = 1;
  const TYPE_BATCH_MAX = 12;
  // 单帧最多追赶的批次，避免长时间卡顿后一次性追帧造成卡死
  const MAX_CATCH_UP_STEPS = 6;

  /** 打字机的目标消息（shallowRef 下整对象替换后，只能按 id 重新解析） */
  function getTypingTarget(): MessageItem | undefined {
    if (!typingTargetId) return undefined;
    return messageList.value.find((it) => it.id === typingTargetId);
  }

  /** 目标消息的原始 markdown 是否还有未打出的 backlog */
  function hasTypingBacklog(): boolean {
    const target = getTypingTarget();
    return !!target && typingPtr < target.message.length;
  }

  /** 启动/续跑打字机：切换目标时从头输出该条消息；目标相同时保留指针，继续打增量 */
  function startTyping(targetId: string) {
    if (typingTargetId !== targetId) {
      // 切换打字目标：从头输出该条消息；目标相同时保留指针，继续打增量
      typingTargetId = targetId;
      typingPtr = 0;
      typedHtml.value = '';
    }
    if (typingRaf !== null) return;
    lastTickMs = 0;
    typingRaf = requestAnimationFrame(typingFrame);
  }

  function typingFrame(now: number) {
    typingRaf = null;
    if (lastTickMs <= 0) lastTickMs = now;
    // 按 20ms 步长换算本帧应处理的批次数量（rAF ≈ 16ms）
    let steps = 0;
    while (now - lastTickMs >= TYPE_INTERVAL && steps < MAX_CATCH_UP_STEPS) {
      lastTickMs += TYPE_INTERVAL;
      steps++;
    }
    if (now - lastTickMs >= TYPE_INTERVAL) {
      // 追赶超限：丢弃剩余债务
      lastTickMs = now;
    }
    if (steps > 0) {
      const target = getTypingTarget();
      if (!target) return;
      if (typingPtr < target.message.length) {
        isLoading.value = false;
        if (loadingTimer !== null) {
          clearTimeout(loadingTimer);
          loadingTimer = null;
        }
        const backlogLength = target.message.length - typingPtr;
        const batch = Math.min(
          Math.max(TYPE_BATCH_MIN, Math.ceil(backlogLength / 40)),
          TYPE_BATCH_MAX,
          backlogLength,
        );
        typingPtr += batch;
        typedHtml.value = makeHtml(target.message.slice(0, typingPtr));
      } else if (!isStreaming.value) {
        // 追平且流已结束：按完整消息做最终渲染，与打字结束后的常态渲染一致
        typedHtml.value = makeHtml(target.message);
        stopTyping();
        isTyping.value = false;
        emit('streaming-end');
        return;
      } else if (loadingTimer === null) {
        loadingTimer = window.setTimeout(() => {
          isLoading.value = true;
          loadingTimer = null;
        }, 300);
      }
    }
    typingRaf = requestAnimationFrame(typingFrame);
  }

  function stopTyping() {
    if (typingRaf !== null) {
      cancelAnimationFrame(typingRaf);
      typingRaf = null;
    }
    if (loadingTimer !== null) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
  }

  /** 立即结束打字机：不做 backlog 等待，展示完整消息的最终渲染 */
  function finalizeTyping() {
    stopTyping();
    const target = getTypingTarget();
    if (target) {
      typedHtml.value = makeHtml(target.message);
      typingPtr = target.message.length;
    }
    isTyping.value = false;
    emit('streaming-end');
    scheduleScrollToBottom();
  }

  const SCROLL_THRESHOLD = 4;

  function isAtBottom(): boolean {
    const el = chatMessagesRef.value;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
  }

  // —— 滚动跟随：scroll 事件维护“贴底”标记 ——
  const stickBottom = ref(true);

  function onListScroll() {
    stickBottom.value = isAtBottom();
  }

  function scrollToBottom() {
    const el = chatMessagesRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickBottom.value = isAtBottom();
  }

  function newChat() {
    stopTyping();
    messageList.value = [];
    typedHtml.value = '';
    typingTargetId = '';
    typingPtr = 0;
    isLoading.value = false;
    isStreaming.value = false;
    isTyping.value = false;
    recommendedQuestions.value = [];
    hideRecommended.value = false;
    conclusionArrived.value = false;
    renderLimit.value = RENDER_LIMIT_INIT;
    emit('newChat');
  }

  let stopHttpClient: () => void;
  function sendMessage(taskId: string, message: string, checkpoint: number, category: string, messageId: string) {
    // 防御性停止上一轮残留的 SSE 连接，避免迟到事件污染新会话（正常时序下连接已由服务端/上一轮结束关闭）
    stopHttpClient && stopHttpClient();
    stopTyping();
    typingTargetId = '';
    typingPtr = 0;
    typedHtml.value = '';
    recommendedQuestions.value = [];
    hideRecommended.value = false;
    conclusionArrived.value = false;

    appendMessage({ type: 'ask', message });

    isLoading.value = true;
    isStreaming.value = true;
    isTyping.value = true;
    emit('streaming-start');

    const streamPath = `/dexis-vue-service/data-agent/task/${taskId}/result/stream?checkpoint=${checkpoint}&category=${category}&plate=${props.plate}`;
    const token = userStore.getToken || '';
    const { stop } = useHttpClient(streamPath, token, (data: any) => {
      // [DONE] 标记：流结束
      if (data.done) {
        isStreaming.value = false;
        isLoading.value = false;
        if (hasTypingBacklog()) {
          hideRecommended.value = true;
        }
        return;
      }

      // content / SSE_FINISH：流结束标记
      if (data.type === 'finish') {
        isStreaming.value = false;
        isLoading.value = false;
        if (hasTypingBacklog()) {
          hideRecommended.value = true;
        }
        return;
      }

      // task_finish：任务完成，返回洞察卡片 -- 合并到最后一条 question 消息中
      if (data.type === 'task_finish') {
        const lastMessageItem = messageList.value[messageList.value.length - 1];
        const lastQuestion = findLastQuestion();
        const needsNewQuestion = !lastQuestion || lastMessageItem?.type === 'ask';
        if (data.insights) {
          if (!needsNewQuestion && lastQuestion) {
            updateItemById(lastQuestion.id, { insights: data.insights });
          } else {
            appendMessage({ type: 'question', message: '', insights: data.insights, messageId });
          }
          conclusionArrived.value = true;
          maybeCollapseThinking();
          emit('taskFinish', data.insights);
        } else if (data.content) {
          const insights = parseTaskFinishContent(data.content);
          if (insights.length) {
            if (!needsNewQuestion && lastQuestion) {
              updateItemById(lastQuestion.id, { insights });
            } else {
              appendMessage({ type: 'question', message: '', insights, messageId });
            }
            conclusionArrived.value = true;
            maybeCollapseThinking();
            emit('taskFinish', insights);
          }
        }
        return;
      }

      // recommended_question：推荐追问
      if (data.type === 'recommended_question') {
        if (hideRecommended.value) return;
        let questions: string[] = [];
        if (data.questions && Array.isArray(data.questions)) {
          questions = data.questions;
        } else if (data.content) {
          try {
            const parsed = JSON.parse(data.content);
            if (parsed.questions && Array.isArray(parsed.questions)) {
              questions = parsed.questions;
            }
          } catch { /* ignore */ }
        }
        recommendedQuestions.value = questions;
        emit('recommendedQuestions', questions);
        return;
      }

      // agent_reply：Agent 确认收到消息（文字小提示）
      if (data.type === 'agent_reply') {
        if (data.content) {
          appendMessage({ type: 'status', message: data.content });
        }
        return;
      }

      // gateway_reply：网关确认（文字小提示）
      if (data.type === 'gateway_reply') {
        if (data.content) {
          appendMessage({ type: 'status', message: data.content });
        }
        return;
      }

      // llm：LLM 文本流（delta 逐字流 / data 整段推送）
      if (data.type === 'llm' && data.content) {
        const lastItem = messageList.value[messageList.value.length - 1];
        const isDataEvent = data.event_type === 'data';

        // 没有可续写的 question（首条，或上一条是用户提问）时新建一条
        if (!lastItem || lastItem.type !== 'question' || hasRichCard(lastItem)) {
          // 思考过程默认折叠展示
          const created = appendMessage({ type: 'question', message: data.content, messageId, collapsed: true });
          startTyping(created.id);
          return;
        }

        // "data" 事件是整段推送：可能是重复段、累积快照或全新一段
        if (isDataEvent) {
          const delta = getDataEventDelta(lastItem.message, data.content);
          if (delta === null) return;
          // shallowRef：raw 对象原地追加不影响展示（展示由打字机前缀渲染驱动）
          lastItem.message += (delta.newLine ? '\n' : '') + delta.text;
          startTyping(lastItem.id);
          return;
        }

        // "delta" 事件是逐字增量：直接拼接
        lastItem.message += data.content;
        startTyping(lastItem.id);
        return;
      }

      // 兼容旧格式（error 或纯 content 文本）
      if (data.error) {
        appendMessage({ type: 'question', message: data.error, messageId, isError: true });
        return;
      }

    });
    stopHttpClient = stop;
  }

  // —— rAF 版滚动到底（代替 setTimeout + 同步布局读取）——
  let scrollRaf: number | null = null;

  function scheduleScrollToBottom() {
    if (scrollRaf !== null) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      scrollToBottom();
    });
  }

  function findLastQuestion(): MessageItem | null {
    const list = messageList.value;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].type === 'question') {
        return list[i];
      }
    }
    return null;
  }

  /**
   * llm 的 "data" 事件是整段推送，可能有三种形态，需要区分出真正要追加的内容：
   * 1. 累积快照（本次内容以已有内容开头）—— 只追加尾部增量，不换行
   * 2. 与末尾完全重复（服务端重复推送同一段状态）—— 跳过
   * 3. 全新一段（如上一轮"正在选取工具"后新一轮的状态）—— 换行追加
   * @returns null 表示跳过；text 为纯追加文本（不含换行符）
   */
  function getDataEventDelta(
    existing: string,
    content: string,
  ): { text: string; newLine: boolean } | null {
    if (!content) return null;
    if (!existing) return { text: content, newLine: false };
    if (existing === content) return null;
    // 累积快照
    if (content.startsWith(existing)) {
      return { text: content.slice(existing.length), newLine: false };
    }
    // 末尾重复
    if (existing.endsWith(content)) return null;
    return { text: content, newLine: true };
  }

  // 结论出来以后，思考过程（卡片一）默认折叠；用户手动展开/折叠过的不再覆盖
  function collapseThinking() {
    // 只处理本轮（最后一条用户提问之后）的消息
    const list = messageList.value;
    let start = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].type === 'ask') {
        start = i + 1;
        break;
      }
    }
    let changed = false;
    const next = list.map((item, i) => {
      if (i >= start && item.type === 'question' && hasPlainText(item) && item.collapsed === undefined) {
        changed = true;
        return { ...item, collapsed: true };
      }
      return item;
    });
    if (changed) {
      messageList.value = next;
    }
  }

  // 结论（洞察卡片）已到达，等打字机结束后折叠思考过程
  function maybeCollapseThinking() {
    if (!conclusionArrived.value || isStreaming.value || isTyping.value) return;
    collapseThinking();
  }

  watch(
    () => messageList.value.length,
    () => {
      if (stickBottom.value) {
        nextTick(() => scheduleScrollToBottom());
      }
    },
  );

  watch(typedHtml, () => {
    if (stickBottom.value) {
      nextTick(() => scheduleScrollToBottom());
    }
  });

  watch(isLoading, (val) => {
    // llm 输出过程中 loading 再次出现时，自动滚到底部，否则看不到 loading 效果
    if (val && (isStreaming.value || isTyping.value) && stickBottom.value) {
      nextTick(() => scheduleScrollToBottom());
    }
  });

  watch(isStreaming, (val) => {
    // 流结束且打字机没有 backlog 时立即收尾；有 backlog 则由 typingFrame 追平后自行收尾
    if (!val && !hasTypingBacklog()) {
      finalizeTyping();
    }
  });

  // 打字机结束时，若结论已到达则折叠思考过程
  watch(isTyping, (val) => {
    if (!val) maybeCollapseThinking();
  });

  const showRecommended = computed(() =>
    recommendedQuestions.value.length > 0 && !isStreaming.value && !isTyping.value && !hideRecommended.value,
  );

  watch(showRecommended, (val) => {
    if (val && stickBottom.value) {
      nextTick(() => scheduleScrollToBottom());
    }
  });

  // 请求中且最后一条思考过程被折叠时，不再展示底部的 loading-indicator（改为同行展示）
  const lastItemCollapsedTyping = computed(() => {
    const list = messageList.value;
    const lastItem = list[list.length - 1];
    return !!lastItem && !!lastItem.collapsed && isTyping.value && hasPlainText(lastItem);
  });

  onBeforeUnmount(() => {
    stopTyping();
    stopHttpClient && stopHttpClient();
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  });

  defineExpose({ sendMessage, setMessages });
</script>

<style scoped lang="scss">
  .center-chart {
    display: flex;
    flex-direction: column;
    width: calc(100% - 32px);
    height: 100%;
    margin: 0 16px;
  }

  .chat-messages {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
    border-radius: 8px 8px 0 0;
    gap: 16px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .load-earlier {
    align-self: center;
    padding: 6px 14px;
    border-radius: 8px;
    background: #eef3fa;
    color: #4f81bd;
    font-size: 12px;
    font-family: var(--font-family-regular);
    cursor: pointer;
    transition: background 0.15s ease;

    &:hover {
      background: #dce6f0;
    }
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }

  .loading-dot {
    width: 6px;
    height: 6px;
    animation: loadingBounce 1.4s infinite ease-in-out both;
    border-radius: 50%;
    background: #4a90d9;

    &:nth-child(1) {
      animation-delay: 0s;
    }

    &:nth-child(2) {
      animation-delay: 0.16s;
    }

    &:nth-child(3) {
      animation-delay: 0.32s;
    }
  }

  .loading-text {
    margin-left: 6px;
    color: #888;
    font-size: 13px;
  }

  .recommended-section {
    flex-shrink: 0;
    padding: 0 4px 16px;
  }

  .recommended-header {
    margin-bottom: 8px;
  }

  .recommended-label {
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 14px;
  }

  .recommended-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .recommended-item {
    display: flex;
    align-items: flex-start;
    padding: 8px 14px;
    transition: background 0.15s ease;
    border-radius: 8px;
    background: #eef3fa;
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 14px;
    line-height: 1.5;
    cursor: pointer;

    &:hover {
      background: #dce6f0;
    }
  }

  @keyframes loadingBounce {
    0%,
    80%,
    100% {
      transform: scale(0.4);
      opacity: 0.4;
    }

    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
