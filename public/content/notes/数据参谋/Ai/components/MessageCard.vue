<template>
  <!-- 用户提问 -->
  <div v-if="item.type === 'ask'" class="message message-user">
    <div class="message-bubble message-bubble-user">{{ item.message }}</div>
  </div>

  <!-- 状态提示 -->
  <div v-else-if="item.type === 'status'" class="message message-status">
    <div class="message-status-text">{{ item.message }}</div>
  </div>

  <template v-else>
    <!-- 卡片一：纯文本回答，打字机输出，支持复制，不支持点赞点踩，支持折叠展开 -->
    <div v-if="isPlain" class="message message-ai">
      <div class="message-card message-card-thinking">
        <div class="thinking-header" @click="toggleCollapse">
          <div class="thinking-header-main">
            <template v-if="isCollapsedTyping">
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="thinking-title">{{ thinkingTitle }}</span>
              <span class="thinking-inline-text">{{ inlinePreview }}</span>
            </template>
            <span v-else class="thinking-title">{{ thinkingTitle }}</span>
          </div>
          <i class="thinking-arrow" :class="{ 'is-collapsed': item.collapsed }"></i>
        </div>
        <div v-show="!item.collapsed" class="message-text" v-html="plainHtml"></div>
      </div>
    </div>
    <div v-if="isPlain && showActions" class="message-actions-bar">
      <div class="message-actions-left">
        <img
          :src="copyIcon"
          class="action-icon-img"
          :class="{ 'is-active': activeCopy }"
          alt="copy"
          @mouseenter="hoverCopy = true"
          @mouseleave="hoverCopy = false"
          @click="copyTextStr(item.message)"
        />
      </div>
      <div class="message-actions-right">
        <button v-if="!hasInsights" class="action-btn" @click="emit('new-chat')">
          <img :src="newChatIcon" class="action-btn-icon" alt="" />
          新对话
        </button>
      </div>
    </div>

    <!-- 卡片二：错误信息，纯文本展示，支持复制，支持点赞点踩 -->
    <div v-if="isErrorCard" class="message message-ai">
      <div class="message-card">
        <div class="message-text message-text-plain">{{ item.message }}</div>
      </div>
    </div>
    <div v-if="isErrorCard && showActions" class="message-actions-bar">
      <div class="message-actions-left">
        <img
          :src="copyIcon"
          class="action-icon-img"
          :class="{ 'is-active': activeCopy }"
          alt="copy"
          @mouseenter="hoverCopy = true"
          @mouseleave="hoverCopy = false"
          @click="copyTextStr(item.message)"
        />
        <img
          :src="likeIcon"
          class="action-icon-img"
          :class="{ 'is-active': isActiveLike }"
          alt="like"
          @mouseenter="hoverLike = true"
          @mouseleave="hoverLike = false"
          @click="handleFeedback('like')"
        />
        <img
          :src="dislikeIcon"
          class="action-icon-img"
          :class="{ 'is-active': isActiveDislike }"
          alt="dislike"
          @click.stop="handleFeedback('dislike')"
        />
      </div>
      <div class="message-actions-right">
        <button class="action-btn" @click="emit('new-chat')">
          <img :src="newChatIcon" class="action-btn-icon" alt="" />
          新对话
        </button>
      </div>
    </div>
    <div v-if="showFailPanel && item.feedback === 'dislike'" class="message-feedback-panel">
      <FailContent
        ref="failContentRef"
        @send="handleFeedbackContent"
        @close="showFailPanel = false"
      />
    </div>

    <!-- 卡片二：结构化回答 / 洞察卡片，非纯文本无法复制，支持点赞点踩 -->
    <div v-if="isRich" class="message message-ai">
      <div class="message-card">
        <div v-if="item.message && messageIsAnsXml" class="message-text">
          <AnsCard :content="item.message" />
        </div>
        <div v-if="item.insights && item.insights.length" class="message-text">
          <InsightCard :insights="item.insights" />
        </div>
      </div>
    </div>
    <div v-if="isRich && showActions" class="message-actions-bar">
      <div class="message-actions-left">
        <img
          :src="likeIcon"
          class="action-icon-img"
          :class="{ 'is-active': isActiveLike }"
          alt="like"
          @mouseenter="hoverLike = true"
          @mouseleave="hoverLike = false"
          @click="handleFeedback('like')"
        />
        <img
          :src="dislikeIcon"
          class="action-icon-img"
          :class="{ 'is-active': isActiveDislike }"
          alt="dislike"
          @click.stop="handleFeedback('dislike')"
        />
        <img
          v-if="false"
          :src="shareIcon"
          class="action-icon-img"
          :class="{ 'is-active': activeShare }"
          alt="share"
          @mouseenter="hoverShare = true"
          @mouseleave="hoverShare = false"
          @click="activeShare = !activeShare"
        />
      </div>
      <div class="message-actions-right">
        <button class="action-btn" v-if="false">
          <img :src="regenerateIcon" class="action-btn-icon" alt="" />
          重新生成
        </button>
        <button class="action-btn" v-if="false">
          <img :src="continueIcon" class="action-btn-icon" alt="" />
          继续对话
        </button>
        <button class="action-btn" @click="emit('new-chat')">
          <img :src="newChatIcon" class="action-btn-icon" alt="" />
          新对话
        </button>
      </div>
    </div>
    <div v-if="showFailPanel && isRich && item.feedback === 'dislike'" class="message-feedback-panel">
      <FailContent
        ref="failContentRef"
        @send="handleFeedbackContent"
        @close="showFailPanel = false"
      />
    </div>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref, nextTick } from 'vue';
  import copyDefault from '../images/core/default-copy.svg';
  import copyCurrent from '../images/core/current-copy.svg';
  import likeDefault from '../images/like-cancel.svg';
  import likeCurrent from '../images/like-ok.svg';
  import dislikeDefault from '../images/dislike-cancel.svg';
  import dislikeCurrent from '../images/dislike-ok.svg';
  import shareDefault from '../images/core/default-share.svg';
  import shareCurrent from '../images/core/current-share.svg';
  import regenerateIcon from '../images/core/regenerate.svg';
  import continueIcon from '../images/core/continue.svg';
  import newChatIcon from '../images/core/new-chat.svg';
  import AnsCard from './AnsCard.vue';
  import InsightCard from './InsightCard.vue';
  import FailContent from './FailContent.vue';
  import {
    getLastLineText,
    hasPlainText,
    hasRichCard,
    isAnsXmlCached,
    makeHtmlCached,
    type MessageItem,
  } from '../utils/chatRender';
  import { copyText } from '@/utils/copyTextToClipboard';
  import { submitFeedback } from '@/api/ai';
  import { message } from 'ant-design-vue';

  const props = defineProps<{
    item: MessageItem;
    /** 是否为列表最后一条（流式/打字中的目标卡片） */
    isLast?: boolean;
    /** 打字机输出中 */
    typing?: boolean;
    /** 请求流传输中 */
    streaming?: boolean;
    /** 打字机当前正文的 html（仅 streaming 卡片有效） */
    typingHtml?: string;
  }>();

  const emit = defineEmits<{
    /** 单条消息内部状态变化（feedback/collapsed 等），交回父层整对象替换 */
    (e: 'change', item: MessageItem): void;
    (e: 'new-chat'): void;
  }>();

  // —— 卡片类型判定（都用缓存结果，开销极小）——
  const isPlain = computed(() => hasPlainText(props.item));
  const isRich = computed(() => props.item.type === 'question' && hasRichCard(props.item));
  const messageIsAnsXml = computed(() => !!props.item.message && isAnsXmlCached(props.item.message));
  const isErrorCard = computed(() => !!props.item.isError);
  const hasInsights = computed(() => !!props.item.insights?.length);

  /** 流式/打字输出中的最后一条消息不展示操作栏 */
  const showActions = computed(
    () => !props.isLast || (!props.streaming && !props.typing),
  );

  // —— 卡片一：展示 html（历史消息走缓存）——
  const plainHtml = computed(() => {
    if (props.isLast && props.typing) return props.typingHtml || '';
    return makeHtmlCached(props.item.message);
  });

  const thinkingTitle = computed(() =>
    props.isLast && props.typing ? '思考中…' : '思考过程',
  );

  const isCollapsedTyping = computed(
    () => props.isLast && !!props.typing && !!props.item.collapsed,
  );

  /** 折叠态下同行展示的打字机预览文案：仅展示最后一行，超出部分由样式截断省略 */
  const inlinePreview = computed(() =>
    isCollapsedTyping.value ? getLastLineText(props.typingHtml || '') : '',
  );

  // —— 图标态 ——
  const hoverCopy = ref(false);
  const hoverLike = ref(false);
  const hoverShare = ref(false);
  const activeCopy = ref(false);
  const activeShare = ref(false);
  const copyIcon = computed(() =>
    hoverCopy.value || activeCopy.value ? copyCurrent : copyDefault,
  );
  const isActiveLike = computed(() => props.item.feedback === 'like');
  const isActiveDislike = computed(() => props.item.feedback === 'dislike');
  const likeIcon = computed(() =>
    isActiveLike.value ? likeCurrent : likeDefault,
  );
  const dislikeIcon = computed(() =>
    isActiveDislike.value ? dislikeCurrent : dislikeDefault,
  );
  const shareIcon = computed(() =>
    hoverShare.value || activeShare.value ? shareCurrent : shareDefault,
  );

  function copyTextStr(text: string) {
    copyText(text, '复制文本成功');
  }

  // —— 折叠 / 反馈：通过 change 事件交回父层整对象替换（配合 shallowRef）——
  function toggleCollapse() {
    emit('change', { ...props.item, collapsed: !props.item.collapsed });
  }

  const failContentRef = ref<{ setContent: (content: string) => void } | null>(null);
  const showFailPanel = ref(false);

  function handleFeedback(kind: 'like' | 'dislike') {
    const item = props.item;
    let next: string;
    if (item.feedback === kind) next = '';
    else if (item.feedback === 'like') next = 'dislike';
    else if (item.feedback === 'dislike') next = 'like';
    else next = kind;
    const updated: MessageItem = { ...item, feedback: next };
    // 点踩且当前为踩中状态时展示建议弹框
    if (kind === 'dislike' && next === 'dislike') {
      showFailPanel.value = true;
      nextTick(() => {
        failContentRef.value?.setContent(updated.feedbackContent || '');
      });
    } else {
      showFailPanel.value = false;
    }
    emit('change', updated);
    if (kind === 'like' || !next) {
      submitFeedbackMsg(next);
    }
  }

  function submitFeedbackMsg(feedback: string) {
    submitFeedback({
      messageId: props.item.messageId!,
      feedback: feedback || 'none',
      feedbackContent: props.item.feedbackContent || '',
    }).then((res) => {
      if (res.code === 200) {
        message.success(
          feedback === 'like' ? '点赞成功' : feedback === 'dislike' ? '点踩成功' : '取消成功',
        );
      }
    });
  }

  function handleFeedbackContent(feedbackContent: string) {
    emit('change', { ...props.item, feedbackContent });
    submitFeedbackMsg('dislike');
  }
