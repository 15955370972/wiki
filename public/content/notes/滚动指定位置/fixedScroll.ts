/** FixedBtn 菜单项 */
import { getCurrentScale } from './useScaledTeleport';

export interface FixedBtnItem {
  key: string;
  label: string;
}

// 锚点跳转时，目标元素顶部距离滚动容器顶部的留白
const SCROLL_MARGIN_TOP = 12;

// 「更多」跳转后的定位锚点 id —— 线索指标（CodeDetail 根节点），值同时作为 scrollTo 参数带给目标页
export const LEADS_METRICS_ANCHOR_ID = 'leadsMetrics';

/**
 * 按锚点 id 把 .smart-box-container 滚到目标元素位置（FixedBtn 菜单与「更多」跳转定位共用）。
 *
 * 智科财务总览等页面的滚动容器是 .smart-box-container（overflow-y: auto）。
 *
 * 滚动效果说明：
 * 之前用 rAF + easeInOutCubic 固定 700ms 手动插值，短距离像「平移」、长距离像「瞬间移动」，
 * 且手感偏机械。这里改用浏览器原生 `scrollTo({ behavior: 'smooth' })`，动画时长随距离自适应、
 * 缓动由浏览器负责，观感与鼠标滚轮滚动一致。
 */
export function scrollToAnchor(id: string) {
  const container = document.querySelector<HTMLElement>('.smart-box-container');
  const target = document.getElementById(id);
  if (!container || !target) return;

  // 缩放容器下 getBoundingClientRect 返回视口坐标（已乘 scale），scrollTop 是逻辑坐标，
  // 除以 scale 转回逻辑坐标。
  const scale = getCurrentScale();
  const visualDistance = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  const targetTop = visualDistance / scale + container.scrollTop - SCROLL_MARGIN_TOP;

  container.scrollTo({ top: targetTop, behavior: 'smooth' });
}

/**
 * 计算锚点在滚动容器内容坐标系里的顶边位置（与 scrollToAnchor 同款换算，不含留白）。
 * 供调用方判断布局是否稳定：连续两帧结果一致即认为上方内容高度已定格。
 */
export function getAnchorTop(id: string): number | undefined {
  const container = document.querySelector<HTMLElement>('.smart-box-container');
  const target = document.getElementById(id);
  if (!container || !target) return undefined;

  const scale = getCurrentScale();
  const visualDistance = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  return visualDistance / scale + container.scrollTop;
}

/**
 * FixedBtn 菜单点击处理：根据 item.key 找到锚点元素，滚动到该元素位置。
 */
export function handleFixedBtn(item: FixedBtnItem) {
  scrollToAnchor(item.key);
}
