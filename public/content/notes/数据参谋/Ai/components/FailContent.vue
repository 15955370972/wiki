<template>
  <div ref="rootRef" class="fail-content">
    <div class="fail-content-header">
      <img :src="dislikeCurrent" class="fail-content-icon" alt="dislike" />
      <span class="fail-content-title">踩了一下，您有什么建议吗？</span>
      <img
        :src="hasContent ? sendWithMsg : sendNoMsg"
        class="fail-content-send"
        :class="{ 'is-disabled': !hasContent }"
        alt="send"
        @click="handleSend"
      />
    </div>
    <textarea
      v-model="feedbackContent"
      class="fail-content-input"
      placeholder="请输入您的建议"
      @keydown.enter.exact.prevent="handleSend"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
  import dislikeCurrent from '../images/dislike-ok.svg';
  import sendNoMsg from '../images/send-no-msg.png';
  import sendWithMsg from '../images/send-with-msg.png';

  const emit = defineEmits<{
    (e: 'send', feedbackContent: string): void;
    (e: 'close'): void;
  }>();

  const rootRef = ref<HTMLElement>();
  const feedbackContent = ref('');
  defineExpose({
    setContent(content: string) {
      feedbackContent.value = content;
    }
  });

  const hasContent = computed(() => feedbackContent.value.trim().length > 0);

  function handleSend() {
    if (!hasContent.value) return;
    emit('send', feedbackContent.value.trim());
    emit('close');
  }

  function handleClickOutside(e: MouseEvent) {
    if (!rootRef.value) return;
    if (rootRef.value.contains(e.target as Node)) return;
    emit('close');
  }

  let bindTimer: ReturnType<typeof setTimeout> | null = null;

  onMounted(() => {
    // 延迟绑定，避免触发弹框的那次点击立即关闭弹框
    bindTimer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      bindTimer = null;
    }, 0);
  });

  onBeforeUnmount(() => {
    if (bindTimer) clearTimeout(bindTimer);
    document.removeEventListener('click', handleClickOutside);
  });
</script>

<style scoped lang="scss">
  .fail-content {
    width: 100%;
    border: 1px solid #cfe0f5;
    box-shadow: 0 4px 12px #4F81BD33;
    border-radius: 8px;
    background: #fff;
  }

  .fail-content-header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid #e6eef8;
    gap: 8px;
  }

  .fail-content-icon {
    width: 16px;
    height: 16px;
  }

  .fail-content-title {
    flex: 1;
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 14px;
    line-height: 1.5;
  }

  .fail-content-send {
    width: 18px;
    height: 18px;
    cursor: pointer;

    &.is-disabled {
      cursor: not-allowed;
    }
  }

  .fail-content-input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 72px;
    padding: 10px 14px;
    border: none;
    outline: none;
    background: transparent;
    color: #1a3050;
    font-family: var(--font-family-regular);
    font-size: 14px;
    line-height: 1.6;
    resize: none;

    &::placeholder {
      color: #a9bcd4;
    }
  }
</style>
