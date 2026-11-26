<template>
  <div class="insight-pie-wrap" :class="{ 'insight-pie-wrap--fullscreen': fullscreenActive }">
    <div ref="chartRef" class="insight-chart"></div>
    <!-- 右侧明细列表：数据量 > 6 时显示，非全屏一组垂直滚动，全屏每 4 项一组横向排列 -->
    <div v-if="showList" class="insight-pie-lists">
      <div v-for="(group, gi) in listGroups" :key="gi" class="insight-pie-list">
        <div v-for="(item, i) in group" :key="i" class="insight-pie-list-item">
          <div class="insight-pie-list-row">
            <span class="insight-pie-list-dot"></span>
            <span class="insight-pie-list-name">{{ item.name }}</span>
          </div>
          <span class="insight-pie-list-value" :style="{ color: item.color }">{{
            item.value
          }}</span>
        </div>
      </div>
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
  import { bindChartPointerZoom } from '../utils/chartPointerZoom';
  import { getAiChartPixelRatio } from '../utils/chartPixelRatio';

  defineOptions({
    name: 'InsightPieChart',
  });

  const props = defineProps<{
    insight: InsightItem;
  }>();

  const colorPalette = [
    '#004567',
    '#3B5B82',
    '#507198',
    '#7998BD',
    '#A7C0DE',
    '#CEDFF0',
    '#E4EEFA',
    '#004D40',
    '#115615',
    '#0D3C84',
    '#1E0C6E',
    '#5B280A',
    '#604E00',
    '#6E0000',
    '#057764',
    '#2F7D33',
    '#0D47A1',
    '#361289',
    '#763D1B',
    '#89720E',
    '#A20100',
    '#009587',
    '#419F47',
    '#1565C0',
    '#512DA9',
    '#915C37',
    '#B89500',
    '#C80A09',
    '#4CB4AA',
    '#66BA69',
    '#1E88E5',
    '#683AB7',
    '#AC7D59',
    '#E2BA10',
    '#EF3433',
    '#7FC9C2',
    '#7FC583',
    '#42A5F5',
    '#9473CC',
    '#BF9A74',
    '#FFD316',
    '#F95F5F',
    '#B1DFDB',
    '#A5D5A7',
    '#90CAF9',
    '#BA9CEB',
    '#DDBEA0',
    '#FFE46E',
    '#FF9D9D',
    '#D1ECE8',
    '#CFF0D0',
    '#C3E4FF',
    '#DDD1F5',
    '#F9E2CD',
    '#FFF0B2',
    '#FFC8C8',
  ] as const;

  const activeFullscreen = inject<Ref<boolean>>('activeFullscreen');

  /** 兜底：驾驶舱/浏览器全屏时 page 也视为全屏（复用 AI 弹窗内的全屏布局） */
  const screenFullscreen = ref<boolean>(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );
  const fullscreenActive = computed(() => !!(activeFullscreen?.value || screenFullscreen.value));

  const chartRef = ref<HTMLElement | null>(null);
  let chartInstance: echarts.ECharts | null = null;
  let unbindPointerZoom: (() => void) | null = null;
  let baseOption: echarts.EChartsOption = {};
  let lastW = 0;
  let lastH = 0;

  const showList = computed(() => props.insight.data.data.length > 6);

  const listItems = computed(() => {
    const xIdx = getColIndex(props.insight, 'x');
    const yIdx = getColIndex(props.insight, 'y');
    return props.insight.data.data.map((row, i) => ({
      name: String(row[xIdx] ?? ''),
      value: String(row[yIdx] ?? ''),
      color: colorPalette[i % colorPalette.length],
    }));
  });

  /** 列表分组：非全屏一组垂直滚动；全屏每 4 项一组，组与组横向排列 */
  const listGroups = computed(() => {
    const items = listItems.value;
    if (fullscreenActive.value) {
      const groups: (typeof items)[] = [];
      for (let i = 0; i < items.length; i += 4) {
        groups.push(items.slice(i, i + 4));
      }
      return groups;
    }
    return [items];
  });

  /** hover 中的扇区下标：数据量 > 6 时牵引线只显示该下标 */
  const hoverIndex = ref(-1);

  function getColIndex(insight: InsightItem, axis: 'x' | 'y'): number {
    const colName = axis === 'x' ? insight.x : insight.y;
    if (!colName) return axis === 'x' ? 0 : 1;
    const idx = insight.data?.columns?.indexOf(colName) ?? -1;
    return idx >= 0 ? idx : axis === 'x' ? 0 : 1;
  }

  /**
   * 饼图几何：外半径按「容器短边的一半 × 比例」计算，与 ECharts 饼图百分比半径的口径一致
   * （见 echarts/lib/chart/pie/pieLayout.js：r = parsePercent(radius, min(width, height) / 2)）。
   * 半径只由容器尺寸决定，不再随标签长短收缩，避免默认弹窗里饼图被压小；
   * 放不下的标签文字改为按可用宽度截断。
   */
  const PIE_LINE_GAP = 10;
  const PIE_TEXT_GAP = 8;
  const PIE_HORIZ_LEN = 40;
  const PIE_EDGE_PAD = 6;
  const PIE_NAME_CHAR_W = 13;
  const PIE_VALUE_CHAR_W = 8;
  /** 默认（无右侧明细列表）：放大到短边的 78% */
  const PIE_OUTER_RATIO = 0.78;
  /** 数据 > 6 时右侧让出 100px 明细列表，饼图同步让出宽度 */
  const PIE_OUTER_RATIO_WITH_LIST = 0.65;

  function getPieOuterRadius(w: number, h: number): number {
    const ratio = showList.value ? PIE_OUTER_RATIO_WITH_LIST : PIE_OUTER_RATIO;
    return (Math.min(w, h) / 2) * ratio;
  }

  function getLabelTextWidth(name: string, value: string): number {
    return Math.max(name.length * PIE_NAME_CHAR_W, value.length * PIE_VALUE_CHAR_W);
  }

  /** 按可用宽度截断标签，超出部分用省略号，避免牵引线/文字溢出画布 */
  function clipLabel(text: string, maxWidth: number, charWidth: number): string {
    if (!text) return '';
    const maxChars = Math.floor(maxWidth / charWidth);
    if (maxChars <= 0) return '';
    if (text.length <= maxChars) return text;
    if (maxChars === 1) return '…';
    return `${text.slice(0, maxChars - 1)}…`;
  }

  function buildChartOption(insight: InsightItem, w: number, h: number): echarts.EChartsOption {
    const xIdx = getColIndex(insight, 'x');
    const yIdx = getColIndex(insight, 'y');
    const rows = insight.data.data;
    const outerR = getPieOuterRadius(w, h);
    const innerR = (outerR * 35) / 65;
    const pieData = rows.map((row) => ({
      name: String(row[xIdx] ?? ''),
      value: Number(row[yIdx]) || 0,
    }));
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e8ecf1',
      },
      color: [...colorPalette],
      legend: { show: false },
      series: [
        {
          type: 'pie',
          // 用像素半径，与手绘引导线共用同一外半径，保证扇区边缘与牵引线起点贴合
          radius: [innerR, outerR],
          center: ['50%', '45%'],
          data: pieData,
          borderWidth: 4,
          borderColor: '#fff',
          itemStyle: {
            borderWidth: 4,
            borderColor: '#fff',
          },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0,0,0,0.2)',
            },
            scaleSize: 5,
          },
        },
      ],
    };
  }

  /** 手绘引导线、空心圆与文字（同 ApprovalDuration 方案）；onlyIndex 时仅生成该扇区的元素 */
  function buildPieGraphic(insight: InsightItem, w: number, h: number, onlyIndex?: number): any[] {
    const xIdx = getColIndex(insight, 'x');
    const yIdx = getColIndex(insight, 'y');
    const rows = insight.data.data;
    const sum = rows.reduce((s, row) => s + (Number(row[yIdx]) || 0), 0);
    const cx = w * 0.5;
    const cy = h * 0.45;
    const outerR = getPieOuterRadius(w, h);
    const lineGap = PIE_LINE_GAP;
    const horizLen = PIE_HORIZ_LEN;
    const minGap = 32;
    const itemCount = rows.length;
    const equalAngle = itemCount > 0 ? (Math.PI * 2) / itemCount : 0;

    let startAngle = -Math.PI / 2;
    const labels = rows.map((row, index) => {
      const value = Number(row[yIdx]) || 0;
      const angle = sum === 0 ? equalAngle : (value / sum) * Math.PI * 2;
      const mid = startAngle + angle / 2;
      startAngle += angle;
      const cos = Math.cos(mid);
      const sin = Math.sin(mid);
      const name = String(row[xIdx] ?? '');
      const valText = String(row[yIdx] ?? '');
      const edgeX = cx + outerR * cos;
      const edgeY = cy + outerR * sin;
      const isLeft = cos < 0;
      const dir = isLeft ? -1 : 1;
      const stubX = edgeX + lineGap * cos;
      const stubY = edgeY + lineGap * sin;
      // 文字画在端点内侧：可用宽度 = stub 到画布边缘，扣掉文字与端点的间距
      const maxTextW = Math.max(
        0,
        isLeft
          ? stubX - PIE_EDGE_PAD - PIE_TEXT_GAP - 2
          : w - PIE_EDGE_PAD - PIE_TEXT_GAP - stubX - 2,
      );
      const nameText = clipLabel(name, maxTextW, PIE_NAME_CHAR_W);
      const valueText = clipLabel(valText, maxTextW, PIE_VALUE_CHAR_W);
      const textW = getLabelTextWidth(nameText, valueText);
      return {
        index,
        name: nameText,
        valText: valueText,
        edgeX,
        edgeY,
        stubX,
        stubY,
        isLeft,
        dir,
        lineLen: textW + horizLen,
        labelY: stubY,
      };
    });

    // 左右分组，垂直方向做防重叠展开
    const minY = 12;
    const maxY = h - 12;
    const spread = (group: typeof labels) => {
      if (!group.length) return;
      group.sort((a, b) => a.edgeY - b.edgeY);
      for (let i = 1; i < group.length; i++) {
        if (group[i].labelY - group[i - 1].labelY < minGap) {
          group[i].labelY = group[i - 1].labelY + minGap;
        }
      }
      const overflow = group[group.length - 1].labelY - maxY;
      if (overflow > 0) {
        for (let i = group.length - 1; i >= 0; i--) {
          group[i].labelY -= overflow;
          if (i < group.length - 1 && group[i + 1].labelY - group[i].labelY < minGap) {
            group[i].labelY = group[i + 1].labelY - minGap;
          }
        }
      }
      if (group[0].labelY < minY) {
        group[0].labelY = minY;
        for (let i = 1; i < group.length; i++) {
          if (group[i].labelY - group[i - 1].labelY < minGap) {
            group[i].labelY = group[i - 1].labelY + minGap;
          }
        }
      }
    };
    spread(labels.filter((d) => !d.isLeft));
    spread(labels.filter((d) => d.isLeft));

    // 生成引导线、圆点与文字（横向做边界裁剪，文字跨在第二段横线上下）
    const pad = PIE_EDGE_PAD;
    const elements: any[] = [];
    labels
      .filter((l) => onlyIndex === undefined || l.index === onlyIndex)
      .forEach(
        ({ index, name, valText, edgeX, edgeY, stubX, isLeft, dir, lineLen, labelY }) => {
          let endX = stubX + lineLen * dir;
          // 文字画在端点内侧，端点只需保证落在画布内；标签已按可用宽度截断
          endX = isLeft ? Math.max(endX, pad) : Math.min(endX, w - pad);
          const color = colorPalette[index % colorPalette.length];
          elements.push(
            {
              type: 'polyline',
              silent: true,
              shape: {
                points: [
                  [edgeX, edgeY],
                  [stubX, labelY],
                  [endX, labelY],
                ],
              },
              style: { stroke: color, lineWidth: 1, lineDash: [4, 3] },
            },
            {
              type: 'circle',
              silent: true,
              shape: { cx: endX, cy: labelY, r: 3.5 },
              style: { fill: '#fff', stroke: color, lineWidth: 1 },
            },
            {
              type: 'text',
              silent: true,
              style: {
                text: name,
                x: isLeft ? endX + 8 : endX - 8,
                y: labelY - 2,
                fill: color,
                fontSize: 14,
                fontFamily: 'MiSans-Medium',
                textAlign: isLeft ? 'left' : 'right',
                textVerticalAlign: 'bottom',
              },
            },
            {
              type: 'text',
              silent: true,
              style: {
                text: valText,
                x: isLeft ? endX + 8 : endX - 8,
                y: labelY + 2,
                fill: color,
                fontSize: 14,
                fontFamily: 'MiSans-Medium',
                textAlign: isLeft ? 'left' : 'right',
                textVerticalAlign: 'top',
              },
            },
          );
        },
      );
    return elements;
  }

  /** 当前应渲染的 graphic 元素：数据量 > 6 时仅 hover 的扇区；否则全量 */
  function currentElements(): any[] {
    const count = props.insight.data.data.length;
    if (count > 6) {
      if (hoverIndex.value < 0) return [];
      return buildPieGraphic(props.insight, lastW, lastH, hoverIndex.value);
    }
    return buildPieGraphic(props.insight, lastW, lastH);
  }

  /** 整体重建：手绘元素是像素坐标，必须重算 */
  function init() {
    if (!chartRef.value) return;
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    unbindPointerZoom?.();
    unbindPointerZoom = null;
    chartInstance = echarts.init(chartRef.value, undefined, {
      // 宿主（飞书 webview）可能把 dpr 钉成 1，canvas 位图会被下游拉伸，这里兜底超采样
      devicePixelRatio: getAiChartPixelRatio(),
    });
    lastW = chartInstance.getWidth();
    lastH = chartInstance.getHeight();
    baseOption = buildChartOption(props.insight, lastW, lastH);
    hoverIndex.value = -1;
    render();
    bindHover();
    unbindPointerZoom = bindChartPointerZoom(chartRef.value);
  }

  function render() {
    if (!chartInstance) return;
    chartInstance.setOption(
      { ...baseOption, graphic: { elements: currentElements() } },
      { notMerge: true, lazyUpdate: true },
    );
  }

  /** 仅更新 graphic 元素，不重建整图，避免重置 ECharts 内部 hover 状态 */
  function updateGraphic() {
    if (!chartInstance) return;
    chartInstance.setOption(
      { graphic: { elements: currentElements() } },
      { replaceMerge: ['graphic'] },
    );
  }

  const isManySlices = () => props.insight.data.data.length > 6;

  function bindHover() {
    if (!chartInstance) return;
    chartInstance.on('mouseover', (params: any) => {
      if (!isManySlices()) return;
      if (typeof params.dataIndex === 'number' && hoverIndex.value !== params.dataIndex) {
        hoverIndex.value = params.dataIndex;
        updateGraphic();
      }
    });
    chartInstance.on('mouseout', (params: any) => {
      if (!isManySlices()) return;
      // 仅当离开的是当前 hover 的扇区时才清除，避免在扇区间移动时误清
      if (typeof params.dataIndex === 'number' && params.dataIndex === hoverIndex.value) {
        hoverIndex.value = -1;
        updateGraphic();
      }
    });
    chartInstance.on('globalout', () => {
      if (isManySlices() && hoverIndex.value !== -1) {
        hoverIndex.value = -1;
        updateGraphic();
      }
    });
  }

  function handleResize() {
    init();
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function debouncedResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      nextTick(() => handleResize());
    }, 200);
  }

  let resizeObserver: ResizeObserver | null = null;

  function updateScreenFullscreen() {
    screenFullscreen.value = typeof document !== 'undefined' && !!document.fullscreenElement;
  }

  onMounted(() => {
    nextTick(() => {
      init();
      if (chartRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => debouncedResize());
        resizeObserver.observe(chartRef.value);
      }
    });
    window.addEventListener('resize', debouncedResize);
    document.addEventListener('fullscreenchange', updateScreenFullscreen);
    document.addEventListener('webkitfullscreenchange', updateScreenFullscreen);
    document.addEventListener('mozfullscreenchange', updateScreenFullscreen);
  });

  watch(
    () => props.insight,
    () => {
      if (!chartRef.value) return;
      init();
    },
  );

  watch(fullscreenActive, () => {
    nextTick(() => {
      if (!chartRef.value) return;
      init();
    });
  });

  onBeforeUnmount(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('resize', debouncedResize);
    document.removeEventListener('fullscreenchange', updateScreenFullscreen);
    document.removeEventListener('webkitfullscreenchange', updateScreenFullscreen);
    document.removeEventListener('mozfullscreenchange', updateScreenFullscreen);
    resizeObserver?.disconnect();
    resizeObserver = null;
    unbindPointerZoom?.();
    unbindPointerZoom = null;
    chartInstance?.dispose();
    chartInstance = null;
  });
