import { computed, onUnmounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

export interface AiDragRange {
  min: number;
  max: number;
}

export interface UseAiDragOptions {
  /** 图标当前缩放（useCockpitScale 返回的 scale） */
  iconScale: Ref<number>;
  /** 弹框当前缩放（useCockpitScale 返回的 scale） */
  modalScale: Ref<number>;
  /** 弹框是否全屏，全屏时禁止横向拖动并居中 */
  fullScreen: Ref<boolean>;
  /** 图标未缩放尺寸，对应 .icon-fixed 的 width/height */
  iconSize?: number;
  /** 图标未缩放的 right 值，对应 .icon-fixed 的 right */
  iconRight?: number;
  /** 图标未缩放的 bottom 值，对应 .icon-fixed 的 bottom */
  iconBottom?: number;
  /** 弹框未缩放宽度，对应 .ai-modal 的 width */
  modalWidth?: number;
  /** 弹框未缩放高度（index.vue 里实时测量的 modalHeightPx），用于计算弹出动画起点 */
  modalHeight?: Ref<number>;
  /** 弹出动画起始缩放比例，越小“从图标里蹦出来”的感觉越强 */
  popScale?: number;
  /** 超过该位移（px）才判定为拖动，用于区分点击 */
  dragThreshold?: number;
  /** 弹框内命中这些选择器时不触发拖动（滚动区、输入区、右上角控件等） */
  modalDragIgnoreSelector?: string;
}

export interface UseAiDragReturn {
  /** 是否正在拖动 */
  dragging: Ref<boolean>;
  /** 绑定到图标的 style，输出 --ai-icon-tx / --ai-icon-ty */
  iconDragStyle: ComputedRef<Record<string, string>>;
  /** 绑定到弹框的 style，输出 --ai-modal-tx */
  modalDragStyle: ComputedRef<Record<string, string>>;
  /**
   * 绑定到弹框的 style，输出 --ai-modal-from-x / --ai-modal-from-y / --ai-modal-from-scale：
   * 弹框展开/收起动画的起止点对准图标中心
   */
  modalPopStyle: ComputedRef<Record<string, string>>;
  onIconPointerDown: (event: PointerEvent) => void;
  onModalPointerDown: (event: PointerEvent) => void;
  /** 图标与弹框回到默认位置 */
  resetPosition: () => void;
}

const DEFAULT_ICON_SIZE = 60;
const DEFAULT_ICON_RIGHT = 20;
const DEFAULT_ICON_BOTTOM = 150;
const DEFAULT_MODAL_WIDTH = 520;
const DEFAULT_DRAG_THRESHOLD = 4;
const DEFAULT_MODAL_IGNORE_SELECTOR =
  '.ai-header-controls, .center-chart, .bottom-chart, .history-card, input, textarea, select, button, a, [contenteditable="true"]';

export function clampValue(value: number, range: AiDragRange) {
  // 元素比视口还宽时 min > max，统一取 min，保证左边缘不出屏
  if (range.min >= range.max) return range.min;
  return Math.min(Math.max(value, range.min), range.max);
}

export function useAiDrag(options: UseAiDragOptions): UseAiDragReturn {
  const iconSize = options.iconSize ?? DEFAULT_ICON_SIZE;
  const iconRight = options.iconRight ?? DEFAULT_ICON_RIGHT;
  const iconBottom = options.iconBottom ?? DEFAULT_ICON_BOTTOM;
  const modalWidth = options.modalWidth ?? DEFAULT_MODAL_WIDTH;
  const dragThreshold = options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD;
  const ignoreSelector = options.modalDragIgnoreSelector ?? DEFAULT_MODAL_IGNORE_SELECTOR;

  const hasWindow = typeof window !== 'undefined';

  const viewportWidth = ref(hasWindow ? window.innerWidth : 0);
  const viewportHeight = ref(hasWindow ? window.innerHeight : 0);

  /**
   * 水平位置的唯一真值：视口内的「中心点 X」，图标与弹框共用。
   * 弹框展开时以图标为水平中心；两侧空间不够时弹框贴边（此时图标不居中，
   * 但只影响弹框自身的显示位置，收起后图标仍停在原处，位置不被改写）。
   * null 表示尚未拖动过，用图标 CSS 默认位置。
   */
  const sharedCenterX = ref<number | null>(null);
  /** 垂直位移仅图标使用（弹框高度固定、只允许横向拖动） */
  const rawIconOffsetY = ref(0);

  const dragging = ref(false);

  function updateViewport() {
    if (!hasWindow) return;
    viewportWidth.value = window.innerWidth;
    viewportHeight.value = window.innerHeight;
  }

  /** 图标缩放后的视觉半宽（transform-origin: center） */
  function getIconHalf() {
    return (iconSize * (options.iconScale.value || 1)) / 2;
  }

  /** 弹框缩放后的视觉宽度（transform-origin: bottom right） */
  function getModalVisualWidth() {
    if (options.fullScreen.value) return viewportWidth.value;
    return modalWidth * (options.modalScale.value || 1);
  }

  /** 图标 CSS 默认位置（right: iconRight）对应的中心点 X */
  function getDefaultIconCenterX() {
    return viewportWidth.value - iconRight - iconSize / 2;
  }

  /** 弹框 CSS 默认位置（right: 0）对应的中心点 X */
  function getDefaultModalCenterX() {
    return viewportWidth.value - getModalVisualWidth() / 2;
  }

  // 中心点可取范围 = 元素完整留在视口内的范围
  function getIconCenterRange(): AiDragRange {
    const half = getIconHalf();
    return { min: half, max: viewportWidth.value - half };
  }

  function getModalCenterRange(): AiDragRange {
    const half = getModalVisualWidth() / 2;
    return { min: half, max: viewportWidth.value - half };
  }

  function getSharedCenterX() {
    return sharedCenterX.value ?? getDefaultIconCenterX();
  }

  const iconCenterX = computed(() => clampValue(getSharedCenterX(), getIconCenterRange()));
  // 以图标为中心展开；当前位置放不下整个弹框时 clamp 贴边，保证不出屏
  const modalCenterX = computed(() => clampValue(getSharedCenterX(), getModalCenterRange()));

  const iconOffsetX = computed(() => iconCenterX.value - getDefaultIconCenterX());
  const modalOffsetX = computed(() => modalCenterX.value - getDefaultModalCenterX());

  function getIconOffsetYRange(): AiDragRange {
    const half = getIconHalf();
    const centerY = viewportHeight.value - iconBottom - iconSize / 2;
    return { min: half - centerY, max: viewportHeight.value - centerY - half };
  }

  const iconOffsetY = computed(() => clampValue(rawIconOffsetY.value, getIconOffsetYRange()));

  const iconDragStyle = computed<Record<string, string>>(() => ({
    '--ai-icon-tx': `${iconOffsetX.value}px`,
    '--ai-icon-ty': `${iconOffsetY.value}px`,
  }));

  const modalDragStyle = computed<Record<string, string>>(() => ({
    '--ai-modal-tx': `${modalOffsetX.value}px`,
  }));

  /**
   * 弹出动画起点：弹框先缩到与图标同宽，再把「缩放后的中心」对准图标中心。
   * 弹框 right:0 / bottom:0 且 transform-origin: bottom right，
   * 故其锚点（右下角）默认落在视口右下角，from-x / from-y 即锚点需要的位移。
   */
  const modalPopStyle = computed<Record<string, string>>(() => {
    const s = options.modalScale.value || 1;
    const visualWidth = getModalVisualWidth();
    const visualHeight = (options.modalHeight?.value || 0) * s;

    // 缩到图标大小，弹框极小/极大时兜底，避免动画起点退化
    const ratio =
      visualWidth > 0 ? (iconSize * (options.iconScale.value || 1)) / visualWidth : 0.15;
    const popScale = options.popScale ?? Math.min(Math.max(ratio, 0.05), 0.6);

    const centerX = iconCenterX.value;
    const centerY = viewportHeight.value - iconBottom - iconSize / 2 + iconOffsetY.value;

    return {
      '--ai-modal-from-x': `${centerX - viewportWidth.value + (visualWidth * popScale) / 2}px`,
      '--ai-modal-from-y': `${centerY - viewportHeight.value + (visualHeight * popScale) / 2}px`,
      '--ai-modal-from-scale': String(popScale),
    };
  });

  let activePointerId: number | null = null;
  let activeElement: HTMLElement | null = null;
  let activeKind: 'icon' | 'modal' = 'icon';
  let startClientX = 0;
  let startClientY = 0;
  let startCenterX = 0;
  let startOffsetY = 0;
  let moved = false;
  let previousUserSelect = '';

  function lockSelection() {
    previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
  }

  function unlockSelection() {
    document.body.style.userSelect = previousUserSelect;
  }

  // 拖动结束浏览器仍会补发一次 click，捕获阶段吞掉，避免误触发打开弹框 / 面板内点击
  function swallowClick(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener('click', swallowClick, true);
  }

  function suppressNextClick() {
    window.removeEventListener('click', swallowClick, true);
    window.addEventListener('click', swallowClick, true);
  }

  function onPointerMove(event: PointerEvent) {
    if (activePointerId === null || event.pointerId !== activePointerId) return;

    const deltaX = event.clientX - startClientX;
    const deltaY = event.clientY - startClientY;

    if (!moved) {
      const reached =
        activeKind === 'icon'
          ? Math.hypot(deltaX, deltaY) > dragThreshold
          : Math.abs(deltaX) > dragThreshold;
      if (!reached) return;

      moved = true;
      dragging.value = true;
      lockSelection();
      activeElement?.setPointerCapture?.(activePointerId);
    }

    event.preventDefault();

    const centerRange = activeKind === 'icon' ? getIconCenterRange() : getModalCenterRange();
    sharedCenterX.value = clampValue(startCenterX + deltaX, centerRange);

    if (activeKind === 'icon') {
      rawIconOffsetY.value = clampValue(startOffsetY + deltaY, getIconOffsetYRange());
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (activePointerId === null || event.pointerId !== activePointerId) return;

    if (moved) {
      suppressNextClick();
      unlockSelection();
      activeElement?.releasePointerCapture?.(activePointerId);
    }

    activePointerId = null;
    activeElement = null;
    moved = false;
    dragging.value = false;

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function startDrag(event: PointerEvent, kind: 'icon' | 'modal') {
    if (!hasWindow) return;
    // 仅左键，且没有进行中的拖动
    if (event.button !== 0 || activePointerId !== null) return;
    if (kind === 'modal' && options.fullScreen.value) return;

    updateViewport();

    activeKind = kind;
    activePointerId = event.pointerId;
    activeElement = event.currentTarget as HTMLElement;
    startClientX = event.clientX;
    startClientY = event.clientY;
    startCenterX = kind === 'icon' ? iconCenterX.value : modalCenterX.value;
    startOffsetY = iconOffsetY.value;
    moved = false;

    window.removeEventListener('click', swallowClick, true);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onIconPointerDown(event: PointerEvent) {
    startDrag(event, 'icon');
  }

  function onModalPointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(ignoreSelector)) return;
    startDrag(event, 'modal');
  }

  function resetPosition() {
    sharedCenterX.value = null;
    rawIconOffsetY.value = 0;
  }

  if (hasWindow) {
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
  }

  onUnmounted(() => {
    if (!hasWindow) return;
    window.removeEventListener('resize', updateViewport);
    window.visualViewport?.removeEventListener('resize', updateViewport);
    window.removeEventListener('orientationchange', updateViewport);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('click', swallowClick, true);
    if (dragging.value) unlockSelection();
  });

  return {
    dragging,
    iconDragStyle,
    modalDragStyle,
    modalPopStyle,
    onIconPointerDown,
    onModalPointerDown,
    resetPosition,
  };
}
