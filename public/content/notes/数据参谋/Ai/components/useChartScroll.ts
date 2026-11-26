import { onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import * as echarts from 'echarts';
import type { InsightItem } from '../utils/ansXmlParser';
import { getVisibleCount, getZoomRange } from '../utils/barLineChart';

/**
 * bar / line 图表横向滚动逻辑：
 * - 图表内滚轮平移（echarts inside dataZoom）
 * - 自绘圆角进度条拖拽同步
 * - 非全屏每屏 3 条、全屏每屏 7 条，数据超过一屏条数即启用，默认窗口定位到第一条数据
 */
export function useChartScroll(insight: Ref<InsightItem>, fullscreen?: Ref<boolean>) {
  const sliderRef = ref<HTMLElement | null>(null);
  const sliderVisible = ref(false);
  const zoomWindow = ref({ left: 0, width: 100 });
  const currentZoom = { start: 0, end: 100 };

  const isDragging = ref(false);
  let dragStartX = 0;
  let dragStartLeft = 0;
  let pendingZoom: { start: number; end: number } | null = null;
  let rafId = 0;
  let chartInstance: echarts.ECharts | null = null;

  function needSlider(): boolean {
    return insight.value.data.data.length > getVisibleCount(fullscreen?.value);
  }

  function setZoomWindow(start: number, end: number) {
    currentZoom.start = start;
    currentZoom.end = end;
    zoomWindow.value = { left: start, width: end - start };
  }

  /** 注册 dataZoom 事件同步 + 初始化窗口位置 */
  function bindChart(instance: echarts.ECharts) {
    chartInstance = instance;
    if (!needSlider()) return;
    instance.on('dataZoom', (params: any) => {
      const p = params?.batch?.[0] ?? params;
      if (typeof p?.start === 'number' && typeof p?.end === 'number') {
        setZoomWindow(p.start, p.end);
      }
    });
    const range = getZoomRange(insight.value.data.data.length, fullscreen?.value);
    setZoomWindow(range.start, range.end);
  }

  /** rAF 节流派发 dataZoom，避免一帧内多次渲染 */
  function scheduleZoom(start: number, end: number) {
    pendingZoom = { start, end };
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const next = pendingZoom;
      pendingZoom = null;
      if (!next || !chartInstance) return;
      currentZoom.start = next.start;
      currentZoom.end = next.end;
      zoomWindow.value = { left: next.start, width: next.end - next.start };
      chartInstance.dispatchAction({ type: 'dataZoom', start: next.start, end: next.end });
    });
  }

  function onSliderMouseDown(e: MouseEvent) {
    if (!chartInstance) return;
    isDragging.value = true;
    dragStartX = e.clientX;
    dragStartLeft = currentZoom.start;
    document.addEventListener('mousemove', onSliderMouseMove);
    document.addEventListener('mouseup', onSliderMouseUp);
  }

  function onSliderMouseMove(e: MouseEvent) {
    if (!isDragging.value || !sliderRef.value || !chartInstance) return;
    const deltaPercent = ((e.clientX - dragStartX) / sliderRef.value.offsetWidth) * 100;
    const width = currentZoom.end - currentZoom.start;
    let newLeft = dragStartLeft + deltaPercent;
    newLeft = Math.max(0, Math.min(100 - width, newLeft));
    scheduleZoom(newLeft, newLeft + width);
  }

  function onSliderMouseUp() {
    isDragging.value = false;
    document.removeEventListener('mousemove', onSliderMouseMove);
    document.removeEventListener('mouseup', onSliderMouseUp);
  }

  function unbind() {
    document.removeEventListener('mousemove', onSliderMouseMove);
    document.removeEventListener('mouseup', onSliderMouseUp);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      pendingZoom = null;
    }
    chartInstance = null;
  }

  onUnmounted(() => unbind());

  return {
    sliderRef,
    sliderVisible,
    zoomWindow,
    needSlider,
    bindChart,
    onSliderMouseDown,
    unbind,
  };
}