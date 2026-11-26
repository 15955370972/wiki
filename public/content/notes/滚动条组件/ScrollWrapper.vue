<template>
  <div
    class="scroll-wrap"
    :class="`scroll-wrap--${type}`"
    @mouseenter="onWrapEnter"
    @mouseleave="barVisible = false"
  >
    <div
      class="scroll-container"
      :class="`scroll-container--${type}`"
      ref="scrollContainer"
      @wheel="onWheel"
      @scroll="syncThumb"
    >
      <slot></slot>
    </div>
    <!-- 自绘滚动条：彻底绕开 webkit 原生滚动条的重绘缓存 bug -->
    <div
      v-show="(barVisible || dragging) && hasOverflow"
      class="scroll-scrollbar"
      :class="`scroll-scrollbar--${type}`"
    >
      <div
        class="scroll-scrollbar-thumb"
        :style="thumbStyle"
        @mousedown.prevent="onThumbDown"
      ></div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onBeforeUnmount } from 'vue';

  defineOptions({
    name: 'ScrollWrapper',
  });

  // ============================================================
  // 自绘滚动条
  //   弃用 webkit 原生 ::-webkit-scrollbar（Electron 下有绘制缓存 bug，
  //   移出后滑块不消失 / 一直显示）。改为绝对定位的 overlay 滑块，
  //   显隐完全由 JS 控制，位置/尺寸随 scroll 同步。
  //   type='horizontal'（默认）横向滚动；type='vertical' 纵向滚动，用法一致。
  // ============================================================
  const props = withDefaults(
    defineProps<{
      type?: 'horizontal' | 'vertical';
    }>(),
    {
      type: 'horizontal',
    },
  );

  const isVertical = computed(() => props.type === 'vertical');

  const scrollContainer = ref<HTMLElement | null>(null);
  const barVisible = ref(false); // 鼠标是否在容器内
  const dragging = ref(false); // 是否正在拖拽滑块
  const hasOverflow = ref(false); // 内容是否超出（需要滚动条）
  const thumbSize = ref(0); // 滑块长度（横向为宽、纵向为高）
  const thumbOffset = ref(0); // 滑块偏移（横向为 left、纵向为 top）

  const thumbStyle = computed(() => {
    return isVertical.value
      ? { height: thumbSize.value + 'px', transform: `translateY(${thumbOffset.value}px)` }
      : { width: thumbSize.value + 'px', transform: `translateX(${thumbOffset.value}px)` };
  });

  // 滚轮滚动：横向时把竖向滚轮转为横向滚动，纵向时走原生竖向滚动。
  // 自身无溢出（不需要滚动条），或已滚到边界后继续往外滚时，不拦截，交给外层容器滚动。
  const onWheel = (e: WheelEvent) => {
    const el = scrollContainer.value;
    if (!el) return;
    const clientSize = isVertical.value ? el.clientHeight : el.clientWidth;
    const scrollSize = isVertical.value ? el.scrollHeight : el.scrollWidth;
    const scrollPos = isVertical.value ? el.scrollTop : el.scrollLeft;
    if (scrollSize <= clientSize + 1) return; // 无溢出，不影响外层滚动
    const maxScroll = scrollSize - clientSize;
    // 已到顶继续上滚 / 已到底继续下滚：放行给外层容器
    if ((scrollPos <= 0 && e.deltaY < 0) || (scrollPos >= maxScroll - 1 && e.deltaY > 0)) {
      return;
    }
    e.preventDefault();
    if (isVertical.value) {
      el.scrollTop += e.deltaY;
    } else {
      el.scrollLeft += e.deltaY;
    }
  };

  // 鼠标进入容器：先量一次尺寸再显示（避免数据加载时容器不可见 / 尺寸为 0
  // 导致 hasOverflow 一直为 false、滑块永不出现）
  function onWrapEnter() {
    syncThumb();
    barVisible.value = true;
  }

  // 根据容器滚动状态计算滑块尺寸与位置
  function syncThumb() {
    const el = scrollContainer.value;
    if (!el) return;
    const clientSize = isVertical.value ? el.clientHeight : el.clientWidth;
    const scrollSize = isVertical.value ? el.scrollHeight : el.scrollWidth;
    const scrollPos = isVertical.value ? el.scrollTop : el.scrollLeft;
    hasOverflow.value = scrollSize > clientSize + 1;
    if (!hasOverflow.value) {
      thumbSize.value = 0;
      thumbOffset.value = 0;
      return;
    }
    const minThumb = 30;
    thumbSize.value = Math.max((clientSize / scrollSize) * clientSize, minThumb);
    const maxOffset = clientSize - thumbSize.value;
    const maxScroll = scrollSize - clientSize;
    thumbOffset.value = maxScroll > 0 ? (scrollPos / maxScroll) * maxOffset : 0;
  }

  // 拖拽滑块
  let dragStart = 0;
  let dragStartScroll = 0;
  function onThumbDown(e: MouseEvent) {
    const el = scrollContainer.value;
    if (!el) return;
    dragging.value = true;
    dragStart = isVertical.value ? e.clientY : e.clientX;
    dragStartScroll = isVertical.value ? el.scrollTop : el.scrollLeft;
    window.addEventListener('mousemove', onThumbMove);
    window.addEventListener('mouseup', onThumbUp);
  }
  function onThumbMove(e: MouseEvent) {
    const el = scrollContainer.value;
    if (!el) return;
    const clientSize = isVertical.value ? el.clientHeight : el.clientWidth;
    const scrollSize = isVertical.value ? el.scrollHeight : el.scrollWidth;
    const maxOffset = clientSize - thumbSize.value;
    const maxScroll = scrollSize - clientSize;
    const delta = (isVertical.value ? e.clientY : e.clientX) - dragStart;
    const next = dragStartScroll + (maxOffset > 0 ? (delta / maxOffset) * maxScroll : 0);
    if (isVertical.value) {
      el.scrollTop = next;
    } else {
      el.scrollLeft = next;
    }
  }
  function onThumbUp() {
    dragging.value = false;
    window.removeEventListener('mousemove', onThumbMove);
    window.removeEventListener('mouseup', onThumbUp);
  }

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onThumbMove);
    window.removeEventListener('mouseup', onThumbUp);
  });

  // 暴露给父组件：数据更新后主动重新计算滑块（如异步加载完成时）
  defineExpose({ syncThumb });
