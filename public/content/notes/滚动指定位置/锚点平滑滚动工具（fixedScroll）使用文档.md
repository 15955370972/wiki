# 锚点平滑滚动工具（fixedScroll）使用文档

日期：2026-11-10
涉及文件：

- 工具实现：`apps/smart-technology/src/views/kongguJww/smartTechnology/components/utils/fixedScroll.ts`
- 缩放比来源：`smartTechnology/components/utils/useScaledTeleport.ts` 的 `getCurrentScale`
- 用法一（悬浮快捷导航）：`smartTechnology/pages/FinanceIndex.vue`、`MiniFinanceIndex.vue`、`SpecialCarFinance.vue`
  - 锚点包装 id 示例：`MiniFinanceIndex.vue`（`<div id="earningsQuality" class="finance-anchor">`）
  - 悬浮按钮组件：`smartTechnology/components/common/FixedBtn.vue`
- 用法二（跳转携带 scrollTo 定位线索指标）：
  - 发起方：`smartTechnology/components/marketIndex/DomesticRank.vue`（国内·线索指标「更多」）、`InternationalPoint.vue`（国际·线索指标「更多」）
  - 消费方：`smartTechnology/components/salesDetail/CodeDetail.vue`（国内四级页 + 国际国家页共用）
  - 一次性参数剥离：`smartTechnology/components/utils/filterPayload.ts`

## 1. 这是什么

`fixedScroll.ts` 是智能科技驾驶舱页面内的**锚点平滑滚动工具**。页面滚动容器统一是 `.smart-box-container`（`calc(100% - 88px)` 定高 + `overflow-y: auto`），工具的任务是把该容器**滚动到指定 id 元素的位置**。

目前有两类触发场景，共用同一套滚动核心：

1. **FixedBtn 悬浮快捷导航**：右下角悬浮按钮点菜单项 → 滚到对应模块（`handleFixedBtn`）；
2. **总览「更多」按钮跨页跳转**：营销总览的线索指标「更多」跳到明细页后，**等待接口全部返回、布局定格后平滑定位到线索指标表**（`scrollToAnchor`，配合 `getAnchorTop` 做握稳定判定）。

## 2. 原理

### 2.1 页面结构：缩放容器 + 内部滚动容器

智能科技驾驶舱页面运行在三层结构下：

```
WidthScaleContainer（transform: scale 等比缩放）
  └─ .smart-box-container（calc(100% - 88px) 定高，overflow-y: auto ← 真正的滚动容器）
       └─ 各内容区块（锚点元素带 id）
```

关键矛盾：**`getBoundingClientRect` 返回的是视口视觉像素（已乘 scale），而 `scrollTop` / `clientHeight` 是布局像素**。两者直接混用会算出被缩放放大/缩小的错误滚动量。

### 2.2 滚动量的换算（幂等）

```ts
targetTop = (targetRect.top - containerRect.top) / scale + container.scrollTop - 12
container.scrollTo({ top: targetTop, behavior: 'smooth' })
```

要点：

- **rect 差值 ÷ scale**：两个元素同在缩放容器内，其 rect 差值是被缩放过的视觉距离，除以当前缩放比 `getCurrentScale()` 转回布局像素，再把「容器 scrollTop（布局坐标）」加回去，得到目标顶边在**滚动容器内容坐标系**里的 y；
- **减 `SCROLL_MARGIN_TOP = 12`**：目标的顶边贴着容器可视区顶还留 12px 空白，观感不顶死；
- **幂等性**：滚动过程中再算同一个锚点，`rect 差值` 会随scrollTop 减小而变化，与 `+ scrollTop` 项正好抵消——量出的内容坐标不变。因此「滚动中断后续滚」「先滚后布局微变再校准」都能落到同一个内容位置；
- **`behavior: 'smooth'` 用浏览器原生平滑滚动**：动画时长随距离自适应、缓动由浏览器负责，手感与鼠标滚轮一致。早期版本用 rAF + easeInOutCubic 固定 700ms 手动插值，短距离像「平移」、长距离像「瞬间移动」，已废弃；
- 目标元素或容器不存在时直接 return（组件卸载后延迟触发也安全）。

