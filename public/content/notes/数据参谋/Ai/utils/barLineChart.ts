import type { EChartsOption } from 'echarts';
import type { InsightItem } from './ansXmlParser';

export type BarLineType = 'bar' | 'line';

/** 每屏可见条数：非全屏 3 条，全屏 7 条 */
export function getVisibleCount(fullscreen?: boolean): number {
  return fullscreen ? 7 : 3;
}

/** 默认窗口：定位到第一条数据，展示前 getVisibleCount(fullscreen) 个桶 */
export function getZoomRange(total: number, fullscreen?: boolean) {
  const visible = getVisibleCount(fullscreen);
  if (total <= 1) return { startValue: 0, endValue: 0, start: 0, end: 100 };
  if (total <= visible) return { startValue: 0, endValue: total - 1, start: 0, end: 100 };
  const endValue = Math.min(total - 1, visible - 1);
  return { startValue: 0, endValue, start: 0, end: (endValue / (total - 1)) * 100 };
}

function getColIndex(insight: InsightItem, axis: 'x' | 'y'): number {
  const colName = axis === 'x' ? insight.x : insight.y;
  if (!colName) return axis === 'x' ? 0 : 1;
  const idx = insight.data?.columns?.indexOf(colName) ?? -1;
  return idx >= 0 ? idx : axis === 'x' ? 0 : 1;
}

export function buildBarLineOption(
  insight: InsightItem,
  chartType: BarLineType,
  fullscreen?: boolean,
): EChartsOption {
  const xIdx = getColIndex(insight, 'x');
  const yIdx = getColIndex(insight, 'y');
  const rows = insight.data.data;
  const categories = rows.map((row) => String(row[xIdx] ?? ''));
  const values = rows.map((row) => Number(row[yIdx]) || 0);
  const zoomRange = getZoomRange(rows.length, fullscreen);

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#e8ecf1',
      textStyle: {
        fontSize: 14,
        color: '#4F81BD',
        fontFamily: 'MiSans-Regular, MiSans',
      },
      formatter: ((params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{
          axisValue?: string | number;
          value?: string | number;
          marker?: string;
        }>;
        const item = list[0];
        if (!item) return '';
        const marker =
          chartType === 'bar'
            ? `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#004567;vertical-align:middle;"></span>`
            : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid #004567;background:#fff;vertical-align:middle;box-sizing:border-box;"></span>`;
        return `<div>
          <div style="margin-bottom:4px;color:#93aacb;font-size:12px;">${item.axisValue ?? ''}</div>
          <div style="display:flex;align-items:center;gap:6px;color:#4F81BD;">
            <span style="display:inline-flex;align-items:center;">${marker}</span>
            <span style="color:#004567;font-weight:600;">${item.value ?? '--'}</span>
          </div>
        </div>`;
      }) as never,
    },
    grid: { left: 10, right: 25, top: 15, bottom: 40, containLabel: true },
    dataZoom:
      rows.length > getVisibleCount(fullscreen)
        ? [
            {
              type: 'inside',
              xAxisIndex: 0,
              start: zoomRange.start,
              end: zoomRange.end,
              startValue: zoomRange.startValue,
              endValue: zoomRange.endValue,
              minValueSpan: 1,
              zoomLock: true,
              filterMode: 'none',
              moveOnMouseWheel: true,
              zoomOnMouseWheel: false,
            },
          ]
        : [],
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: {
        lineStyle: { color: '#DBE5F1' },
      },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 14,
        color: '#4F81BD',
        fontFamily: 'MiSans-Regular, MiSans',
        rotate: 0,
        interval: 0,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: '#DBE5F1' },
      },
      axisLabel: {
        fontSize: 14,
        color: '#4F81BD',
        fontFamily: 'MiSans-Regular, MiSans',
      },
    },
    series: [
      {
        name: insight.y || insight.title || '数值',
        type: chartType,
        data: values,
        smooth: false,
        symbolSize: 14,
        symbol: 'circle',
        itemStyle: {
          color: '#ffffff',
          borderColor: '#004567',
          borderWidth: 3,
        },
        ...(chartType === 'bar'
          ? {
              barWidth: 16,
              itemStyle: {
                color: '#004567',
                borderRadius: 0,
              },
            }
          : {
              lineStyle: {
                width: 3,
                color: '#004567',
              },
            }),
      },
    ],
  };

  return option;
}