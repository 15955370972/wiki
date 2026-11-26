/**
 * AI 弹框内 canvas 图表的绘制倍率。
 *
 * canvas 是整个弹框里唯一由「应用自己决定光栅化精度」的内容：DOM 文字/SVG 由合成器按最终
 * 设备像素光栅化，而 zrender 的 canvas 后备存储只按「CSS 尺寸 × dpr」分配一次
 * （zrender/lib/canvas/Layer.js：`newDom.width = width * dpr`，dpr 默认取 window.devicePixelRatio）。
 * 于是下游任何一次放大——宿主 DWM 拉伸、webview zoomFactor、合成层缩放——文字都能扛住，
 * canvas 却只能把已有位图拉大，成为最先发虚的一环。
 *
 * 飞书桌面端是 Electron 内嵌 webview，宿主常用 `force-device-scale-factor=1` 规避高 DPI 布局
 * 取整问题，页面侧拿到的 devicePixelRatio 会被钉成 1，改不回来。因此这里给 canvas 兜一个
 * 最低倍率做超采样：宿主给的 dpr 更高时沿用宿主值（保持原生表现），被钉低时至少按 min 绘制。
 */
export const AI_CHART_MIN_PIXEL_RATIO = 2;

export function resolveAiChartPixelRatio(
  devicePixelRatio?: number,
  min: number = AI_CHART_MIN_PIXEL_RATIO,
): number {
  const dpr =
    Number.isFinite(devicePixelRatio) && (devicePixelRatio as number) > 0
      ? (devicePixelRatio as number)
      : 1;

  // 只抬高、不压低：dpr 已高于 min 时用原生值，避免在真高分屏上反而降精度
  return Math.max(dpr, min);
}

/** 读取当前运行环境的绘制倍率，SSR / 无 window 时按 dpr=1 兜底 */
export function getAiChartPixelRatio(min?: number): number {
  return resolveAiChartPixelRatio(typeof window === 'undefined' ? 1 : window.devicePixelRatio, min);
}