</script>

<style scoped lang="scss">
  .message {
    display: flex;
  }

  .message-user {
    justify-content: flex-end;
  }

  .message-ai {
    justify-content: flex-start;
  }

  .message-status {
    justify-content: center;
  }

  .message-status-text {
    padding: 6px 14px;
    border-radius: 4px;
    background: #F2F8FF;
    color: #BDD2EB;
    font-size: 12px;
    line-height: 1.5;
  }

  .message-bubble-user {
    // 气泡宽度随内容撑开（不强制占满），最多到 80%，靠右对齐
    flex: 0 0 auto;
    width: fit-content;
    max-width: 80%;
    padding: 10px 16px;
    border-radius: 12px 12px 4px;
    background: #4a90d9;
    color: #fff;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .message-card {
    width: 100%;
    padding: 18px 20px;
    border-radius: 10px;
    background: #eef3fa;
  }

  // 卡片一：思考过程卡片
  .message-card-thinking {
    background: #f9f9f9;

    .thinking-title {
      color: #004567;
    }

    .message-text {
      color: #4f81bd;

      :deep(h2),
      :deep(strong),
      :deep(th) {
        color: #4f81bd;
      }
    }
  }

  .thinking-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #4f81bd;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    cursor: pointer;
    user-select: none;
    gap: 8px;

    + .message-text {
      margin-top: 12px;
    }
  }

  .thinking-header-main {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    gap: 4px;

    .thinking-title {
      flex-shrink: 0;
    }

    .loading-dot {
      width: 4px;
      height: 4px;
    }
  }

  .thinking-inline-text {
    flex: 1;
    overflow: hidden;
    color: #8a9bb0;
    font-weight: 400;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .thinking-arrow {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 8px;
    height: 8px;
    margin-top: 3px;
    transform: rotate(-135deg);
    transition: transform 0.2s ease;
    border-right: 1.5px solid #4f81bd;
    border-bottom: 1.5px solid #4f81bd;

    &.is-collapsed {
      margin-top: -3px;
      transform: rotate(45deg);
    }
  }

  .message-text {
    color: #1e3a5f;
    font-size: 14px;
    line-height: 2;

    &.message-text-plain {
      white-space: pre-wrap;
      word-break: break-word;
    }

    :deep(h2) {
      margin: 0 0 14px;
      color: #1a3050;
      font-size: 16px;
      font-weight: 700;
    }

    :deep(p) {
      margin: 0 0 14px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    :deep(table) {
      width: 100%;
      margin: 12px 0;
      border-collapse: collapse;
      font-size: 13px;

      th,
      td {
        padding: 8px 12px;
        border: 1px solid #d0d8e0;
        text-align: left;
      }

      th {
        background: #dce6f0;
        color: #1a3050;
        font-weight: 600;
      }

      td {
        background: #fff;
      }
    }

    :deep(img) {
      max-width: 100%;
      margin: 10px 0;
      border-radius: 6px;
    }

    :deep(ul),
    :deep(ol) {
      margin: 10px 0;
      padding-left: 20px;

      li {
        margin-bottom: 4px;
      }
    }

    :deep(blockquote) {
      margin: 14px 0;
      padding: 10px 14px;
      border-left: 4px solid #4a90d9;
      border-radius: 0 6px 6px 0;
      background: #dce6f0;

      p {
        margin: 0;
      }
    }

    :deep(strong) {
      color: #1a3050;
    }
  }

  .message-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
  }

  .message-actions-left {
    display: flex;
    gap: 12px;
  }

  .action-icon-img {
    width: 16px;
    height: 16px;
    transition: opacity 0.15s ease;
    cursor: pointer;

    &.is-active {
      opacity: 1;
    }
  }

  .message-actions-right {
    display: flex;
    gap: 6px;
  }

  .message-feedback-panel {
    padding: 0 4px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: none;
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
    gap: 4px;

    &:hover {
      background: #eee;
    }
  }

  .action-btn-icon {
    width: 14px;
    height: 14px;
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
