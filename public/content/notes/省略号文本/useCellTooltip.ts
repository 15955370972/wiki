import { onBeforeUnmount, ref, type CSSProperties } from 'vue';

/**
 * 单元格省略号溢出检测 + 悬浮提示（tooltip）公共 hook。
 *
 * 逻辑抽离自 clueMatrixAnalysis/TreeTable.vue 的单元格 tooltip 实现，
 * 配合 CockpitTable 的 ellipsis 列（.cockpit-table__cell-ellipsis / data-cell-text）使用，
 * 也可用于任何「文本单行省略、溢出才悬浮提示」的场景。
 *
 * 原理（详见 docs/zk/单元格省略号tooltip hook（useCellTooltip）使用文档.md）：
 * 1. 外层容器（表格包裹层）用事件委托监听 mouseover / mouseleave，无需逐格绑定；
 * 2. mouseover 命中目标单元格时，用「等字体克隆探针」测量文本真实宽度与盒子宽度
 *    （两者同处 scale 缩放坐标系，可直接相减比较），溢出才弹 tooltip；
 * 3. tooltip 用 position: fixed 定位到缩放容器本地坐标（viewport 坐标 ÷ 已应用缩放比），
 *    transform: scale 布局下不会出现弹层放大 / 错位。
 */
export interface UseCellTooltipOptions {
  /** 单元格选择器（mouseover 事件委托命中目标），默认 '[data-cell-text]' */
  cellSelector?: string;
  /** 取单元格完整文本，默认读 data-cell-text 属性，缺失时回退 textContent */
  getCellText?: (el: HTMLElement) => string;
}

const DEFAULT_CELL_SELECTOR = '[data-cell-text]';

/** 溢出判定阈值：过滤 getBoundingClientRect 的测量噪声（不足 0.1px 的溢出视为未溢出） */
const OVERFLOW_THRESHOLD = 0.05;

/** tooltip 距单元格顶边的间隙（视觉像素，后续统一做缩放换算） */
const TOOLTIP_GAP = 4;

export function useCellTooltip(options: UseCellTooltipOptions = {}) {
  const { cellSelector = DEFAULT_CELL_SELECTOR, getCellText = defaultGetCellText } = options;

  /** tooltip 是否可见 */
  const tooltipVisible = ref(false);
  /** tooltip 完整文本 */
  const tooltipText = ref('');
  /** tooltip 定位样式（position: fixed + 缩放容器本地坐标） */
  const tooltipStyle = ref<CSSProperties>({ display: 'none' });

  function defaultGetCellText(el: HTMLElement) {
    const text = el.dataset.cellText;
    return text != null && text !== '' ? text : (el.textContent ?? '').trim();
  }

  // ==================== scale 容器坐标换算（与 TreeTable / GanttChart 同理） ====================
  // #smart-technology-entry 处于 .width-scale-container__screen 的 scale 缩放下，
  // position:fixed 的包含块是带 transform 的祖先，left/top 需用本地坐标（viewport ÷ scale）

  function getScaleFromTransform(transform: string) {
    if (!transform || transform === 'none') return 1;
    const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
    if (matrix3dMatch?.[1]) {
      const values = matrix3dMatch[1].split(',').map((v) => Number(v.trim()));
      return Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1;
    }
    const matrixMatch = transform.match(/^matrix\((.+)\)$/);
    if (!matrixMatch?.[1]) return 1;
    const values = matrixMatch[1].split(',').map((v) => Number(v.trim()));
    return Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1;
  }

  function getCurrentScale() {
    const el = document.querySelector<HTMLElement>('#smart-technology-entry');
    if (!el) return 1;
    const scale = getScaleFromTransform(window.getComputedStyle(el).transform);
    if (scale !== 1) return scale;
    const raw = el.offsetWidth;
    return raw > 0 ? el.getBoundingClientRect().width / raw : 1;
  }

  function toScaledLocalPoint(viewportX: number, viewportY: number) {
    const scale = getCurrentScale();
    const base = document.querySelector<HTMLElement>('#smart-technology-entry')?.getBoundingClientRect();
    const baseLeft = base?.left ?? 0;
    const baseTop = base?.top ?? 0;
    return {
      x: (viewportX - baseLeft) / scale,
      y: (viewportY - baseTop) / scale,
    };
  }

  /**
   * 判断文本是否溢出（出现省略号）。
   * scrollWidth / clientWidth 被浏览器四舍五入取整：溢出不足 1px 时两者相等，
   * 会误判「未溢出」——但浏览器只要内容比盒子宽 0.01px 就渲染省略号。
   * 方案：向同一单元格内插入等字体、不换行、不裁剪的克隆探针，用
   * getBoundingClientRect 量「带小数」的文本宽与盒宽（同处 scale 坐标系，可直接相减）。
   */
  function isCellOverflow(el: HTMLElement, text: string) {
    if (!text) return false;
    const computedStyle = window.getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;left:0;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;';
    probe.style.font = computedStyle.font;
    probe.style.fontFamily = computedStyle.fontFamily;
    probe.style.fontSize = computedStyle.fontSize;
    probe.style.fontWeight = computedStyle.fontWeight;
    probe.style.letterSpacing = computedStyle.letterSpacing;
    probe.textContent = text;
    el.appendChild(probe);
    const textWidth = probe.getBoundingClientRect().width;
    el.removeChild(probe);
    const boxWidth = el.getBoundingClientRect().width;
    return textWidth - boxWidth > OVERFLOW_THRESHOLD;
  }

  function hideTooltip() {
    tooltipVisible.value = false;
    tooltipText.value = '';
    tooltipStyle.value = { display: 'none' };
  }

  function showTooltip(text: string, cell: HTMLElement) {
    const rect = cell.getBoundingClientRect();
    // 水平居中于单元格、垂直贴单元格顶边上方；坐标换算回缩放容器本地坐标系
    const point = toScaledLocalPoint(rect.left + rect.width / 2, rect.top - TOOLTIP_GAP);
    tooltipText.value = text;
    tooltipStyle.value = {
      position: 'fixed',
      left: `${point.x}px`,
      top: `${point.y}px`,
      transform: 'translate(-50%, -100%)',
    };
    tooltipVisible.value = true;
  }

  // ==================== 事件委托：外层容器统一监听，逐格免绑定 ====================

  /** mouseover 委托：命中单元格 → 测溢出 → 弹/收 tooltip；命中非单元格区域 → 收起 */
  function handleMouseOver(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const cell = target?.closest?.(cellSelector) as HTMLElement | null;
    if (!cell) {
      hideTooltip();
      return;
    }
    const text = getCellText(cell);
    if (text && isCellOverflow(cell, text)) {
      showTooltip(text, cell);
    } else {
      hideTooltip();
    }
  }

  /** 外层容器 v-on 绑定集：mouseover 委托逐格判定，mouseleave 离开容器整体收起 */
  const tooltipEvents = {
    mouseover: handleMouseOver,
    mouseleave: hideTooltip,
  };

  onBeforeUnmount(hideTooltip);

  return { tooltipVisible, tooltipText, tooltipStyle, tooltipEvents };
}
