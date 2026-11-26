import { computed, nextTick, reactive, ref } from 'vue';
import { useCockpitScale } from '@/hooks/web/useCockpitScale';

export type FixedAnchorPopoverPlacement = 'bottom' | 'top';

/** 缩放屏幕容器：页面缩放子树，其矩形即子应用内容区（宿主顶部栏之下）的可视范围 */
const SCREEN_SELECTOR = '.width-scale-container__screen';

/**
 * 锚点悬浮框 fixed 定位 hook（useAnchorPopover 的 fixed 版本）。
 *
 * 与 useAnchorPopover（容器内绝对定位）不同，本 hook 将悬浮框 Teleport 到 body 后
 * fixed 定位：脱离页面内祖先的 overflow 裁切与层叠限制。
 *
 * 坐标系关键原理：
 *   悬浮框 Teleport 到 body 后位于 transform 缩放子树**之外**，不存在带 transform 的
 *   祖先，fixed 的包含块就是**视口**，故 left/top 直接使用视口视觉像素；
 *   锚点取 getBoundingClientRect（同为视觉像素）直接计算，无需换算原点。
 *   悬浮框自身按 useCockpitScale 的 scale 反向缩放（transform: scale(scale) +
 *   transform-origin: left top），视觉尺寸 = offsetWidth/offsetHeight * scale，
 *   与页面缩放保持一致。
 *
 * 顶部遮挡对策：
 *   嵌入宿主时子应用整体处于宿主的层叠上下文内，body 级悬浮框无法盖住宿主顶部栏
 *   （如「经营驾驶舱」），一旦重叠必然被挡。故把可视区上边界收敛为
 *   max(安全边距, screen 容器顶边, 探测到的 fixed/sticky 顶部障碍底边)：
 *   悬浮框永不进入顶部栏区域，从根源上避免遮挡；水平方向同样 clamp 到 screen
 *   容器左右边界内。
 *
 * 定位规则（与 useAnchorPopover 一致）：
 *   - 水平：居中于锚点，clamp 到可视区宽度内；箭头（--arrow-left，布局像素）
 *     按 (锚点中心 - x) / scale 跟随锚点中心，clamp 防过圆角；
 *   - 垂直：默认锚点下方 gap；实测高度后超出可视下边界时翻转到锚点上方
 *     （gap + flipExtra），仍放不下则 clamp 到可视区内；
 *   - 页面任意滚动（window 捕获阶段监听，含内部滚动容器）时自动隐藏，避免错位。
 *
 * 使用方式：
 *   const { popoverRef, popoverStyle, placement, show, hide } = useFixedAnchorPopover({ width: 270 });
 *   <Teleport to="body">
 *     <Popover v-if="xxx" ref="popoverRef" :placement="placement" :style="popoverStyle" class="xxx-popover" />
 *   </Teleport>
 *   .xxx-popover { position: fixed; z-index: 10; pointer-events: none; transform-origin: left top; }
 */
