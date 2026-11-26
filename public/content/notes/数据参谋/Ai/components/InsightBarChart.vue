<template>
  <div
    class="insight-chart-wrap"
    @mouseenter="sliderVisible = true"
    @mouseleave="sliderVisible = false"
  >
    <div ref="chartRef" class="insight-chart"></div>
    <!-- 自制圆角进度条：X 轴桶数 > 3 且鼠标 hover 时显示 -->
    <div
      v-if="needSlider()"
      v-show="sliderVisible"
      ref="sliderRef"
      class="insight-chart-slider"
      @mousedown="onSliderMouseDown"
    >
      <div
        class="insight-chart-slider-fill"
        :style="{
          width: zoomWindow.width + '%',
          left: zoomWindow.left + '%',
        }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    inject,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
    type Ref,
  } from 'vue';
  import * as echarts from 'echarts';
  import type { InsightItem } from '../utils/ansXmlParser';
  import { buildBarLineOption } from '../utils/barLineChart';
  import { bindChartPointerZoom } from '../utils/chartPointerZoom';
  import { getAiChartPixelRatio } from '../utils/chartPixelRatio';
  import { useChartScroll } from './useChartScroll';

  defineOptions({
    name: 'InsightBarChart',
  });

  const props = defineProps<{
    insight: InsightItem;
  }>();

  const activeFullscreen = inject<Ref<boolean>>('activeFullscreen');

  const { sliderRef, sliderVisible, zoomWindow, needSlider, bindChart, onSliderMouseDown } =
    useChartScroll(
      computed(() => props.insight),
      activeFullscreen,
    );

  const chartRef = ref<HTMLElement | null>(null);
  let chartInstance: echarts.ECharts | null = null;
  let unbindPointerZoom: (() => void) | null = null;

  function destroyChart() {
    chartInstance?.dispose();
    chartInstance = null;
    unbindPointerZoom?.();
    unbindPointerZoom = null;
  }

  function init() {
    if (!chartRef.value) return;
    // 宿主（飞书 webview）可能把 dpr 钉成 1，canvas 位图会被下游拉伸，这里兜底超采样
    chartInstance = echarts.init(chartRef.value, undefined, {
      devicePixelRatio: getAiChartPixelRatio(),
    });
    chartInstance.setOption(buildBarLineOption(props.insight, 'bar', activeFullscreen?.value));
    bindChart(chartInstance);
    unbindPointerZoom?.();
    unbindPointerZoom = bindChartPointerZoom(chartRef.value);
  }

  function handleResize() {
    chartInstance?.resize();
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    nextTick(() => {
      init();
      if (chartRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(chartRef.value);
      }
    });
    window.addEventListener('resize', handleResize);
  });

  watch(
    () => props.insight,
    () => {
      if (!chartRef.value) return;
      destroyChart();
      init();
    },
  );

  if (activeFullscreen) {
    watch(activeFullscreen, () => {
      nextTick(() => {
        if (!chartRef.value) return;
        destroyChart();
        init();
      });
    });
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    resizeObserver?.disconnect();
    resizeObserver = null;
    destroyChart();
  });
</script>

<style scoped lang="scss">
  .insight-chart-wrap {
    position: relative;
    width: 100%;
  }

  .insight-chart {
    width: 100%;
    height: 280px;
  }

  .insight-chart-slider {
    position: absolute;
    right: 16px;
    bottom: 8px;
    z-index: 2;
    width: 120px;
    height: 5px;
    border-radius: 2.5px;
    background: #e8f0f8;
    cursor: pointer;
  }

  .insight-chart-slider-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    min-width: 16px;
    border-radius: 2.5px;
    background: #4f81bd;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }
</style>
