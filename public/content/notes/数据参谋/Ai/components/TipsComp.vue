<!--
  TipsComp（AI 弹窗"未开始"占位：含顶部 header）
  ================================================
  布局：垂直堆叠
  - 顶部 header（高度 60px）：左侧 avatar + 标题，右侧 全屏图标 + 关闭按钮
  - 主体：原有 tips 内容（bg 图层 + 问候 + 试试问题列表）
  交互：纯受控
  - props.fullScreen 控制右上角图标状态
  - emit('update:fullScreen') 回传全屏切换
  - emit('close') 关闭按钮
-->
<template>
  <div class="tips-box">
    <!-- 装饰图标：作为 tips-box 直接子元素，占住顶部左侧，不被 body 裁剪，层级最高 -->
    <img
      src="../images/icon-fixed.png"
      alt=""
      class="tips-icon"
      :class="{ 'tips-icon--fullscreen': fullScreen }"
    />
    <!-- 主体：原有 tips 装饰图 + 问候 + 试试问题 -->
    <div class="tips-body">
      <img src="../images/bg-bottom.png" alt="" class="tips-bg-bottom" />
      <img src="../images/bg-top.png" alt="" class="tips-bg-top" />
      <div class="tips-content">
        <div class="tips-greeting">
          <div class="tips-greeting-title">你好，我是控股数据参谋~</div>
          <div class="tips-greeting-sub">你可以问我任何问题</div>
        </div>
      </div>
    </div>
    <div class="tips-questions-wrap" v-if="questions.length">
      <div class="tips-header">
        <span class="tips-header-label">你可以试试</span>
        <button class="tips-refresh" @click="setQuestions" v-if="isCutNum">
          <img src="../images/core/refresh.png" class="tips-refresh-icon" alt="" />
          换一批
        </button>
      </div>
      <div class="tips-questions">
        <div class="tips-question" v-for="q in questions" :key="q" @click="onSend(q)">
          <img :src="starIcon" class="tips-question-icon" alt="" />
          <span>{{ q }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import starIcon from '../images/core/star.svg';
  // import bgTopImg from '../images/bg-top.png';
  // import screenfullBg from '../images/core/screenfullbg.png';
  import { ref } from 'vue';
  import { queryTipsQuestions } from '@/api/ai';

  const props = defineProps<{
    /** 是否全屏（受控），全屏时内容宽度与 CenterChart 对齐 */
    fullScreen?: boolean;
    /** 问题基础参数 */
    questionsBase: {
      category: string;
      plate: string;
      count: number;
    };
  }>();

  const questions = ref<string[]>([]);
  const offset = ref(0);
  const isCutNum = ref(false);
  function setQuestions() {
    queryTipsQuestions({
      offset: offset.value,
      ...props.questionsBase,
    }).then((res) => {
      questions.value = res.data?.questions || [];
      offset.value = res.data?.nextOffset || 0;
      isCutNum.value = res.data?.total > props.questionsBase.count;
    });
  }

  function onSend(q: string) {
    emit('send', q);
  }

  const emit = defineEmits(['send']);

  defineExpose({
    setQuestions() {
      offset.value = 0;
      setQuestions();
    },
  });
</script>

<style scoped lang="scss">
  .tips-box {
    display: flex;
    position: relative;
    box-sizing: border-box;
    flex-direction: column;
    width: calc(100% - 32px);
    height: 100%;
    margin: 0 16px;
    border-radius: 16px;
  }

  // 主体：原 tips 装饰层
  // display:flex 让 .tips-content（flex:1）有明确高度约束，问题折行时只在其内部滚动，
  // 不会撑高容器顶动上方问候/「试试」行
  .tips-body {
    display: flex;
    position: relative;
    z-index: 2;
    flex: 1;
    flex-direction: column;
    min-height: 90px;
    padding: 0 16px;
    overflow: hidden;
    border-radius: 0 0 12px 12px;
  }

  .tips-bg-bottom {
    position: absolute;
    z-index: 1;
    top: 10px;
    left: 0;
    width: 100%;
    height: auto;
  }

  .tips-bg-top {
    position: absolute;
    z-index: 2;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
  }

  // 装饰图标：思路二——层级最高（同容器内 9999 > header 1 > body 2），
  // 作为 tips-box 直接子元素显示在顶部左侧，不被 body 裁剪也不被 header 遮挡
  .tips-icon {
    position: absolute;
    z-index: 99;
    top: -28px;
    left: 10px;
    width: 88px;
    height: 88px;
    cursor: pointer;
  }

  .tips-content {
    display: flex;
    position: relative;
    z-index: 3;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 10px 24px;
  }

  .tips-greeting {
    margin: 0 0 0 130px;
    text-align: left;
  }

  // 全屏时左偏移 150px（对齐全屏背景图的装饰位置）
  .tips-greeting--fullscreen {
    margin-left: 180px;
  }

  .tips-greeting-title {
    color: #004567;
    font-family: var(--font-family-demibold);
    font-size: 18px;
    line-height: 1.3;
  }

  .tips-greeting-sub {
    margin-top: 2px;
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 14px;
    line-height: 1.3;
  }

  // 问题区域容器：tips-header + tips-questions 上下结构
  .tips-questions-wrap {
    display: flex;
    position: absolute;
    z-index: 3;
    top: 70px;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    padding: 10px 24px;
    background: #f2f8ff;
  }

  .tips-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
  }

  .tips-header-label {
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 16px;
    line-height: 1.3;
  }

  .tips-refresh {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: none;
    background: none;
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 16px;
    line-height: 1.3;
    cursor: pointer;
    gap: 4px;

    &:hover {
      opacity: 0.8;
    }
  }

  .tips-refresh-icon {
    width: 16px;
    height: 16px;
    vertical-align: middle;
  }

  .tips-questions {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    margin-top: 8px;
    overflow-y: auto;
    gap: 6px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .tips-question {
    display: flex;
    align-items: flex-start;
    padding: 7px 14px;
    border-radius: 8px;
    background: #fff;
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 16px;
    line-height: 1.4;
    cursor: pointer;
    gap: 8px;
  }

  .tips-question-icon {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
  }

  // 问题文案支持换行展示（容器高度受 flex 约束，仅内部滚动，不顶动上方行）
  .tips-question span {
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
    word-break: break-all;
  }
</style>
