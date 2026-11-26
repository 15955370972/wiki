<template>
  <Teleport to="body">
    <img
      :src="icon"
      alt="icon"
      class="icon-fixed"
      draggable="false"
      :class="{ 'is-dragging': dragging }"
      :style="iconStyle"
      @pointerdown="onIconPointerDown"
      @click="openModal"
      v-if="!visible || minimized"
    />
    <transition name="ai-minimize">
      <div
        :class="[
          'ai-modal',
          fullScreen ? 'ai-modal--fullscreen' : '',
          dragging ? 'is-dragging' : '',
        ]"
        :style="modalStyle"
        @pointerdown="onModalPointerDown"
        v-if="visible"
        v-show="!minimized"
      >
        <div class="ai-modal-content">
          <!-- 全局右上角控件：最小化 + 全屏 + 关闭（TipsComp / HeaderChart 共用，绝对定位不受内容 padding 影响） -->
          <div class="ai-header-controls">
            <!-- <img
              :src="minimizeIcon"
              class="ai-header-controls__icon"
              :class="{ 'is-active': activeMinimize }"
              alt="minimize"
              @click="toggleMinimize"
            /> -->
            <img
              :src="fullScreenIcon"
              class="ai-header-controls__icon"
              :class="{ 'is-active': activeFullscreen }"
              :alt="fullScreen ? 'exit-fullscreen' : 'enter-fullscreen'"
              @click="toggleFullscreen"
            />
            <img
              :src="closeIcon"
              class="ai-header-controls__icon"
              :class="{ 'is-active': activeClose }"
              alt="close"
              @click="toggleMinimize"
            />
            <!-- closeModal -->
          </div>

          <!-- TipsComp 未开始聊天时显示 -->
          <div class="tips-wrap" v-if="!streamingStarted">
            <TipsComp
              ref="tipsCompRef"
              @send="sendWithStr"
              :full-screen="fullScreen"
              :questions-base="questionsBase"
            />
          </div>

          <!-- HeaderChart：聊天进行中显示（高度 60px，与 TipsComp header 等高） -->
          <HeaderChart v-else />

          <div class="chat-body">
            <div class="center-chart">
              <CenterChart
                ref="centerChartRef"
                :plate="props.plate"
                @new-chat="newChat"
                @streaming-end="onStreamingEnd"
                @streaming-start="onStreamingStart"
                @send-question="sendWithStr"
              />
            </div>
            <div class="bottom-chart">
              <BottomChart
                ref="bottomChartRef"
                :plate="props.plate"
                @send="onSend"
                @toggleHistory="toggleHistory"
                @set-category="setCategoryStr"
              />
            </div>
          </div>

          <!-- 历史记录抽屉：放在 .ai-modal-content 内部，覆盖弹框本身（自动继承弹框缩放） -->
          <HistoryCard ref="historyCardRef" :plate="props.plate" v-model:visible="historyVisible" @select="onSelectHistory" />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { ComponentInternalInstance, computed, getCurrentInstance, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
  import CenterChart from '@/components/Ai/components/CenterChart.vue';
  import HistoryCard from '@/components/Ai/components/HistoryCard.vue';
  import BottomChart from '@/components/Ai/components/BottomChart.vue';
  import TipsComp from '@/components/Ai/components/TipsComp.vue';
  import HeaderChart from '@/components/Ai/components/HeaderChart.vue';
  import icon from '@/components/Ai/images/icon-fixed.png';
  import expandIcon from '@/components/Ai/images/core/expand.svg';
  import collapseIcon from '@/components/Ai/images/core/collapse.svg';
  import minimizeIcon from '@/components/Ai/images/minisize.png';
  import closeDefaultIcon from '@/components/Ai/images/core/close.svg';
  import { useCockpitScale } from '@/hooks/web/useCockpitScale';
  import { useAiDrag } from '@/components/Ai/utils/useAiDrag';
  import { cancelData, getHistoryTaskDetail, taskCancelBeacon } from '@/api/ai';
  import { useUserStore } from '@/store/modules/user';
  import { InsightItem, normalizeInsight, parseTaskFinishContent } from './utils/ansXmlParser';
import { tabCardClick } from '@/shared/cockpit';

  const taskId = ref('');
  const category = ref('');

  const userStore = useUserStore();

  function onSelectHistory(id: string, categoryStr: string) {
    taskId.value = id;
    category.value = categoryStr;
    historyVisible.value = false;
    streamingStarted.value = true;
    getHistoryTaskDetail(taskId.value).then((res) => {
      const data = res.data.data.reduce((prev, cur) => {
        if (!cur.answer) return prev.concat([
          {
            type: 'ask',
            message: cur.query
          },
        ]);
        const baseItem = {
          type: 'question',
          messageId: cur.id,
          feedback: cur.feedback,
          feedbackContent: cur.feedbackContent,
        }
        let message = {}
        let parsed: any = null
        try {
          parsed = JSON.parse(cur.answer)
        } catch {
          parsed = null
        }
        if (parsed === null || typeof parsed !== 'object') {
          message = {
            message: cur.answer,
            isError: true,
            ...baseItem
          }
        } else if (parsed.body?.error){
          message = {
            message: parsed.body.error,
            isError: true,
            ...baseItem
          }
        } else if (Array.isArray(parsed)) {
          const insights = parsed.map(normalizeInsight) as InsightItem[]
          message = {
            insights,
            ...baseItem
          }
        } else if (parsed.content) {
          const insights = parseTaskFinishContent(parsed.content);
          if (insights.length) {
            message = {
              insights,
              ...baseItem
            }
          }
        } else {
          message = {
            message: cur.answer,
            ...baseItem
          }
        }
        prev.push(...[
          {
            type: 'ask',
            message: cur.query,
          },
          message,
        ]);
        return prev;
      }, []);
      nextTick(() => {
        centerChartRef.value?.setMessages(data);
        bottomChartRef.value?.setTaskId(taskId.value, category.value);
      });
    });
  }

  function cancelActiveTaskByBeacon() {
    if (!taskId.value) return;
    taskCancelBeacon({ taskId: taskId.value, userId: userStore.getUserInfo.user.userName });
  }

  function setCategoryStr(categoryStr: string) {
    category.value = categoryStr;
    nextTick(() => {
      tipsCompRef.value?.setQuestions();
    });
  }

  function onSend(taskIdStr: string, message: string, checkpoint: number, categoryStr: string, messageId: string) {
    taskId.value = taskIdStr;
    centerChartRef.value?.sendMessage(taskIdStr, message, checkpoint, categoryStr, messageId);
  }

  function sendWithStr(q: string) {
    bottomChartRef.value?.sendMessage(q);
  }

  function onStreamingEnd() {
    bottomChartRef.value?.streamEnd();
  }

  function newChat() {
    cancelData({ taskId: taskId.value });
    taskId.value = '';
    bottomChartRef.value?.canSendFunc();
    streamingStarted.value = false;
    setCategoryStr(category.value);
  }

  const props = defineProps({
    scaleContainerSelector: {
      type: String,
      default: '.ruida-entry__viewport .width-scale-container__screen',
    },
    navSelector: {
      type: String,
      default: '.ruida-entry__navigation',
    },
    plate: {
      type: String,
      default: 'estate',
    },
  });

  const questionsBase = computed(() => {
    return {
      category: category.value,
      plate: props.plate,
      count: 3,
    };
  });

  defineOptions({ name: 'DATA_ANALYSE_AGENT' })
  const app = getCurrentInstance()

  const visible = ref(false);

  const centerChartRef = ref<InstanceType<typeof CenterChart>>();
  const bottomChartRef = ref<InstanceType<typeof BottomChart>>();
  const tipsCompRef = ref<InstanceType<typeof TipsComp>>();

  // 打字机已开始 → 隐藏 TipsComp，改用 HeaderChart
  const streamingStarted = ref(false);
  function onStreamingStart() {
    streamingStarted.value = true;
  }

  // 弹框全屏为组件局部状态，不影响驾驶舱全局全屏
  const fullScreen = ref(false);
  function toggleFullscreen() {
    fullScreen.value = !fullScreen.value;
  }

  // 最小化：用 v-show 直接隐藏当前组件
  const minimized = ref(false);
  function toggleMinimize() {
    minimized.value = !minimized.value;
  }
  function openModal() {
    minimized.value = false;
    visible.value = true;
    const plateMap = {
      estate: '地产',
      tuju: '途居',
      zyy: '紫云英',
      shangshe: '商社',
      rd: '瑞达'
    }
    const pageName = `控股集团驾驶舱-经营驾驶舱-${plateMap[props.plate]}-数据参谋`
    tabCardClick('DATA_ANALYSE_AGENT', '数据参谋', '数据参谋悬浮窗', app as ComponentInternalInstance, pageName)
  }
  function closeModal() {
    if (!taskId.value) {
      visible.value = false;
      fullScreen.value = false;
      minimized.value = false;
      streamingStarted.value = false;
      category.value = '';
      return;
    }
    cancelData({ taskId: taskId.value }).then(() => {
      visible.value = false;
      fullScreen.value = false;
      minimized.value = false;
      streamingStarted.value = false;
      taskId.value = '';
      bottomChartRef.value?.canSendFunc();
      category.value = '';
    });
  }

  // 历史记录卡片
  const historyVisible = ref(false);
  const historyCardRef = ref<InstanceType<typeof HistoryCard>>();
  watch(() => historyVisible.value, (visible) => {
    if (visible) {
      historyCardRef.value?.setList(category.value);
    }
  });
  onMounted(() => {
    historyCardRef.value?.setList(category.value);
  });

  // 切换历史记录卡片显示状态
  function toggleHistory() {
    historyVisible.value = !historyVisible.value;
  }

  // 右上角控件：全屏（expand/collapse）+ 关闭
  const activeFullscreen = ref(false);
  provide('activeFullscreen', fullScreen);

  const activeMinimize = ref(false);
  const activeClose = ref(false);
  const closeIcon = closeDefaultIcon;
  const fullScreenIcon = computed(() => (fullScreen.value ? collapseIcon : expandIcon));

  const viewportHeight = ref(window.innerHeight);
  const viewportWidth = ref(window.innerWidth);

  function updateViewportHeight() {
    viewportHeight.value = window.innerHeight;
    viewportWidth.value = window.innerWidth;
  }

  onMounted(() => {
    window.addEventListener('unload', cancelActiveTaskByBeacon);
    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
  });

  onUnmounted(() => {
    window.removeEventListener('unload', cancelActiveTaskByBeacon);
    window.removeEventListener('resize', updateViewportHeight);
    window.visualViewport?.removeEventListener('resize', updateViewportHeight);
  });

  // 与驾驶舱 WidthScaleContainer 的 design-width 保持一致（见 ruida/Entry.vue）：
  // 取 1980 会让弹框比驾驶舱本体多缩约 3%，在 1920 屏上本可 1:1 也要多经一层缩放采样
  const AI_DESIGN_WIDTH = 1920;

  const { scale: iconScale, scaleStyle: iconScaleStyle } = useCockpitScale({
    scaleContainerSelector: props.scaleContainerSelector,
    cssVariableName: '--ai-icon-scale',
    designWidth: AI_DESIGN_WIDTH,
  });

  const { scale: modalScale, scaleStyle: modalScaleStyle } = useCockpitScale({
    scaleContainerSelector: props.scaleContainerSelector,
    cssVariableName: '--ai-modal-scale',
    designWidth: AI_DESIGN_WIDTH,
  });

  const modalHeightPx = ref(0);

  // 图标全屏拖动 + 弹框横向拖动，两者共用同一水平中心点；
  // 弹出动画起点也由它算出（对准图标中心）
  const {
    dragging,
    iconDragStyle,
    modalDragStyle,
    modalPopStyle,
    onIconPointerDown,
    onModalPointerDown,
  } = useAiDrag({
    iconScale,
    modalScale,
    fullScreen,
    iconSize: 60,
    iconRight: 20,
    iconBottom: 150,
    modalWidth: 520,
    modalHeight: modalHeightPx,
  });

  const iconStyle = computed(() => ({
    ...iconScaleStyle.value,
    ...iconDragStyle.value,
  }));

  function measureModalHeight() {
    requestAnimationFrame(() => {
      const s = modalScale.value || 1;
      const vh = window.innerHeight;

      const navEl = document.querySelector(props.navSelector) as HTMLElement | null;
      // 弹框全屏不影响驾驶舱布局，顶栏始终存在，兜底按「顶栏 68 + 导航 80」计算
      const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 68 + 80 * s;

      modalHeightPx.value = Math.min(vh / s, Math.max(0, (vh - navBottom) / s));
    });
  }

  watch([fullScreen, modalScale, viewportHeight], measureModalHeight, {
    immediate: true,
    flush: 'post',
  });

  const modalStyle = computed(() => ({
    ...modalScaleStyle.value,
    ...modalDragStyle.value,
    ...modalPopStyle.value,
    height: `${modalHeightPx.value}px`,
    // 缩放由 .ai-modal 的 zoom 承担，故这里写「视口宽 / 缩放」的未缩放宽度，与高度算法一致
    ...(fullScreen.value ? { width: `${viewportWidth.value / (modalScale.value || 1)}px` } : {}),
  }));
</script>

<style scoped lang="scss">
  .icon-fixed {
    position: fixed;
    z-index: 9999;
    right: 20px;
    bottom: 150px;
    width: 60px;
    height: 60px;

    // translate 写在 scale 左侧：位移量不受缩放影响，与 JS 里的视口 px 计算一致
    transform: translate(var(--ai-icon-tx, 0px), var(--ai-icon-ty, 0px))
      scale(var(--ai-icon-scale, 1));
    transform-origin: center center;
    cursor: pointer;
    touch-action: none;
    user-select: none;

    &.is-dragging {
      cursor: grabbing;
    }
  }

  .ai-modal {
    position: fixed;
    z-index: 10000;
    right: 0;
    bottom: 0;
    width: 520px;

    // 驾驶舱缩放用 zoom 而不是 transform: scale 承担：
    // transform 不参与布局，浏览器按 1x 字号光栅化后再整体缩小，飞书内嵌浏览器窗口未全屏时
    // （scale 明显小于 1）弹框内文字整体发虚；zoom 参与布局，文字按缩放后的字号直接光栅化，始终清晰。
    zoom: var(--ai-modal-scale, 1);

    // 拖动位移由 JS 按视口 px 算出，而 transform 的长度会再被 zoom 乘一次，这里先除回去
    transform: translateX(calc(var(--ai-modal-tx, 0px) / var(--ai-modal-scale, 1)));
    transform-origin: bottom right;
    transition: width 0.3s ease;

    // 拖动手势不被浏览器接管；内部滚动/输入区在下方恢复默认
    touch-action: none;

    &.is-dragging {
      cursor: grabbing;
      user-select: none;
    }

    .center-chart,
    .bottom-chart {
      touch-action: auto;
    }
  }

  // 展开/收起过渡：从图标所在位置弹出、收起时缩回图标位置。
  // from-x / from-y / from-scale 由 useAiDrag 按图标实时中心点算出（含拖动位移）
  .ai-minimize-enter-active,
  .ai-minimize-leave-active {
    transition:
      transform 0.32s cubic-bezier(0.32, 0.72, 0.35, 1.02),
      opacity 0.24s ease;
  }

  .ai-minimize-enter-from,
  .ai-minimize-leave-to {
    // from-x 已是绝对位移（图标中心已含拖动量），不能再叠加 --ai-modal-tx；
    // 缩放已由 .ai-modal 的 zoom 承担，这里只补弹出动画自身的 from-scale，
    // 位移同样先除回 zoom，保证与 JS 里的视口 px 计算一致
    transform: translate(
        calc(var(--ai-modal-from-x, 0px) / var(--ai-modal-scale, 1)),
        calc(var(--ai-modal-from-y, 0px) / var(--ai-modal-scale, 1))
      )
      scale(var(--ai-modal-from-scale, 0.2));
    transform-origin: bottom right;
    opacity: 0;
  }

  .ai-modal--fullscreen {
    // 全屏宽度由 JS 按「视口宽 / 缩放」写在行内 style 上（见 modalStyle），与高度算法保持一致，
    // 不依赖百分比在 zoom 下如何解析

    .chat-body {
      box-sizing: border-box;
      padding-right: 8%;
      padding-bottom: 16px;
      padding-left: 8%;
    }

    // 让 TipsComp 整卡也吃 8% 缩进，外框宽度与 CenterChart 一致（header 控件在父层定位不受影响）
    .tips-wrap {
      box-sizing: border-box;
      padding-right: 8%;
      padding-left: 8%;

      :deep(.tips-box) {
        width: 100%;
        margin-right: 0;
        margin-left: 0;
      }
    }

    :deep(.center-chart),
    :deep(.bottom-chart) {
      box-sizing: border-box;
      width: 100%;
      margin-right: 0;
      margin-left: 0;
    }

    :deep(.bottom-chart) {
      padding-right: 0;
      padding-left: 0;
    }
  }

  .chat-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding-bottom: 16px;
    transition:
      padding-right 0.3s ease,
      padding-left 0.3s ease;
  }

  // TipsComp 外层：全屏时让内部 .tips-box 铺满整卡、header 图标贴右上角，
  // 8% 缩进由内部 .tips-content 承担（详见 .ai-modal--fullscreen）
  .tips-wrap {
    flex-shrink: 0;
    margin-top: 50px;
  }

  .ai-modal-content {
    display: flex;
    position: relative;
    flex-direction: column;

    // 顶部对齐：长问题向下伸展时 tips/header 不会被压缩顶上去
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-top-left-radius: 20px;
    background: #fff;
    box-shadow: 0 4px 20px rgb(0 0 0 / 15%);
  }

  // 全局右上角：全屏 + 关闭控件，绝对定位不受任何内容 padding 影响
  .ai-header-controls {
    display: flex;
    position: absolute;
    z-index: 50;
    top: 15px;
    right: 16px;
    align-items: center;
    gap: 12px;

    &__icon {
      width: 20px;
      height: 20px;
      transition: opacity 0.15s ease;
      cursor: pointer;

      &.is-active {
        opacity: 1;
      }

      &:hover {
        opacity: 0.7;
      }
    }
  }

  .center-chart {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .bottom-chart {
    flex-shrink: 0;
    height: 190px;
  }
</style>
