import { nextTick, reactive, ref } from 'vue';

/**
 * 悬浮框视口内定位 hook（跟随鼠标的 tooltip / 卡片类悬浮层通用）。
 *
 * 定位规则：
 *   - 水平：悬浮框整体放在锚点元素左侧（不遮挡锚点），靠左超出时 clamp 到视口边距内；
 *   - 垂直：相对屏幕居中展示，clamp 兜底，保证不出可视区域；
 *   - 尺寸实测自悬浮框元素（内容长度会影响高度），每次展示时重新测量并计算。
 *
 * 使用方式：
 *   const { popoverRef, popoverPos, showAt } = useViewportPopover();
 *   <div ref="popoverRef" :style="{ left: popoverPos.x + 'px', top: popoverPos.y + 'px' }" />
 *   触发时：showAt(anchorEl.getBoundingClientRect())
 *
 * popoverRef 可直接绑在组件上（内部会取 $el）；悬浮框建议 Teleport 到 body，
 * 避免成为 flex 容器的子元素影响布局。
 */
export function useViewportPopover(options: { margin?: number; gap?: number } = {}) {
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 8;

  const popoverRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null);
  const popoverPos = reactive({ x: 0, y: 0 });

  function getEl(): HTMLElement | undefined {
    const raw: HTMLElement | { $el?: HTMLElement } | null = popoverRef.value;
    if (!raw) return undefined;
    return ('$el' in raw ? raw.$el : raw) as HTMLElement | undefined;
  }

  function updatePosition(anchorRect: DOMRect) {
    const el = getEl();
    const width = el?.offsetWidth ?? 0;
    const height = el?.offsetHeight ?? 0;
    if (width <= 0 || height <= 0) return;
    let x = anchorRect.left - width - gap;
    x = Math.max(x, margin);
    let y = (window.innerHeight - height) / 2;
    y = Math.min(Math.max(y, margin), window.innerHeight - height - margin);
    popoverPos.x = Math.round(x);
    popoverPos.y = Math.round(y);
  }

  /** 展示悬浮框后调用：等渲染完成，实测尺寸并按锚点矩形计算位置。 */
  async function showAt(anchorRect: DOMRect) {
    await nextTick();
    updatePosition(anchorRect);
  }

  return { popoverRef, popoverPos, showAt };
}
