<template>
  <teleport to="body">
    <div v-if="visible" class="cockpit-dialog" :style="scaleStyle">
      <div class="cockpit-dialog__mask"></div>
      <div class="cockpit-dialog__center" @click.self="handleCancel">
        <div class="cockpit-dialog__content" :style="contentStyle" @click.stop>
          <div class="cockpit-dialog__header">
            <span class="cockpit-dialog__title">{{ title }}</span>
            <span class="cockpit-dialog__close" @click="handleCancel">×</span>
          </div>
          <div class="cockpit-dialog__body">
            <slot></slot>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, watch } from 'vue';
  import { useCockpitScale } from '@/hooks/web/useCockpitScale';

  defineOptions({ name: 'CockpitDialog' });

  const props = defineProps({
    visible: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: '',
    },
    width: {
      type: [Number, String],
      default: 1200,
    },
  });

  const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (e: 'cancel'): void;
  }>();

  const { scaleStyle, updateScale } = useCockpitScale({
    scaleContainerSelector: '.width-scale-container__screen',
    cssVariableName: '--cockpit-dialog-scale',
    designWidth: 1920,
  });

  const contentStyle = computed(() => ({
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  }));

  watch(
    () => props.visible,
    (visible) => {
      if (!visible) return;
      nextTick(updateScale);
    },
  );

  function handleCancel() {
    emit('update:visible', false);
    emit('cancel');
  }
</script>

<style scoped lang="scss">
  /* stylelint-disable-next-line keyframes-name-pattern */
  @keyframes cockpitDialogFadeIn {
    from {
      transform: translateY(-8px) scale(var(--cockpit-dialog-scale, 1));
      opacity: 0;
    }

    to {
      transform: translateY(0) scale(var(--cockpit-dialog-scale, 1));
      opacity: 1;
    }
  }

  .cockpit-dialog {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .cockpit-dialog__mask {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 45%);
    backdrop-filter: blur(2px);
  }

  // 遮罩范围内的滚动容器：内容（含标题栏）整体超出屏幕时在此滚动，
  // margin: auto 0（配合 .cockpit-dialog__content 的 auto 外边距）实现
  // “能放下则垂直居中，放不下则从顶部开始、可上下滚动”的效果。
  .cockpit-dialog__center {
    display: flex;
    position: absolute;
    inset: 0;
    flex-direction: column;
    align-items: center;
    overflow: auto;
    padding: 48px 0;
  }

  .cockpit-dialog__content {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    margin: auto 0;
    transform: scale(var(--cockpit-dialog-scale, 1));
    transform-origin: center center;
    animation: cockpitDialogFadeIn 0.3s ease;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 4px 20px rgb(0 0 0 / 15%);
  }

  .cockpit-dialog__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 12px 0 24px;
    border-bottom: 1px solid #e5eaf3;
  }

  .cockpit-dialog__title {
    color: #1a1a38;
    font-family: var(--cockpit-font-family-medium, MiSans-Medium, sans-serif);
    font-size: 16px;
    font-weight: 600;
  }

  .cockpit-dialog__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: color 0.3s;
    color: #9797b5;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .cockpit-dialog__close:hover {
    color: #1d82e6;
  }

  .cockpit-dialog__body {
    flex: 1 1 auto;
    padding: 16px 24px 24px;
  }

  .cockpit-dialog__center::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .cockpit-dialog__center::-webkit-scrollbar-track {
    border-radius: 3px;
    background: #f1f1f1;
  }

  .cockpit-dialog__center::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: #ccc;
  }

  .cockpit-dialog__center::-webkit-scrollbar-thumb:hover {
    background: #999;
  }
</style>