### 2.3 为什么不直接用 `element.scrollIntoView()` / CSS `scroll-margin-top`

也可以（`MiniFinanceIndex.vue` 的 `.finance-anchor` 就配了 `scroll-margin-top: 12px` 兜底样式），但 `scrollIntoView` 会在多层滚动容器里连带滚动祖先节点，且在缩放容器内的落点受浏览器实现差异影响；`scrollToAnchor` 只动 `.smart-box-container` 一个容器，行为完全可控。

## 3. API

```ts
// 菜单项：key = 锚点元素 id
export interface FixedBtnItem {
  key: string;
  label: string;
}

// 线索指标锚点 id（CodeDetail 根节点），值同时作为 scrollTo 参数带给目标页
export const LEADS_METRICS_ANCHOR_ID = 'leadsMetrics';

// 核心：把 .smart-box-container 平滑滚到 id 元素位置（顶边距容器顶 12px）
export function scrollToAnchor(id: string): void;

// 同款换算、但不含 12px 留白：返回锚点顶边在容器内容坐标系的 y，
// 供调用方判定布局是否稳定（连续两帧一致即定格），不移动滚动
export function getAnchorTop(id: string): number | undefined;

// FixedBtn 菜单点击处理：按 item.key 找锚点滚动（内部就是 scrollToAnchor）
export function handleFixedBtn(item: FixedBtnItem): void;
```

## 4. 用法一：FixedBtn 悬浮快捷导航

页面自带多个功能区块，右下角悬浮按钮提供快捷跳转。三步接入：

```html
<!-- ① 每个区块包一层带 id 的 wrapper（MiniFinanceIndex.vue） -->
<div id="earningsQuality" class="finance-anchor">
  <EarningsQuality />
</div>

<!-- ② 悬浮按钮，fixedList 的 key 对应上述 id -->
<FixedBtn v-if="store.getTabList.length === 0" :fixed-list="fixedList" @handle="onFixedClick" />
```

```ts
// ③ 菜单 + 点击处理（FinanceIndex.vue / MiniFinanceIndex.vue / SpecialCarFinance.vue）
import { handleFixedBtn, type FixedBtnItem } from '../components/utils/fixedScroll';

const fixedList: FixedBtnItem[] = [
  { key: 'earningsQuality', label: '盈利质量' },
  { key: 'cashflowTrend', label: '现金流瀑布' },
  // ...
];
function onFixedClick(item: FixedBtnItem) {
  handleFixedBtn(item);
}
```

注意 wrapper 需要在 `.smart-box-container` 内部；配 `scroll-margin-top: 12px` 样式与 JS 落点留白保持一致。

## 5. 用法二：跨页跳转 + 等接口后定位（「更多」按钮）

### 5.1 发起方：总览「更多」按钮（DomesticRank / InternationalPoint）

跳转参数与销量的「更多」完全一致（`currId` + 父级链 `ids` + `flt` 筛选载荷），**区别只在多带一个一次性参数 `scrollTo=leadsMetrics`**：

```ts
import { buildFilterPayload, FILTER_PAYLOAD_KEY, SCROLL_TARGET_QUERY_KEY } from '.../utils/filterPayload';
import { LEADS_METRICS_ANCHOR_ID } from '.../utils/fixedScroll';

router.push({
  path: route.path,
  query: {
    ...route.query,
    currId: target.currId,
    ids: target.currId.split('_')[0],
    [FILTER_PAYLOAD_KEY]: buildFilterPayload({ ...currentQueryParams?.value ?? {}, region: ['All'] }),
    // 带上即滚动定位；不带的按钮（销量总览）落地后停在页首
    [SCROLL_TARGET_QUERY_KEY]: LEADS_METRICS_ANCHOR_ID,
  },
});
```

**是否滚动的区分完全由「是否携带 scrollTo 参数」决定**，目标页不做任何额外约定。

### 5.2 消费方：CodeDetail（国内四级页 + 国际国家页共用）

根节点是唯一锚点：`<div id="leadsMetrics" class="code-detail">`。挂载时消费参数并滚动：

