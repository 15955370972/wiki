<template>
  <div ref="rootRef" class="insight-card-container" :class="{ 'is-fullscreen': fullscreenActive }">
    <div v-for="(insight, idx) in insights" :key="idx" class="insight-card">
      <div class="insight-card-header">
        <span class="insight-card-title">{{ insight.title }}</span>
      </div>
      <div v-if="insight.summary" class="insight-card-summary">
        {{ insight.summary }}
      </div>
      <div class="insight-card-body" v-if="insight.chart_type === 'number' ? insight.data.data.length > 0 : true">
        <!-- number 数字牌 -->
        <div v-if="insight.chart_type === 'number'" class="insight-number">
          <!-- 单个数据项：一行左右布局 -->
          <div
            v-if="insight.data.data.length === 1"
            v-for="(row, ri) in insight.data.data"
            :key="ri"
            class="insight-number-item insight-number-item-single"
          >
            <span class="insight-number-label">{{ getCellValue(insight, row, 'x') }}</span>
            <span class="insight-number-value">{{ getCellValue(insight, row, 'y') }}</span>
          </div>
          <!-- 多个数据项：每行最多 4 个，自动换行 -->
          <div v-else v-for="(rowGroup, gi) in groupedRows(insight)" :key="gi" class="insight-number-row">
            <div v-for="(row, ri) in rowGroup" :key="ri" class="insight-number-item">
              <span class="insight-number-label">{{ getCellValue(insight, row, 'x') }}</span>
              <span class="insight-number-value">{{ getCellValue(insight, row, 'y') }}</span>
            </div>
          </div>
        </div>

        <!-- bar / line / pie 图表 -->
        <InsightBarChart v-else-if="insight.chart_type === 'bar'" :insight="insight" />
        <InsightLineChart v-else-if="insight.chart_type === 'line'" :insight="insight" />
        <InsightPieChart v-else-if="insight.chart_type === 'pie'" :insight="insight" />

        <!-- table 表格 -->
        <div
          v-else
          class="insight-table-wrap"
          :class="{ 'insight-table-scroll': insight.data.columns.length > 4 }"
        >
          <table class="insight-table">
            <thead>
              <tr>
                <th v-for="(col, ci) in insight.data.columns" :key="ci">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in insight.data.data" :key="ri">
                <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
  import type { InsightItem } from '../utils/ansXmlParser';
  import InsightBarChart from './InsightBarChart.vue';
  import InsightLineChart from './InsightLineChart.vue';
  import InsightPieChart from './InsightPieChart.vue';

  const activeFullscreen = inject<Ref<boolean>>('activeFullscreen');
  const fullscreenActive = computed(() => !!activeFullscreen?.value);

  const rootRef = ref<HTMLElement | null>(null);
  /** 非全屏 number 内容区实际可用宽度（动态测量） */
  const availableWidth = ref(440);
  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    const measure = () => {
      if (!rootRef.value) return;
      // root 宽度 → 减去 card-body 左右 padding(32) → 减去 number 左右 padding(24)
      availableWidth.value = rootRef.value.clientWidth - 56;
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      if (rootRef.value) resizeObserver.observe(rootRef.value);
    }
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  const props = defineProps<{
    insights: InsightItem[];
  }>();

  function getColIndex(insight: InsightItem, axis: 'x' | 'y'): number {
    const colName = axis === 'x' ? insight.x : insight.y;
    if (!colName) return axis === 'x' ? 0 : 1;
    const idx = insight.data?.columns?.indexOf(colName) ?? -1;
    return idx >= 0 ? idx : axis === 'x' ? 0 : 1;
  }

  function getCellValue(
    insight: InsightItem,
    row: (string | number)[],
    axis: 'x' | 'y',
  ): string | number {
    const idx = getColIndex(insight, axis);
    return row[idx] ?? '';
  }

  /** 每行最多 4 个 */
  const ROW_MAX_ITEMS = 4;

  let measureCanvas: HTMLCanvasElement | null = null;
  function getTextWidth(text: string, font: string): number {
    if (typeof document === 'undefined') return text.length * 12;
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (!ctx) return text.length * 12;
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  /** 估算单个 item 渲染宽度（label 14px / value 16px，取较大值 + buffer） */
  function estimateItemWidth(row: (string | number)[], insight: InsightItem): number {
    const xIdx = getColIndex(insight, 'x');
    const yIdx = getColIndex(insight, 'y');
    const name = String(row[xIdx] ?? '');
    const value = String(row[yIdx] ?? '');
    const nameW = getTextWidth(name, '14px sans-serif');
    const valW = getTextWidth(value, '16px sans-serif');
    return Math.max(nameW, valW) + 8;
  }

  function groupedRows(insight: InsightItem): (string | number)[][][] {
    const rows: (string | number)[][][] = [];
    // 全屏：固定 4 个一行
    if (fullscreenActive.value) {
      for (let i = 0; i < insight.data.data.length; i += ROW_MAX_ITEMS) {
        rows.push(insight.data.data.slice(i, i + ROW_MAX_ITEMS));
      }
      return rows;
    }
    // 非全屏：按估算宽度 + 实际容器宽度分组，最多 4 个，放不下就折行
    const gap = 20;
    const maxWidth = availableWidth.value;
    let currentRow: (string | number)[][] = [];
    let currentWidth = 0;
    for (const row of insight.data.data) {
      const itemW = estimateItemWidth(row, insight);
      const wouldBe = currentRow.length === 0 ? itemW : currentWidth + gap + itemW;
      if (currentRow.length >= ROW_MAX_ITEMS || (currentRow.length > 0 && wouldBe > maxWidth)) {
        rows.push(currentRow);
        currentRow = [];
        currentWidth = itemW;
      } else {
        currentWidth = wouldBe;
      }
      currentRow.push(row);
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
  }
</script>

<style scoped lang="scss">
  .insight-card-container {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .insight-card {
    overflow: hidden;
    border-radius: 8px;
    background: transparent;
  }

  .insight-card-header {
    display: flex;
    position: relative;
    align-items: center;
    padding: 6px 16px;
    background: transparent;
  }

  .insight-card-header::before {
    content: '';
    position: absolute;
    left: 0;
    width: 2px;
    height: 12px;
    background: #004567;
  }

  .insight-card-title {
    color: #004567;
    font-family: var(--font-family-demibold);
    font-size: 16px;
    font-weight: 400;
  }

  .insight-card-summary {
    padding: 0 16px;
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 16px;
    line-height: 1.7;
  }

  .insight-card-body {
    display: flex;
    justify-content: center;
    padding: 12px 16px 16px;
  }

  .insight-number {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 16px 12px;
    background: #fff;
    row-gap: 20px;
  }

  .insight-number-row {
    display: flex;
    position: relative;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 20px;
  }

  /* 全屏：不折行，固定四等分 */
  .is-fullscreen .insight-number-row {
    flex-wrap: nowrap;
  }

  .insight-number-row:not(:first-child)::before {
    content: '';
    position: absolute;
    top: -10px;
    right: 0;
    left: 0;
    height: 1px;
    background: #cedff0;
  }

  .insight-number-item {
    display: flex;
    position: relative;
    flex-direction: column;
    align-items: flex-start;
    width: auto;

    // gap: 6px;
  }

  /* 全屏：恢复固定四等分布局 */
  .is-fullscreen .insight-number-item {
    align-items: center;
    width: calc(25% - 15px);
  }

  .insight-number-item:not(:first-child)::before {
    content: '';
    position: absolute;
    top: 50%;
    left: -10px;
    width: 1px;
    height: 60%;
    transform: translateY(-50%);
    background: #cedff0;
  }

  .insight-number-item-single {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0 12px;
  }

  .insight-number-label {
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 14px;
  }

  .insight-number-value {
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 16px;
    font-weight: 400;
  }

  .insight-table-wrap {
    width: 100%;
    overflow-x: auto;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: #cedff0;
      border-radius: 3px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  .insight-table-scroll {
    th:first-child,
    td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
    }

    th:first-child {
      z-index: 2;
    }
  }

  .insight-table {
    width: 100%;
    border-collapse: collapse;
    border-top: 1px solid #cedff0;
    border-left: 1px solid #cedff0;
    font-family: var(--font-family-regular);

    th,
    td {
      padding: 0 8px;
      border-right: 1px solid #cedff0;
      border-bottom: 1px solid #cedff0;
      text-align: center;
      white-space: nowrap;
    }

    th {
      background: #e4eefa;
      color: #004567;
      line-height: 22px;
    }

    td {
      background: #fff;
      color: #004567;
      line-height: 22px;
    }
  }
</style>
