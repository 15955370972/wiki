import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/** 行高：CockpitTable 表体 td 固定 40px（见 CockpitTable.vue 表体样式） */
const DEFAULT_ROW_HEIGHT = 40;
/** 可用高度小于该值时兜底到最小高度，避免表体被压没 */
const DEFAULT_MIN_HEIGHT = 160;
/** 距滚动容器可视区底的留白（下方还有趋势图 / 明细等区块） */
const DEFAULT_BOTTOM_BUFFER = 100;
/** 滚动容器选择器：其可视区底是表格填充边界，也是 RO 观察目标 */
const DEFAULT_SCROLL_CONTAINER_SELECTOR = '.smart-box-container';
/** 缩放容器选择器：transform: scale 缩放元素，用于把 rect 视觉像素换算回设计像素 */
const DEFAULT_SCREEN_SELECTOR = '.width-scale-container__screen';

export interface UseTableScrollYOptions {
  /** 单行布局高度，默认 40（CockpitTable 表体 td 固定行高） */
  rowHeight?: number;
  /** 最小兜底高度，默认 160 */
  minHeight?: number;
  /** 距滚动容器可视区底的留白，默认 100 */
  bottomBuffer?: number;
  /** 滚动容器选择器（closest 查找），默认 '.smart-box-container' */
  scrollContainerSelector?: string;
  /** 缩放容器选择器（closest 查找），默认 '.width-scale-container__screen' */
  screenSelector?: string;
  /**
   * 触发滚动的行数阈值；传入后以「行数 > 阈值」作为滚动触发条件，
   * 不传（默认）以「行总高 × rowHeight > 可用高度」判断。
   * 用于「不足 N 行时表格均分撑满、超过才滚动」这类阶梯策略。
   */
  scrollTriggerRows?: number;
  /**
   * 顶边偏移量测模式，默认 'auto'。
   * 'auto'：表格顶边设计坐标落在首屏内（顶边之上还能看到一段可视区）时按真实
   * 顶边偏移压缩可用高度——只适合滚动容器的首个区块；顶边位置随窗口高度缩放
   * 跨过首屏边界时会在「真实偏移 / 0」两个分支间跳变，窗口缩小时 scroll.y 变小、
   * 窗口恢复后回不到原值（不对称）。页面下方区块（上方还有多个大块）会踩中。
   * 'zero'：顶边偏移恒按 0——滚进视口时表底贴住可视区底（同 CodeDetail 实际
   * 效果），适合页面下方区块。
   */
  topOffsetMode?: 'auto' | 'zero';
  /**
   * 放得下也照常下发 scroll.y，默认 false。
   * 提车明细等接口大表数据恒超一屏、scroll.y 恒有值，表头恒定贴在表体上方、
   * 表体恒内滚；而分页小表（如专用车总览 10 行/页）常态「放得下」——不放就出现
   * 两种观感 bug：表头随外层滚动被一起带走；窗口缩小/恢复时 scroll.y 在
   * 「下发/收回」间翻转，恢复后表体高度回不到原值。传 true 后表体恒定占满
   * 可用高度并内滚（代价是 antd 滚动条常驻），对齐大表的实际效果。
   * 前提：测量基准（滚动容器）高度与表格自身高度无关（页面流定高容器），
   * 否则会形成回灌死循环（见文档 §7）。
   */
  alwaysScroll?: boolean;
}

/**
 * 表格纵向滚动高度（scroll.y）自动测算：
 * 表底贴住滚动容器（.smart-box-container）可视区底、表头吸顶、行全部内滚。
 * 全部按布局像素测量，天然不受 transform: scale 影响。
 *
 * 内容放得下时默认不下发 scroll.y（antd 一旦收到 scroll.y 会让滚动条常驻），
 * 行总高超出可用高度才下发，表体限高内滚；分页小表若需「表头恒吸顶、表体恒内滚」
 * （对齐提车明细大表的实际效果），传 options.alwaysScroll = true 放得下也恒下发。
 *
 * 使用方式（两处绑定 + 一个行数来源即可）：
 *   const { tableWrapRef, scrollY } = useTableScrollY(() => tableData.value.length);
 *   <div ref="tableWrapRef" class="table-wrap">
 *     <CockpitTable :scroll-y="scrollY" ... />
 * 行数变化（flush: 'post'）与滚动容器尺寸变化（ResizeObserver，rAF 延迟 + 尺寸去重）
 * 均自动重测，卸载时自动清理；RO 漏发的场景可调返回值里的 remeasure 主动补测。
 * 返回值里的 availableY 为重测出的可用高度（已扣留白），供「不足 N 行时均分撑满」
 * 等需要按可用高度二次分配布局的场景消费；配套 scrollTriggerRows 可把滚动触发
 * 从「行总高超限」切换为「行数超限」，实现阶梯策略（详见 options 注释）。
 * 页面下方区块（上方还有多个大块）应传 topOffsetMode: 'zero'，避免顶边偏移
 * 随窗口缩放在两个分支间跳变导致 scroll.y 缩小/恢复不对称（详见 options 注释）。
 */
