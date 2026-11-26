import { computed, nextTick, reactive, ref } from 'vue';

export type AnchorPopoverPlacement = 'bottom' | 'top';

/**
 * 锚点悬浮框定位 hook（弹框内绝对定位场景）。
 *
 * 与 useViewportPopover（Teleport 到 body + fixed 定位）不同，本 hook 将悬浮框
 * 绝对定位在容器（containerRef，需 position: relative）内部，全部使用
 * offsetLeft/offsetTop/scrollTop/clientHeight 等布局像素计算，
 * 不受外层 transform 缩放影响，无需换算 scale。
 *
 * 定位规则：
 *   - 水平：悬浮框水平居中于锚点元素，超出容器宽度时 clamp；
 *     箭头水平位置（--arrow-left）跟随锚点中心，保证始终指向锚点；
 *   - 垂直：默认置于锚点下方 gap 处；实测高度后若超出可视区（滚动容器可视区，
 *     无滚动容器时为屏幕视口），翻转到锚点上方（gap + flipExtra），
 *     上下都放不下时 clamp 到可视区内；
 *   - 滚动容器滚动时自动隐藏，避免悬浮框停留在过期位置被裁切。
 *
 * 使用方式：
 *   const { containerRef, popoverRef, popoverStyle, placement, show, hide } =
 *     useAnchorPopover({ width: 304 });
 *   <div ref="containerRef" class="xxx"> // position: relative
 *     <span @mouseenter="show($event.currentTarget)" @mouseleave="hide()">锚点</span>
 *     <Popover v-if="xxx" ref="popoverRef" :placement="placement" :style="popoverStyle" />
 *   </div>
 */
export function useAnchorPopover(options: {
  /** 悬浮框宽度（px），用于水平居中与 clamp */
  width: number;
  /** 悬浮框与锚点元素的垂直间距（px），默认 6 */
  gap?: number;
  /** 翻转到锚点上方时，额外向上偏移的距离（px），默认 0 */
  flipExtra?: number;
  /** 箭头中心距悬浮框左右边缘的最小距离（px），默认 16 */
  arrowInset?: number;
  /** 滚动容器选择器：垂直翻转/clamp 相对其可视区计算，滚动时自动隐藏；找不到时以屏幕视口为界 */
  scrollContainerSelector?: string;
}) {
  const width = options.width;
  const gap = options.gap ?? 6;
  const flipExtra = options.flipExtra ?? 0;
  const arrowInset = options.arrowInset ?? 16;
  const scrollContainerSelector = options.scrollContainerSelector ?? '.cockpit-dialog__body';

  /** 定位父容器（需 position: relative），悬浮框绝对定位在其中 */
  const containerRef = ref<HTMLElement | null>(null);
  /** 悬浮框元素/组件的模板 ref（组件自动取 $el），用于实测高度 */
  const popoverRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null);
  const visible = ref(false);
  /** bottom：悬浮框在锚点下方、箭头朝上；top：悬浮框在锚点上方、箭头朝下 */
  const placement = ref<AnchorPopoverPlacement>('bottom');
  const position = reactive({ x: 0, y: 0, arrowLeft: width / 2 });
  /** 锚点元素在滚动内容坐标系中的上/下边缘 */
  const anchorEdge = reactive({ top: 0, bottom: 0 });
  let scrollContainer: HTMLElement | null = null;

  const popoverStyle = computed(() => ({
    left: `${position.x}px`,
    top: `${position.y}px`,
    '--arrow-left': `${position.arrowLeft}px`,
  }));

  function getPopoverEl(): HTMLElement | null {
    const raw = popoverRef.value;
    if (!raw) return null;
    return ('$el' in raw ? raw.$el : raw) as HTMLElement;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(max, min));
  }

  /** 渲染后实测悬浮框高度：下方空间不足翻转到上方，仍不足则 clamp 到可视区内 */
  async function adjustVertical() {
    await nextTick();
    if (!visible.value) return;
    const el = getPopoverEl();
    if (!el) return;
    const popHeight = el.offsetHeight;
    let viewTop: number;
    let viewBottom: number;
    if (scrollContainer) {
      viewTop = scrollContainer.scrollTop;
      viewBottom = viewTop + scrollContainer.clientHeight;
    } else {
      // 无滚动容器（如页面内卡片）：以屏幕可视区为界，
      // 用容器视觉宽/布局宽推导 scale，把视口边界换算到容器布局坐标系
      const container = containerRef.value;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scale = rect.width / container.offsetWidth || 1;
      viewTop = -rect.top / scale;
      viewBottom = (window.innerHeight - rect.top) / scale;
    }
    let nextPlacement: AnchorPopoverPlacement = 'bottom';
    let y = anchorEdge.bottom + gap;
    if (y + popHeight > viewBottom) {
      const aboveY = anchorEdge.top - gap - popHeight - flipExtra;
      if (aboveY >= viewTop) {
        nextPlacement = 'top';
        y = aboveY;
      } else {
        y = clamp(viewBottom - popHeight, viewTop, viewBottom);
      }
    }
    placement.value = nextPlacement;
    position.y = Math.round(y);
  }

  /** 鼠标进入锚点元素时调用：anchorEl 需为 containerRef 内的后代元素 */
  function show(anchorEl: HTMLElement) {
    const container = containerRef.value;
    if (!container) return;
    scrollContainer = container.closest<HTMLElement>(scrollContainerSelector);
    const center = anchorEl.offsetLeft + anchorEl.offsetWidth / 2;
    const left = clamp(center - width / 2, 0, container.clientWidth - width);
    // 容器顶边换算到滚动内容坐标系，与 scrollTop/clientHeight 同坐标系
    const containerTop = scrollContainer ? container.offsetTop - scrollContainer.offsetTop : 0;
    anchorEdge.top = containerTop + anchorEl.offsetTop;
    anchorEdge.bottom = anchorEdge.top + anchorEl.offsetHeight;
    position.x = Math.round(left);
    position.y = Math.round(anchorEdge.bottom + gap);
    position.arrowLeft = Math.round(clamp(center - left, arrowInset, width - arrowInset));
    placement.value = 'bottom';
    visible.value = true;
    scrollContainer?.addEventListener('scroll', hide);
    void adjustVertical();
  }

  /** 鼠标离开锚点元素时调用 */
  function hide() {
    scrollContainer?.removeEventListener('scroll', hide);
    scrollContainer = null;
    visible.value = false;
  }

  return {
    containerRef,
    popoverRef,
    visible,
    placement,
    position,
    popoverStyle,
    show,
    hide,
  };
}