export function useFixedAnchorPopover(options: {
  /** 悬浮框宽度（布局像素 px），用于水平居中与 clamp */
  width: number;
  /** 悬浮框与锚点元素的垂直间距（布局像素 px），默认 6 */
  gap?: number;
  /** 翻转到锚点上方时，额外向上偏移的距离（布局像素 px），默认 0 */
  flipExtra?: number;
  /** 箭头中心距悬浮框左右边缘的最小距离（布局像素 px），默认 16 */
  arrowInset?: number;
  /** 悬浮框距可视区边缘的安全边距（视觉像素 px），默认 8 */
  margin?: number;
}) {
  const width = options.width;
  const gap = options.gap ?? 6;
  const flipExtra = options.flipExtra ?? 0;
  const arrowInset = options.arrowInset ?? 16;
  const margin = options.margin ?? 8;

  const popoverRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null);
  const visible = ref(false);
  /** bottom：悬浮框在锚点下方、箭头朝上；top：悬浮框在锚点上方、箭头朝下 */
  const placement = ref<FixedAnchorPopoverPlacement>('bottom');
  /** 视口视觉像素坐标（left/top 直接可用），arrowLeft 为布局像素 */
  const position = reactive({ x: 0, y: 0, arrowLeft: width / 2 });
  /** 锚点视口矩形关键值（视觉像素） */
  const anchorRect = reactive({ centerX: 0, top: 0, bottom: 0 });
  /** 可视区边界（视觉像素）：上边界避开顶部栏，左右收敛到 screen 容器内 */
  const bounds = reactive({ left: 0, right: 0, top: 0, bottom: 0 });

  // 页面被 WidthScaleContainer(designWidth: 1920) transform 缩放，
  // Teleport 到 body 的悬浮框不受缩放、会按设计稿原尺寸显示而偏大；
  // 与 CockpitDialog 一致：取 scale 后反向缩放悬浮框
  const { scale, updateScale } = useCockpitScale({
    scaleContainerSelector: SCREEN_SELECTOR,
    designWidth: 1920,
  });

  const popoverStyle = computed(() => ({
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: `scale(${scale.value})`,
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

  /** 探测视口顶部的 fixed/sticky 障碍（如宿主顶部栏），返回其视觉底边；无则 0 */
  function probeTopObstacleBottom(screen: HTMLElement | null): number {
    const el = document.elementFromPoint(window.innerWidth / 2, 2) as HTMLElement | null;
    if (!el || (screen && screen.contains(el))) return 0;
    const { position: pos } = getComputedStyle(el);
    if (pos !== 'fixed' && pos !== 'sticky') return 0;
    return el.getBoundingClientRect().bottom;
  }

  /** 可视区 = 视口与 screen 容器矩形交叠，上边界再避开顶部障碍 */
  function updateBounds() {
    const screen = document.querySelector<HTMLElement>(SCREEN_SELECTOR);
    const screenRect = screen?.getBoundingClientRect();
    bounds.left = Math.max(margin, screenRect?.left ?? 0);
    bounds.right = Math.min(window.innerWidth, screenRect?.right ?? window.innerWidth);
    bounds.top = Math.max(margin, screenRect?.top ?? 0, probeTopObstacleBottom(screen));
    bounds.bottom = Math.min(window.innerHeight, screenRect?.bottom ?? window.innerHeight);
  }

  /** 渲染后实测悬浮框高度（布局像素 * scale = 视觉高度）：下方不足翻转到上方，仍不足 clamp 到可视区内 */
  async function adjustVertical() {
    await nextTick();
    if (!visible.value) return;
    const el = getPopoverEl();
    if (!el) return;
    const s = scale.value;
    const popHeight = el.offsetHeight * s;
    const gapVisual = gap * s;
    const viewTop = bounds.top;
    const viewBottom = bounds.bottom - margin;
    let nextPlacement: FixedAnchorPopoverPlacement = 'bottom';
    let y = anchorRect.bottom + gapVisual;
    if (y + popHeight > viewBottom) {
      const aboveY = anchorRect.top - gapVisual - popHeight - flipExtra * s;
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

  /** 鼠标进入锚点元素时调用：anchorEl 取 event.currentTarget */
  function show(anchorEl: HTMLElement) {
    updateScale();
    updateBounds();
    const rect = anchorEl.getBoundingClientRect();
    const s = scale.value;
    const visualWidth = width * s;
    const centerX = rect.left + rect.width / 2;
    const x = clamp(centerX - visualWidth / 2, bounds.left, bounds.right - visualWidth);
    anchorRect.centerX = centerX;
    anchorRect.top = rect.top;
    anchorRect.bottom = rect.bottom;
    position.x = Math.round(x);
    position.y = Math.round(rect.bottom + gap * s);
    position.arrowLeft = Math.round(clamp((centerX - x) / s, arrowInset, width - arrowInset));
    placement.value = 'bottom';
    visible.value = true;
    // 捕获阶段监听：页面内任何滚动容器滚动都会触发隐藏，避免 fixed 悬浮框与锚点错位
    window.addEventListener('scroll', hide, true);
    void adjustVertical();
  }

  /** 鼠标离开锚点元素时调用 */
  function hide() {
    window.removeEventListener('scroll', hide, true);
    visible.value = false;
  }

  return {
    popoverRef,
    visible,
    placement,
    position,
    popoverStyle,
    show,
    hide,
  };
}