```ts
onMounted(() => {
  // ① 参数命中才执行；随后立即删掉（一次性参数，残留会造成重复滚动 + 页签身份污染）
  if (route.query[SCROLL_TARGET_QUERY_KEY] !== LEADS_METRICS_ANCHOR_ID) return;
  const query = { ...route.query };
  delete query[SCROLL_TARGET_QUERY_KEY];
  router.replace({ path: route.path, query });

  // ② 参考 useScrollRestore 的 restore 等接口：
  //    先等两帧让各组件派发的请求全部进入在途队列，再轮询等待在途清零
  void (async () => {
    await nextTick();
    await nextTick();
    while (getPendingRequestCount() > 0) {
      await waitForPendingRequests();
    }
    // ③ 布局定格检测（核心）：接口 promise 结束那一刻 DOM 高度还没定稿——
    //    VehicleDetail / SalesTrend 数据到位后会经 useTableScrollY 的
    //    RO(rAF) 链式重测 scroll.y，高度回灌要 2~3 帧才收敛。直接定位会量到
    //    旧高度、滚动量不足、组件显示不全。逐帧读 getAnchorTop，
    //    连续两帧一致即为定格（兜底最多 10 帧），再执行唯一一次平滑定位
    let lastTop: number | undefined;
    for (let i = 0; i < 10; i++) {
      await nextTick();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const top = getAnchorTop(LEADS_METRICS_ANCHOR_ID);
      if (top !== undefined && top === lastTop) break;
      lastTop = top;
    }
    scrollToAnchor(LEADS_METRICS_ANCHOR_ID);
  })();
});
```

### 5.3 时序总览

```
点击「更多」
  → router.push（query 带 currId / ids / flt / scrollTo）
  → 目标明细页挂载，CodeDetail onMounted：
      ① 校验 scrollTo 命中 → router.replace 立即删除
      ② 等两帧（collect 请求队列）→ 轮询 waitForPendingRequests（接口全部返回）
      ③ 逐帧 getAnchorTop 定格检测（连续两帧一致，≤10 帧兜底）
      ④ scrollToAnchor 平滑横向回归唯一一次滚动 → 线索指标顶边距容器顶 12px 完整展示
```

## 6. 注意事项与坑

1. **「三个时点」不能混**：接口 promise 结束 ≠ Vue 渲染完成 ≠ 布局（RO 链收测）定稿。定位必须发生在最晚的时点，用 `getAnchorTop` 连续两帧一致来客观判定，而不是拍脑袋的 setTimeout；
2. **只滚一次**：定格后调用 `scrollToAnchor` 一次即可；若在滚动动画进行途中改名重算，会从当前位置向新目标重新起动画（内容坐标锚点不变，仍会落对点），但反复调用会观感抖动。曾因补加 350ms 延迟重校准出现「滚两次」，已改为定格检测 + 单次滚动；
3. **`scrollTo` 是一次性参数**：
   - CodeDetail 消费后立即 `router.replace` 删除——残留会让本页后续同 query 跳转（如日益往下钻取 spread `...route.query`）重复触发滚动；
   - `filterPayload.ts` 的 `stripPayloadKey` / `normalizeFullPath` 会把它连同 `flt` 一起剥掉，否则页签身份（fullPath）会因参数残留建档不准/建出重复页签；
4. **锚点 id 全文档唯一**：CodeDetail 是国内四级页与国际国家页共用组件，每页单实例；若同页出现两个同名 id，`getElementById` 只会命中第一个；
5. **依赖两个页面结构约定**：滚动容器必须是 `.smart-box-container`（工具内部 `querySelector`），锚点元素必须已存在于该容器内（组件卸载后调用只会空跑、不报错）；
6. **缩放换算的所有输入都是「同容器内的 rect 差值 ÷ 实时缩放比 + 布局 scrollTop」**，滚动前后/缩放前后量出同值（幂等）。不要试图用 `window.innerHeight` 或绝对 rect 计算滚动量——微前端（wujie）里 window 尺寸失真，绝对 rect 是视觉像素，均不可靠。
