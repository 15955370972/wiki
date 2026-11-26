import { describe, expect, test } from 'vitest';
import { AI_CHART_MIN_PIXEL_RATIO, resolveAiChartPixelRatio } from './chartPixelRatio';

describe('resolveAiChartPixelRatio', () => {
  test('宿主把 dpr 钉成 1 时（飞书 webview）抬到最低倍率做超采样', () => {
    expect(resolveAiChartPixelRatio(1)).toBe(AI_CHART_MIN_PIXEL_RATIO);
  });

  test('宿主 dpr 高于最低倍率时沿用原生值，不降精度', () => {
    expect(resolveAiChartPixelRatio(3)).toBe(3);
    expect(resolveAiChartPixelRatio(2.5)).toBe(2.5);
  });

  test('dpr 恰等于最低倍率时保持不变', () => {
    expect(resolveAiChartPixelRatio(2)).toBe(2);
  });

  test('介于 1 与最低倍率之间（如 125% 缩放的 1.25）同样被抬高', () => {
    expect(resolveAiChartPixelRatio(1.25)).toBe(AI_CHART_MIN_PIXEL_RATIO);
    expect(resolveAiChartPixelRatio(1.5)).toBe(AI_CHART_MIN_PIXEL_RATIO);
  });

  test('只抬高不压低：min 可调，且永不返回低于 dpr 的值', () => {
    expect(resolveAiChartPixelRatio(1, 3)).toBe(3);
    expect(resolveAiChartPixelRatio(4, 2)).toBe(4);
    expect(resolveAiChartPixelRatio(1, 1)).toBe(1);
  });

  test('非法入参退化为 dpr=1，不产生 NaN 尺寸的 canvas', () => {
    expect(resolveAiChartPixelRatio(Number.NaN)).toBe(AI_CHART_MIN_PIXEL_RATIO);
    expect(resolveAiChartPixelRatio(0)).toBe(AI_CHART_MIN_PIXEL_RATIO);
    expect(resolveAiChartPixelRatio(-2)).toBe(AI_CHART_MIN_PIXEL_RATIO);
    expect(resolveAiChartPixelRatio(undefined)).toBe(AI_CHART_MIN_PIXEL_RATIO);
    expect(Number.isFinite(resolveAiChartPixelRatio(Number.POSITIVE_INFINITY))).toBe(true);
  });
});
