<!--
  上下相连面板：cards 插槽中给选中卡片标记 data-connected-active，
  通过 SVG 描边把选中卡片与下方默认插槽的明细面板连成一个整体外框。
  从 commercial-vehicle（财务·利润总额下钻）移植，供 smart-technology 各下钻组件复用。
-->
<template>
  <div ref="rootRef" class="connected-panel" :style="{ '--connect-gap': `${gap}px` }">
    <svg v-if="path" class="outline outline--background" aria-hidden="true">
      <path :d="path" :fill="background" />
    </svg>
    <svg v-if="path" class="outline outline--border" aria-hidden="true">
      <path :d="path" fill="none" :stroke="borderColor" stroke-width="1" stroke-linejoin="round" />
    </svg>
    <div ref="cardsRef" class="connected-cards"><slot name="cards" /></div>
    <section ref="panelRef" class="connected-detail" :style="{ background }"><slot /></section>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue';

  const props = withDefaults(
    defineProps<{
      /** 加载中关闭卡片连接，仅绘制明细框。 */
      connected?: boolean;
      gap?: number;
      borderColor?: string;
      background?: string;
    }>(),
    { connected: true, gap: 16, borderColor: '#004567', background: '#fff' },
  );

  const rootRef = ref<HTMLElement>();
  const cardsRef = ref<HTMLElement>();
  const panelRef = ref<HTMLElement>();
  const path = ref('');
  let observer: ResizeObserver | undefined;

  // 使用布局坐标而非缩放后的屏幕坐标，整条路径随容器一起缩放。
  function positionInRoot(element: HTMLElement) {
    let left = 0;
    let top = 0;
    let current: HTMLElement | null = element;
    while (current && current !== rootRef.value) {
      left += current.offsetLeft;
      top += current.offsetTop;
      current = current.offsetParent as HTMLElement | null;
    }
    return { left, top };
  }

  function updateOutline() {
    const root = rootRef.value;
    const panel = panelRef.value;
    if (!root || !panel) return;
    const right = root.clientWidth - 0.5;
    const bottom = panel.offsetTop + panel.offsetHeight - 0.5;
    const panelTop = panel.offsetTop + 0.5;
    const card = props.connected
      ? cardsRef.value?.querySelector<HTMLElement>('[data-connected-active]')
      : null;
    if (!card) {
      path.value = `M .5 ${panelTop} H ${right} V ${bottom} H .5 Z`;
      return;
    }
    const position = positionInRoot(card);
    const left = position.left <= 1 ? 0.5 : position.left + 0.5;
    const cardRight =
      root.clientWidth - position.left - card.offsetWidth <= 1
        ? right
        : position.left + card.offsetWidth - 0.5;
    path.value =
      `M ${left} ${position.top + 0.5} H ${cardRight}` +
      (cardRight < right ? ` V ${panelTop} H ${right}` : '') +
      ` V ${bottom} H .5` +
      (left > 0.5 ? ` V ${panelTop} H ${left}` : '') +
      ' Z';
  }

  watch(
    () => [props.connected, props.gap],
    () => nextTick(updateOutline),
    { flush: 'post' },
  );
  // 插槽卡片切换或替换后重新获取目标；相同路径不会触发重复渲染。
  onUpdated(updateOutline);
  onMounted(() => {
    observer = new ResizeObserver(updateOutline);
    for (const element of [rootRef.value, cardsRef.value, panelRef.value]) {
      if (element) observer.observe(element);
    }
    void nextTick(updateOutline);
    window.addEventListener('resize', updateOutline);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener('resize', updateOutline);
  });
</script>

<style scoped lang="scss">
  .connected-panel {
    position: relative;
    isolation: isolate;
  }

  .connected-cards {
    position: relative;
    z-index: 2;
  }

  .connected-cards :deep([data-connected-active]) {
    position: relative;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
  }

  .connected-detail {
    position: relative;
    z-index: 1;
    margin-top: var(--connect-gap);
    border: 1px solid transparent;
  }

  .outline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .outline--background {
    z-index: 0;
    filter: drop-shadow(0 4px 6px rgb(79 129 189 / 32%));
  }

  .outline--border {
    z-index: 3;
  }
</style>