</script>

<style scoped lang="scss">
  .insight-pie-wrap {
    display: flex;
    width: 100%;
    gap: 16px;
    align-items: flex-start;
  }

  .insight-chart {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 280px;
  }

  /* 全屏：pie 40% / 右侧 60%；非全屏：右侧固定 100px，剩余给 pie */
  .insight-pie-wrap--fullscreen .insight-chart {
    flex: 0 0 40%;
    width: 40%;
  }

  .insight-pie-lists {
    display: flex;
    flex-shrink: 0;
    gap: 20px;
    width: 100px;
    height: 200px;
  }

  .insight-pie-wrap--fullscreen .insight-pie-lists {
    width: calc(60% - 16px);
    height: 280px;
  }

  /* 每组均分剩余宽度 */
  .insight-pie-list {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    height: 200px;
    overflow-y: auto;
  }

  .insight-pie-wrap--fullscreen .insight-pie-list {
    height: 280px;
  }

  .insight-pie-list-item {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .insight-pie-list-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .insight-pie-list-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #004567;
  }

  .insight-pie-list-name {
    overflow: hidden;
    color: #17375e;
    font-family: var(--font-family-regular);
    font-size: 16px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .insight-pie-list-value {
    font-family: var(--font-family-medium);
    font-size: 18px;
  }
</style>
