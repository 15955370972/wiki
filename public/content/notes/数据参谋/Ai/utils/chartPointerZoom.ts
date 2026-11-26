/**
 * AI 弹框用 CSS `zoom` 承担驾驶舱缩放（见 index.vue `.ai-modal`），而 zrender 的悬停坐标
 * 直接取 `event.offsetX/offsetY`：在 zoom 容器内该值是缩放后的视觉坐标，与画布布局坐标
 * （0 ~ clientWidth）不一致，导致 tooltip 和命中项整体偏移（指向当前项却显示上一项）。
 *
 * 这里在事件的捕获阶段用 `clientX/Y - getBoundingClientRect()` 反推布局坐标并覆盖
 * `offsetX/offsetY`，让 zrender 拿到未缩放的坐标。zoom 为 1 时结果与原值等价，无副作用。
 */
const POINTER_EVENT_NAMES = [
  'pointermove',
  'pointerdown',
  'pointerup',
  'pointerover',
  'pointerout',
  'mousemove',
  'mousedown',
  'mouseup',
  'mouseover',
  'mouseout',
  'click',
  'dblclick',
  'contextmenu',
  'wheel',
  'mousewheel',
];

function resolveZoom(root: HTMLElement, rect: DOMRect): number {
  const cssValue = getComputedStyle(root).getPropertyValue('--ai-modal-scale');
  const parsed = Number.parseFloat(cssValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  const layoutWidth = root.offsetWidth;
  if (layoutWidth > 0 && rect.width > 0) return rect.width / layoutWidth;
  return 1;
}

export function bindChartPointerZoom(root: HTMLElement): () => void {
  const handler = (event: Event) => {
    const e = event as MouseEvent;
    if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return;
    if (!root.contains(e.target as Node)) return;

    const rect = root.getBoundingClientRect();
    const zoom = resolveZoom(root, rect);
    if (!Number.isFinite(zoom) || zoom <= 0) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    Object.defineProperty(e, 'offsetX', { configurable: true, get: () => x });
    Object.defineProperty(e, 'offsetY', { configurable: true, get: () => y });
  };

  POINTER_EVENT_NAMES.forEach((name) => document.addEventListener(name, handler, true));

  return () => {
    POINTER_EVENT_NAMES.forEach((name) => document.removeEventListener(name, handler, true));
  };
}