</script>

<style scoped lang="scss">
  .scroll-wrap {
    position: relative;
    width: 100%;
  }

  .scroll-container {
    display: flex;
    flex-shrink: 0;
    width: 100%;
    cursor: grab;
    gap: 12px;

    &:active {
      cursor: grabbing;
    }

    // 隐藏 webkit 原生滚动条，改用自绘 overlay 滑块
    &::-webkit-scrollbar {
      width: 0;
      height: 0;
      background: transparent;
    }
  }

  // 横向滚动容器
  .scroll-container--horizontal {
    flex-direction: row;
    align-items: flex-start;
    height: 144px;
    min-height: 144px;
    overflow: auto hidden;
    white-space: nowrap;
  }

  // 纵向滚动容器
  .scroll-container--vertical {
    flex-direction: column;
    align-items: stretch;
    height: 100%;
    overflow: hidden auto;
  }

  // 自绘滚动条轨道
  .scroll-scrollbar {
    position: absolute;
    z-index: 5;
    pointer-events: none;
  }

  // 横向轨道：覆盖在容器底部
  .scroll-scrollbar--horizontal {
    right: 0;
    bottom: 0;
    left: 0;
    height: 6px;
  }

  // 纵向轨道：覆盖在容器右侧
  .scroll-scrollbar--vertical {
    top: 0;
    right: 0;
    bottom: 0;
    width: 6px;
  }

  .scroll-scrollbar-thumb {
    transition: background 0.2s;
    border-radius: 3px;
    background: rgb(0 0 0 / 25%);
    cursor: pointer;
    pointer-events: auto;

    &:hover {
      background: rgb(0 0 0 / 45%);
    }
  }

  // 横向滑块：满高、宽度由 JS 控制
  .scroll-scrollbar--horizontal .scroll-scrollbar-thumb {
    height: 100%;
  }

  // 纵向滑块：满宽、高度由 JS 控制
  .scroll-scrollbar--vertical .scroll-scrollbar-thumb {
    width: 100%;
  }
</style>
