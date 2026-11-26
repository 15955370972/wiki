<!--
  HeaderChart（AI 弹窗头部）
  ==========================
  布局：单行 flex（高度 60px）
  - 左侧：avatar 图标 + 标题"你好，我是控股数据参谋"
  交互：纯受控，title 通过 props 传入
  （全屏/关闭控件已抽到父组件 index.vue 右上角共用）
-->
<template>
  <div class="header-chart">
    <!-- 左侧：图标 + 标题 -->
    <div class="header-chart__left">
      <img :src="aiIcon" class="header-chart__avatar" alt="avatar" />
      <span class="header-chart__title">{{ title }}</span>
    </div>

    <!-- 右侧：全屏 + 关闭 已抽到父组件 index.vue 右上角共用，此处仅保留左侧 -->
  </div>
</template>

<script setup lang="ts">
  import aiIcon from '../images/core/ai.png';

  defineOptions({
    name: 'HeaderChart',
  });

  withDefaults(
    defineProps<{
      /** 中间标题文案 */
      title?: string;
    }>(),
    {
      title: '你好，我是控股数据参谋~',
    },
  );
</script>

<style scoped lang="scss">
  .header-chart {
    display: flex;
    box-sizing: border-box;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    padding: 0 20px;
    background: #e4ecfa;

    &__left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    &__avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
    }

    &__title {
      color: #004567;
      font-family: MiSans-Medium;
      font-size: 16px;
      font-weight: 500;
      line-height: 22px;
    }

    &__right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    &__icon {
      width: 20px;
      height: 20px;
      transition: opacity 0.15s ease;
      cursor: pointer;

      // hover / active 视觉高亮
      &.is-hover,
      &.is-active {
        opacity: 0.8;
      }

      &.is-active {
        // active 态更强反馈
        opacity: 1;
      }

      &:hover {
        opacity: 0.8;
      }
    }
  }
</style>