export function useTableScrollY(
  /** 行数 getter：数据变化后自动重测可用高度 */
  rowCount: () => number,
  options: UseTableScrollYOptions = {},
): {
  tableWrapRef: Ref<HTMLElement | null>;
  scrollY: Ref<number | undefined>;
  /** 重测出的可用高度（已扣留白），放不下内容时以 scroll.y 消费 */
  availableY: Ref<number | undefined>;
  /** 主动补测一次（DOM 更新完成后调用；RO 不触发的场景如 Teleport 回归后使用） */
  remeasure: () => void;
} {
  const {
    rowHeight = DEFAULT_ROW_HEIGHT,
    minHeight = DEFAULT_MIN_HEIGHT,
    bottomBuffer = DEFAULT_BOTTOM_BUFFER,
    scrollContainerSelector = DEFAULT_SCROLL_CONTAINER_SELECTOR,
    screenSelector = DEFAULT_SCREEN_SELECTOR,
    scrollTriggerRows,
    topOffsetMode = 'auto',
    alwaysScroll = false,
  } = options;
  const tableWrapRef = ref<HTMLElement | null>(null);
  const scrollY = ref<number>();
  const availableY = ref<number>();

  function updateScrollY() {
    const el = tableWrapRef.value;
    if (!el) return;
    const scrollContainer = el.closest<HTMLElement>(scrollContainerSelector);
    if (!scrollContainer) return;
    // 缩放容器（WidthScaleContainer）对内容做 transform: scale，rect 是视觉像素；
    // 已应用缩放比 = 缩放元素视觉宽 / 布局宽（transform 不改布局值，任何时刻都自洽）
    const screen = el.closest<HTMLElement>(screenSelector);
    const appliedScale =
      screen && screen.offsetWidth > 0 ? screen.getBoundingClientRect().width / screen.offsetWidth : 1;
    // 表格顶边在滚动容器内容里的设计坐标：视觉差值除以缩放比，再加回 scrollTop 抵消滚动
    const tableTopInContainer =
      (el.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top) / appliedScale +
      scrollContainer.scrollTop;
    // scroll.y 只约束表体高度，表头吸顶在表体上方，须一并扣除才能整屏内展示
    // （offsetHeight 是布局像素，天然不受缩放影响）
    const headerHeight = el.querySelector<HTMLElement>('.ant-table-thead')?.offsetHeight ?? 0;
    // 表格顶边的可视区偏移：顶边在首屏内按真实顶边算（表底贴住可视区底）；
    // 顶边在首屏之外（贴车明细/趋势图等下方区块，未滚动时不可见）按 0 算——用户滚进
    // 视口时顶边≈容器顶，可用高度即整个可视高度，同样满足"表底贴住可视区底"。
    // 若不偏置，下方区块顶边的 内容坐标 恒大于容器可视高，available 恒为负，
    // scroll.y 永远下发不了、一直展示完整表格
    const topOffset =
      topOffsetMode === 'zero'
        ? 0
        : tableTopInContainer > 0 && tableTopInContainer < scrollContainer.clientHeight
          ? tableTopInContainer
          : 0;
    const available =
      scrollContainer.clientHeight - topOffset - headerHeight - bottomBuffer;
    if (available <= 0) {
      scrollY.value = undefined;
      availableY.value = undefined;
      return;
    }
    availableY.value = available;
    const maxHeight = available > minHeight ? available : minHeight;
    // antd 只要收到 scroll.y 就把表体写成 overflow-y: scroll（滚动条常驻），
    // 内容放得下时不下发——表体不限高自然铺开；超出触发条件才下发，表体限高内滚
    // 闸门：容器高度若由内容撑开（如卡片未定高），clientHeight 会随表格增高而变大，
    // 以它算出的可用高度被行高回灌，任何按行触发的 scroll.y 都会形成死循环——
    // 因此 scrollTriggerRows 模式也必须以「行总高超出可用高度」为前提，放不下才滚
    const overrun =
      rowCount() * rowHeight > maxHeight &&
      (scrollTriggerRows != null ? rowCount() > scrollTriggerRows : true);
    // alwaysScroll：有数据就恒下发（放得下也滚），闸门只在空数据时收回
    const next = alwaysScroll
      ? rowCount() > 0
        ? maxHeight
        : undefined
      : overrun
        ? maxHeight
        : undefined;
    // 值不变不赋值：本表块自身高度变化（如下发 scroll.y 限高内滚）会作为子块盒子的
    // 尺寸变化回触发 RO，去重后及时收敛，不形成循环
    if (scrollY.value !== next) scrollY.value = next;
  }

  // 行数变化后 DOM 更新完成再测量（flush: 'post'）
  watch(rowCount, updateScrollY, { flush: 'post' });

  // 监听滚动容器及其直接子块的尺寸变化（ResizeObserver 比挂 window resize 更精准，
  // 且量到的布局已稳定，不存在 resize 当帧 rect 未更新的时序问题）：
  // - 容器盒子：窗口高度变化 / 全屏切换 / 缩放比重算最终都会体现在容器布局高度上；
  // - 子块盒子：本表通常不是滚动容器第一个区块（上方还有提车明细 / 趋势图），它们由
  //   并行接口托管、常晚于本表返回，顶边随之下移——若只观察容器，兄弟块内容撑高不会
  //   改变容器盒子（被 overflow-y: auto 内滚吸收，RO 不触发），量出的可用高度会残旧，
  //   下方区块（如线索指标）的 scroll.y 一直拿不到正确值。观察子块后，任一兄弟块
  //   稳定尺寸都会触发重测，最终收敛到布局稳定后的正确值。
  // 死循环不可能：滚动容器是 calc(100% - 88px) 定高（上级链路全部定高 +
  // overflow hidden），表格内容高度变化被 overflow-y: auto 内滚吸收，不会回灌容器盒子；
  // 回调按 BizDataChart 等处的 RO 惯例做 rAF 延迟 + 尺寸去重（含本表自身块，配合
  // scrollY 值去重），避免在 RO 通知阶段同步改 DOM 触发
  // "ResizeObserver loop completed with undelivered notifications"
  let scrollResizeObserver: ResizeObserver | null = null;
  let childMutationObserver: MutationObserver | null = null;
  let scrollRafId = 0;
  const lastBoxes = new Map<Element, string>();

  function scheduleUpdate() {
    if (scrollRafId) cancelAnimationFrame(scrollRafId);
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = 0;
      updateScrollY();
    });
  }

  function handleResizeEntries(entries: ResizeObserverEntry[]) {
    let changed = false;
    for (const entry of entries) {
      const box = `${entry.contentRect.width}x${entry.contentRect.height}`;
      // 尺寸未变化时跳过，避免无效 resize 来回触发形成循环
      if (lastBoxes.get(entry.target) === box) continue;
      lastBoxes.set(entry.target, box);
      changed = true;
    }
    if (changed) scheduleUpdate();
  }

  /** （重）挂观察目标：滚动容器 + 挂载时刻的直接子块 + 本表包裹层自身 */
  function observeTargets() {
    if (!scrollResizeObserver) return;
    scrollResizeObserver.disconnect();
    const container = tableWrapRef.value?.closest<HTMLElement>(scrollContainerSelector);
    if (container) {
      scrollResizeObserver.observe(container);
      for (const child of Array.from(container.children)) {
        if (child instanceof Element) scrollResizeObserver.observe(child);
      }
    }
    const wrap = tableWrapRef.value;
    if (wrap) scrollResizeObserver.observe(wrap);
  }

  onMounted(() => {
    updateScrollY();
    if (typeof ResizeObserver !== 'undefined') {
      scrollResizeObserver = new ResizeObserver(handleResizeEntries);
      observeTargets();
    }
    // 直接子块可能被整树重建（总览 ↔ 下钻的 v-if 切换会销毁/重建锚点块），
    // 旧观察目标变成死节点后兄弟块变化不再触发重测；childList 变化后重挂观察
    const container = tableWrapRef.value?.closest<HTMLElement>(scrollContainerSelector);
    if (container && typeof MutationObserver !== 'undefined') {
      childMutationObserver = new MutationObserver(() => {
        observeTargets();
        scheduleUpdate();
      });
      childMutationObserver.observe(container, { childList: true });
    }
    // RO 只报「观察目标盒子尺寸变化」：缩放容器分步写样式的中间态、微前端事件
    // 时序等都可能漏发恢复方向的尺寸变化；补 window resize 兜底触发（rAF 延迟 +
    // scrollY 值去重后不会形成循环）
    window.addEventListener('resize', scheduleUpdate);
  });

  onBeforeUnmount(() => {
    if (scrollRafId) cancelAnimationFrame(scrollRafId);
    scrollRafId = 0;
    lastBoxes.clear();
    childMutationObserver?.disconnect();
    childMutationObserver = null;
    window.removeEventListener('resize', scheduleUpdate);
    scrollResizeObserver?.disconnect();
    scrollResizeObserver = null;
  });

  return { tableWrapRef, scrollY, availableY, remeasure: scheduleUpdate };
}
