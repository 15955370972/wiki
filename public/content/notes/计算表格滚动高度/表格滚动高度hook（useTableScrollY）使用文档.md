# 表格滚动高度自动测算 hook（useTableScrollY）使用文档

日期：2026-11-06（2026-11-10 补充 §8 原生 `<table>` 接入；2026-11-19 补充 §9 页面下方区块与恒内滚——专用车总览接入）
涉及文件：

- hook 实现：`apps/smart-technology/src/views/kongguJww/smartTechnology/components/utils/useTableScrollY.ts`
- 接入示例：`smartTechnology/components/salesDetail/VehicleDetail.vue`（提车明细）、`smartTechnology/components/salesDetail/CodeDetail.vue`（线索明细）
- 接入示例（原生 `<table>` 变体，2026-11-10）：`smartTechnology/components/FinanceIndex/FinancialStatements.vue`（样板）、`smartTechnology/components/miniFinanceIndex/FinancialStatements.vue`、`smartTechnology/components/specialCarFinance/FinancialStatements.vue`，见 §8
- 接入示例（页面下方区块 + 恒内滚按需滚动条变体，2026-11-19）：`smartTechnology/components/specialCarSell/sellOverview/ProjectTableHw.vue`（风险与异常项目预警）、`ProjectTableZb.vue`（重点项目TOP10，含小计行与全屏），见 §9
- 适用边界反面案例：`smartTechnology/components/FinanceIndex/components/DetailTableCard.vue`（卡片内明细表，曾接入后回退并改为自行测量，详见 §7）
- 参考（卡片表格最终采用的本地测量）：`useTableScrollY` 的 RO 惯例（rAF 延迟 + 尺寸去重 + 自身高度去重）被 `DetailTableCard` 的本地测算原样沿用

## 1. 这是什么

给智能科技驾驶舱明细页的多级表头大表格（`CockpitTable`，antd-vue Table 封装）自动测算纵向滚动高度 `scroll.y` 的公共 hook。解决的问题背景：

- 页面运行在 wujie 微前端 + `WidthScaleContainer`（`transform: scale` 等比缩放）+ 内部滚动容器 `.smart-box-container` 三层结构之下，直接用视口高度 / window resize 测量全部失真（详见《提车明细表格高度自适应修复记录.md》）；
- 期望效果：**表底贴住滚动容器可视区底、表头吸顶、行全部内滚；内容放得下时不出现滚动条**。

之前这套逻辑内联在 `VehicleDetail.vue` 里约 90 行；`CodeDetail.vue` 的同类表格没有该能力。本次抽成公共 hook，两个组件各用 **3 行**接入。

## 2. 原理

### 2.1 测量：全部基于滚动容器的布局像素

```
可用高度 = 滚动容器 clientHeight
         - 表格顶边的可视区偏移 topOffset
         - 表头 offsetHeight（scroll.y 只约束表体，表头吸顶在表体上方）
         - 留白 buffer（默认 100，表格下方通常还有趋势图 / 其他明细区块）

topOffset = 表格顶边在容器内容坐标系的 y（rect 差值 ÷ 已应用缩放比 + 容器 scrollTop），
            顶边在首屏内（0 < y < clientHeight）取真实 y；
            顶边在首屏之外（y ≥ clientHeight，即本块未滚动时不可见）取 0
```

要点：

- **顶边在首屏外取 0 的偏置**：下方区块（如线索指标，页面最后一个块）顶边的内容坐标恒大于容器可视高，可直接相减会算出恒为负的可用高度 → `scroll.y` 永远下发不了、一直展示完整表格（CodeDetail 排查出的根因）。偏置后，用户把该块滚进视口时顶边≈容器顶，可用高度即整个可视高度，仍然满足"表底贴住可视区底"；
- **填充边界是内部滚动容器可视区底，不是浏览器视口**——绕开 wujie 隐藏 iframe 中 `window.innerHeight` 恒为 0 的问题；
- `clientHeight / offsetHeight / scrollTop` 是**布局像素**，天然不受 `transform: scale` 影响；唯一的 rect 参与项是"两元素 rect 差值 ÷（缩放元素视觉宽 / 布局宽）"，该缩放比用自身宽高比计算，在任何时刻都自洽，规避了缩放组件延迟重算 scale 的时序问题；
- 顶边换算加回 `scrollTop` 抵消容器滚动，且分支条件只依赖换算结果本身，**滚动前后、缩放前后、窗口拉伸前后量出的都是同一个值**（幂等）；
- 可用高度 ≤ 0 时不下发 `scroll.y`（无效值）；可用高度 < 最小值时兜底到最小高度（默认 160）。

### 2.2 触发：行数 watch（flush: 'post'）+ 滚动容器及其子块的 ResizeObserver

- 数据行数变化 → watch 自动触发（`flush: 'post'`，等 DOM 更新完成后再量）；
- 窗口高度变化 / 全屏切换 / 缩放比重算，最终都体现为 `.smart-box-container` 的布局高度变化 → `ResizeObserver` 观察容器自动触发，比 window resize 覆盖更全、触发时布局已稳定；
- **滚动容器的直接子块也在观察范围内**：本表通常不是滚动容器第一个区块（上面还有提车明细 / 趋势图），它们由并行接口托管、常晚于本表返回，表格顶边随之下移。兄弟块内容撑高只会改变容器内容高度、不会改变容器盒子（被 `overflow-y: auto` 内滚吸收，仅观察容器时 RO 不触发），量出的可用高度就会残旧——下方区块的 `scroll.y` 一直拿不到正确值，内滚"不生效"（CodeDetail 排查出的根因）。观察子块后，任一兄弟块稳定尺寸都会触发重测，最终收敛到布局稳定后的正确值；
- **直接子块被整树重建后自动重挂观察（2026-11-19 补充）**：总览 ↔ 下钻用 `v-if` 切换内容，返回总览时锚点块是全新 DOM 节点，RO 原观察目标变成死节点后兄弟块变化不再触发重测。hook 用 `MutationObserver`（childList，仅直接子级）盯容器，子块重建后 disconnect + 重挂观察并补测一次；
- **window resize 兜底触发（2026-11-19 补充）**：RO 只报「观察目标盒子尺寸变化」——缩放容器（WidthScaleContainer）分步写样式的中间态、微前端事件时序等可能漏发恢复方向的尺寸变化，表现即"窗口缩小后 scroll.y 变小是对的、窗口恢复变大后回不到原值"。hook 补挂 `window.resize`（rAF 延迟 + scrollY 值去重后不形成循环）；RO 漏发的其它场景（如 Teleport 回归）由返回值 `remeasure` 主动补测；
- RO 回调沿用本仓库惯例（BizDataChart / useECharts 等）：rAF 延迟一帧 + 逐目标尺寸去重；`scrollY` 值本身也去重（不变不赋值）——下发 `scroll.y` 限高内滚会改变本表自身子块盒子的尺寸、回触发 RO，去重后及时收敛，不会形成循环；
- **无死循环**：`.smart-box-container` 是 `calc(100% - 88px)` 定高（上级链路全部定高 + `overflow: hidden`），表格内容高度变高被 `overflow-y: auto` 内滚吸收，不会回灌被观察的容器盒子。

### 2.3 下发：内容放得下就不传 `scroll.y`

antd-vue 4.2.6 只要收到 `scroll.y` 就把表体写死 `overflow-y: scroll`（滚动条常驻）。因此 hook 返回的 `scrollY` 按需：

```
行总高 = 行数 × 行高（默认 40px，即 CockpitTable 表体 td 固定行高）

触发 = 行总高 > 可用最大高度
scrollY = 触发 ? 最大高度 : undefined
```

- 放得下：不传 `scroll.y`，表体不限高自然铺开，无滚动条；
- 放不下：下发最大高度，表体限高内滚、表头吸顶、滚动条按需出现；
- `scrollTriggerRows` 模式：触发条件叠加「行数 > 阈值」，但仍**必须同时满足**「行总高 > 可用最大高度」才下发——这是防回灌闸门（见 §7）；
- `alwaysScroll` 模式（2026-11-19 补充）：有数据就**恒下发** `scroll.y`（表体恒内滚、表头恒吸顶、区域随窗口变化），配合组件内滚动条按需出现的 CSS 覆盖消除滚动条常驻副作用——适合分页小表，详见 §9。

### 2.4 2026-11-06 扩展：availableY 与 scrollTriggerRows

本轮接入卡片内明细表（DetailTableCard）时对 hook 做了两处向后兼容的扩展（提车/线索明细等旧调用方零改动）：

- **返回值新增 `availableY`**：重测出的可用高度（已扣表头与留白）。供「不足 N 行时均分撑满」这类需要按可用高度二次分配布局的场景消费；
- **options 新增 `scrollTriggerRows`**：把滚动触发从「行总高超限」切换/叠加为「行数超阈值的阶梯策略」；
- **触发表达式统一加闸门**：任何模式下都必须 `行总高 > maxHeight` 才会下发 `scroll.y`。`scrollTriggerRows` 模式拿这句话当防回灌闸门（见 §7 详述）。

## 3. API

```ts
function useTableScrollY(
  rowCount: () => number,
  options?: UseTableScrollYOptions,
): {
  tableWrapRef: Ref<HTMLElement | null>;
  scrollY: Ref<number | undefined>;
  availableY: Ref<number | undefined>;
  remeasure: () => void;
}
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `rowCount` | `() => number` | 表格行数 getter（通常是 `() => tableData.value.length`），变化后自动在 DOM 更新完成后重测 |
| `options.rowHeight` | `number` | 单行布局高度，默认 `40`（CockpitTable 表体 td 固定行高） |
| `options.minHeight` | `number` | 可用高度过小时的兜底最小高度，默认 `160` |
| `options.bottomBuffer` | `number` | 表底距滚动容器可视区底的留白，默认 `100` |
| `options.scrollContainerSelector` | `string` | 滚动容器选择器（`closest` 查找），其可视区底是表格填充边界、也是 RO 观察目标，默认 `'.smart-box-container'` |
| `options.screenSelector` | `string` | 缩放容器选择器（`closest` 查找），`transform: scale` 缩放元素，用于把 rect 视觉像素换算回设计像素，默认 `'.width-scale-container__screen'` |
| `options.scrollTriggerRows` | `number` | 行数阶梯阈值：传入后触发条件叠加「行数 > 阈值」（仍需满足「行总高 > 可用高度」）；不传保持按行总高判断 |
| `options.topOffsetMode` | `'auto' \| 'zero'` | 顶边偏移量测模式，默认 `'auto'`。`'auto'`：表格顶边设计坐标落在首屏内时按真实顶边偏移压缩可用高度，只适合滚动容器**首个**区块；`'zero'`：顶边偏移恒按 0，适合页面**下方**区块（上方还有多个大块，滚进视口即表底贴住可视区底），详见 §9 |
| `options.alwaysScroll` | `boolean` | 恒内滚模式，默认 `false`。传 `true` 后有数据就恒下发 `scroll.y`（表体恒限高内滚、表头恒吸顶、区域随窗口变化）；滚动条常驻副作用由调用方按 §9.4 用 CSS 覆盖为按需出现 |

| 返回 | 说明 |
| --- | --- |
| `tableWrapRef` | 模板 ref，绑到包住 `CockpitTable` 的容器元素上（负责向上查找滚动容器与缩放容器） |
| `scrollY` | 直接透传给 `CockpitTable` 的 `:scroll-y`；放得下时为 `undefined` |
| `availableY` | 重测出的可用高度（已扣表头与留白），供「按可用高度二次分配布局」的场景消费 |
| `remeasure` | 主动补测一次（内部 rAF 延迟）。RO 不触发的场景使用，如全屏 `Teleport` 回归后（页面占位容器撑住布局、锚点盒子不变，RO 不会自动触发） |

生命周期（挂载首测、RO 建立与销毁、rAF 清理）全部由 hook 内部处理，调用方无感知。

## 4. 使用方式（3 行接入）

```vue
<template>
  <div ref="tableWrapRef" class="table-wrap">          <!-- ① 绑 ref -->
    <CockpitTable :columns="columns" :data="tableData" :scroll-y="scrollY" />  <!-- ② 透传 scroll-y -->
    ...
  </div>
</template>

<script setup lang="ts">
import { useTableScrollY } from '@/views/kongguJww/smartTechnology/components/utils/useTableScrollY';

// 行数来源，需先于 hook 调用声明（见 §6 注意事项）
const tableData = ref<Record<string, any>[]>([]);

// 一行调用，行数 getter 传入
const { tableWrapRef, scrollY } = useTableScrollY(() => tableData.value.length);
</script>
```

实际接入示例：

- `CodeDetail.vue`（线索指标，本次新增能力）：
  ```ts
  const { tableWrapRef, scrollY } = useTableScrollY(() => tableData.value.length);
  ```
- `VehicleDetail.vue`（提车明细，原来 90 行内联逻辑收敛为一行，变量改名对齐返回值）：
  ```ts
  const { tableWrapRef, scrollY: tableScrollY } = useTableScrollY(() => tableData.value.length);
  ```

## 5. 不需要做的事

|原来需要手动处理|现在由 hook 负责|
| --- | --- |
| 珊瑚定 `SCROLL_Y_*` 常量、`updateBodyScrollY` / `bodyScrollY` / `tableScrollY` 一整套 | 一行调用 + 两个返回值 |
| `watch(行数, 重测, { flush: 'post' })` | 传入行数 getter 即可 |
| 滚动容器 ResizeObserver + rAF + 去重 + 卸载清理 | 内部完成 |
| 挂载后首测、缩放 / 滚动 / 窗口变化重测 | 内部完成 |
| 放得下不下发 `scroll.y` 的按需判断 | `scrollY` 直接就是按需结果 |

## 6. 注意事项 / 约束

1. **hook 调用必须放在行数来源声明之后**（如 `tableData` 之后）：watch 注册时会立即执行 getter，若 getter 引用后续才声明的 `const` 会触发 TDZ 报错；
2. 仅适用于本驾驶舱体系：默认需要 `.smart-box-container` 内部滚动容器与 `.width-scale-container__screen` 缩放容器作为查找祖先，附近找不到容器时静默不生效（不报错）；在其他布局体系复用时，通过 `options.scrollContainerSelector` / `options.screenSelector` 换成目标体系的选择器（缩放容器缺失不影响运行，只是不做视觉像素换算）；
3. 可用高度 ≤ 0（如容器不可见 / 尚未布局）时不下发 `scroll.y`，待 RO / 行数变化触发重测；
4. 行高默认 40px 表示 CockpitTable 表体 td 固定行高；如表体行高样式调整，用 `options.rowHeight` 同步，否则"放得下"的判断会失准；
5. 底部留白默认 100px 的前提是"表格下方还有其他区块"；若表格是该滚动容器最后一个区块，可传 `bottomBuffer` 更小的值让表格尽量贴底；
6. 本表位于滚动容器**下方区块**（上方还有多个大块）或为**分页小表**时，按 §9 传 `topOffsetMode: 'zero'` + `alwaysScroll: true`，并按 §9.4 加滚动条按需出现的 CSS 覆盖——否则顶边偏移跳变与「放得下不下发」会造成"表头随内容滚动 / 滚动条延伸到表头、窗口恢复后表体高度与滚动条状态回不到原值"两类 bug。

## 7. 适用边界：页面级表格能接，卡片级表格不能接（DetailTableCard 的接入与回退）

### 7.1 为什么两种场景不一样

`useTableScrollY` 解决的是「**页面流内的块**」：表格高度与滚动容器高度互相独立——表格内容变高被容器 `overflow-y: auto` 内滚吸收，容器的 `clientHeight` 恒定，量出的可用高度**不依赖表格自身高度**，无法回灌。

「**卡片内的表格**」（`DetailTableCard`，运营效率卡片组里的明细表卡）不一样：卡片有 270px 定高等高布局，表格要撑满卡片。「可用高度」直接从卡片根节点（`.detail-table-card`）上量，而卡片根的高度**可能由内容撑开（auto）**——一旦行高变化，卡片高跟着变，可用高度跟着变，形成回灌。

### 7.2 踩过的两个坑（同一根因）

| 现象 | 推导（卡片 auto 高时） |
| --- | --- |
| 行高一路增大（K1 版：量卡片高 → 算均分行高） | `卡高 = 行总高 + 标题等常数`，`可用 = 卡高 - 顶边 - 表头 = 行总高 + 常数差`。每轮用可用高度重派行高，行总高每轮 +16px，无界增长 |
| scroll.y 每轮缩小（下游隐患） | 同样口径下 `scroll.y = 行总高 + 常数差`，每轮都小于内容高，表体被压、下轮再压，无界收缩 |

根因一致：**测量的基准盒子高度会随本次测量的消费结果（行高 / scroll.y）而变**，公式不是不动点，测一次变一次。

### 7.3 回退与最终方案（本地测算，测量基准自洽）

hook 的扩展（`scrollTriggerRows` + `availableY` + 闸门）保留在公共 hook 里供后续复用；`DetailTableCard` 本身回退为**组件内自助测量**，关键变化：

1. **测量基准从「祖先盒子」换成「`.table-wrap` 自身盒高」**。表格区包一层 `.table-wrap`（卡片根 `flex` 纵向布局，`.table-wrap` `flex: 1`）：
   - 卡片定高时 `.table-wrap` 由 flex 定高，与行高无关；
   - 卡片 auto 时行距 `rowH = (wrap − header) / n` 自身就是不动点：`rowH_new = (header + n·rowH_old − header) / n ≡ rowH_old`，方程自洽，**不存在回灌**（旧口径里它约等于 `行总高 ± 常数差`，每轮必漂移）。
2. **本地 ResizeObserver**：只观察 `.table-wrap`，沿用 hook 的 RO 惯例（rAF 延迟一帧 + `wrapHeight/headerHeight` 值去重，不变不赋值，自身变化回触发 RO 时即时收敛）。
3. **三态样式钩子**（`wrapHeight − headerHeight = 表身高 bodyHeight`）：
   - **空数据**：`--empty`，`#emptyText` 插槽换成与 SolidPieCard 一致的 `<a-empty :image-style="{ height: '60px' }" />`，占位行吃满表身、垂直居中；
    - **≤ 6 行**：`--fill`，每行行距 = `表身高 / 行数` **整数化**（下限 20px，除不尽的余数整像素归最后一行）——不能下发非整数行高：部分机器的 DPR / 浏览器缩放会对非整数行高按物理像素取整，每行累积零点几像素使行总高 > 表身、auto 卡片下逐轮回灌爬升（「滚动区域总高度一直增加」的残余死循环即此因）。行距经 CSS 变量 `--detail-row-height` 下发（td 内容高 = 行距 − 1px），最后一行走 `--detail-last-row-height`，td 上下 padding 清零 + `vertical-align: middle`，表格充满卡片并保留卡片下内边距；
   - **> 6 行**：`--scroll`，行高固定 32px（td `line-height: 19px` + 6px×2 padding + 1px 边框钉死），行总高 > 表身高才下发 `scroll.y` 限高内滚（auto 卡片下两者恒相等、不下发）。
4. **右边界对齐**：antd 固定表头时表体常驻滚动条占右侧 6px，表体表比表头表窄 6px 导致两边边框错位；滚动态给 `.ant-table-body` 负外边距 `margin-right: -6px`，把滚动条挂到表格右外侧，表头/表体表宽恢复一致。
5. **整数化行高**：均分行距 `floor(表身高 / n)`、余数整像素归最后一行（`--detail-row-height` + `--detail-last-row-height` 两个变量）——非整数行高会被不同机器 DPR / 浏览器缩放按物理像素取整，逐行累积使行总高 > 表身、auto 卡片逐轮回灌（Windows 显示缩放 100% 下也实测出现过，建议无论机器一律整数化）。
6. **回声护栏（最终防线）**：`measureWrap` 里冻结条件——行数与表头都未变时，wrap 高的「增长」只能是自身写入的行高被外层 auto 容器逐帧重新计入的回声，直接忽略不再重派，从机制上阻断滚动区域总高度的持续爬升；定高布局下行高写入本不改 wrap 高，该护栏只放过收缩与行数/表头变化（数据减少、外部真实变高都会正常重算）。
7. **表头占位必须含表框边框（+1px 死循环真凶）**：antd bordered 给 `table` 元素本身画 `border-top: 1px solid`（`es/table/style/bordered.js`：`> content, > header > table { borderTop }`）。只按 `.ant-table-thead` (43px) 量表头时：fill 单表实际高度 = 1 + 43 + 行总高 = wrap + 1；滚动态 `.ant-table-header` 容器高 = 1 + 43，用 43 算 `scroll.y` 会多 1px——两种态在 auto 卡片下都是**每帧 +1px、与机器无关**的持续增长。修复：表头块口径统一为首块实测——滚动态量 `.ant-table-header` offsetHeight（自带边框），fill/空态量 `.ant-table-thead` + `getComputedStyle(table).borderTopWidth`；占位行同理须扣自身 1px 下边框（内容高 = 表身高 − 1）。教训：**一切被用作"减数"的实测占位高度，必须把所在元素自身的边框一起算进去**，1px 的口径差就是每帧 +1px 的死循环。
8. **为什么 100% 显示缩放出现、175% 不出现**：+1px 口径差在布局层面与缩放无关，理论上任何 DPR 都每帧 +1px；175% "幸免"属于渲染/观察的表象差异，机制上不能依赖：
   - **DPR ≠ 1 的绘制取整吸收增量**：100%（DPR=1）物理像素 = CSS 像素，1:1 严格取整，`clientHeight` 干净单调 +1，肉眼秒级可见；175%（DPR=1.75）1 CSS px = 1.75 物理像素，边框 / 行高 extents 吸附到 1/1.75 px 的物理网格（LayoutNG snap 网格），±0.75 物理像素被取整吸收或奇偶震荡，增量变成 0 或来回抖动而非干净 +1，配合"值不变直接跳过"的去重即提前收敛；
   - **缩放把增量缩小**：175% 下驾驶舱整体被 `transform: scale` 包装，每帧 +1px 落屏不足 0.6 物理像素，且外层是 overflow-y: auto 内滚容器，增长先被吸收；
   - **观察窗口不同**：不同缩放档位常伴不同窗口尺寸 → 缩放比、行数（fill/scroll 态）、表头行数（带不带单位）都不同，可能没走到相同的回灌路径（如卡片处于定高行布局时，+1px 只溢出到 padding 里、不形成回灌）。
   - **结论**：修复针对口径差本身，与缩放无关；修复后 100% 与 175% 都应一步收敛。跨机器表象差异（有的 100% 出、有的 175% 出、有的不出）不可依赖，必须靠与机器无关的兜底——整数化 + 回声护栏。

### 7.4 本次接入示例与关键代码（DetailTableCard.vue）

**模板**（`a-table` 包一层 `.table-wrap`，态样式钩子 + 行距 CSS 变量 + 空态插槽）：

```html
<!-- 卡片根 = CardComp（.card-comp），内容区包 wrap 撑满剩余高度 -->
<div ref="tableWrapRef" class="table-wrap">
  <a-table
    class="detail-table"
    :class="tableModeClass"          <!-- --empty / --fill / --scroll 三态钩子 -->
    :style="tableStyle"              <!-- 均分行距 / 空态占位行高经 CSS 变量下发 -->
    :columns="columns"
    :data-source="displayRows"
    :pagination="false"
    :bordered="true"
    size="small"
    :row-key="rowKey"
    :scroll="tableScroll"            <!-- 仅 > 6 行且放不下时 { y: 表身高 }，否则 undefined -->
  >
    <template #headerCell="{ column }"> ... 表头（名称 + （单位）两行） ... </template>
    <template #bodyCell="{ column, record }"> ... 普通列 / 涨跌率列 ... </template>

    <!-- 空态与 SolidPieCard 保持同一套 a-empty -->
    <template #emptyText>
      <a-empty description="暂无数据" :image-style="{ height: '60px' }" />
    </template>
  </a-table>
</div>
```

**常量与数据源**：

```ts
/** 表体单行高度：td 内容行高 19px + 上下 6px 内边距 + 1px 边框 = 32px（见 CSS 钉死） */
const TABLE_ROW_HEIGHT = 32;
/** 行距下限：内容线 19px + 1px 下边框（再小行内容压不住） */
const MIN_ROW_HEIGHT = 20;
/** 均分撑满阈值：≤ 6 行均分撑满卡片，> 6 行固定行高内部滚动 */
const FILL_MAX_ROWS = 6;

/** 表格数据源：有 radioList 时按选中 key 取 radioRowsMap，否则用 dataSource */
const displayRows = computed<Record<string, any>[]>(() =>
  props.radioList?.length ? props.radioRowsMap?.[activeRadioKey.value] ?? [] : props.dataSource,
);
```

**本地测量（不动点基准 + hook 的 RO 惯例：rAF 延迟 + 尺寸去重）**：

```ts
const tableWrapRef = ref<HTMLElement | null>(null);
const wrapHeight = ref(0);     // .table-wrap 自身盒高（定高时与行高无关 → 无回灌）
const headerHeight = ref(0);   // .ant-table-thead 的 offsetHeight（随表头结构实时量）
let wrapRO: ResizeObserver | null = null;
let measureRaf = 0;

function measureWrap() {
  const el = tableWrapRef.value;
  if (!el || !el.isConnected) return;
  const headerH = el.querySelector<HTMLElement>('.ant-table-thead')?.offsetHeight ?? 0;
  const wrapH = el.clientHeight;
  // 值未变直接跳过：自身尺寸变化回触发 RO，去重后不形成循环
  if (wrapHeight.value === wrapH && headerHeight.value === headerH) return;
  wrapHeight.value = wrapH;
  headerHeight.value = headerH;
}

function scheduleMeasure() {          // RO 回调统一走 rAF 延迟一帧
  if (measureRaf) cancelAnimationFrame(measureRaf);
  measureRaf = requestAnimationFrame(() => { measureRaf = 0; measureWrap(); });
}

watch(displayRows, scheduleMeasure, { flush: 'post' });   // 行数变化 → DOM 更新完再量

onMounted(() => {
  measureWrap();                      // 挂载首测
  if (tableWrapRef.value && typeof ResizeObserver !== 'undefined') {
    wrapRO = new ResizeObserver(scheduleMeasure);
    wrapRO.observe(tableWrapRef.value);
  }
});
onBeforeUnmount(() => {               // 卸载清理
  if (measureRaf) cancelAnimationFrame(measureRaf);
  measureRaf = 0;
  wrapRO?.disconnect();
  wrapRO = null;
});
```

**三态判定与 CSS 变量下发**：

```ts
/** 表身可用高度：wrap 高 - 表头高（均分 / 滚动 / 空态占位共用） */
const bodyHeight = computed(() => {
  const wrap = wrapHeight.value, header = headerHeight.value;
  return wrap > 0 && header > 0 ? wrap - header : undefined;
});

// ≤ 6 行：均分行距整数化 = floor(表身高 / n)，余数整像素归最后一行（下限 20px）。
// 不能下发非整数行高——部分机器 DPR/缩放按物理像素取整，逐行累积回灌
const fillRowHeights = computed(() => {
  const n = displayRows.value.length;
  if (!n || n > FILL_MAX_ROWS) return undefined;
  const available = bodyHeight.value;
  if (available == null) return undefined;
  const base = Math.max(MIN_ROW_HEIGHT, Math.floor(available / n));
  const last = Math.max(MIN_ROW_HEIGHT, available - base * (n - 1));
  return { base, last };
});

// > 6 行：行总高 > 表身高才下发 scroll.y（auto 卡片下两者恒等 → 不下发、无回灌）
const tableScroll = computed(() => {
  const n = displayRows.value.length;
  if (!n || n <= FILL_MAX_ROWS) return undefined;
  const available = bodyHeight.value;
  if (available == null) return undefined;
  return n * TABLE_ROW_HEIGHT > available ? { y: available } : undefined;
});

// 三态样式钩子：0 行 → --empty；≤ 6 行 → --fill；> 6 行 → --scroll
const tableModeClass = computed(() => {
  if (tableScroll.value) return 'detail-table--scroll';
  if (displayRows.value.length === 0) return 'detail-table--empty';
  if (fillRowHeights.value != null) return 'detail-table--fill';
  return '';
});

// 行距下发为 CSS 变量（td 内容高 = 行距 - 1px；空数据时占位行独占整段表身）
const tableStyle = computed(() => {
  const n = displayRows.value.length;
  if (n === 0)
    return bodyHeight.value != null ? { '--detail-row-height': bodyHeight.value + 'px' } : undefined;
  const heights = fillRowHeights.value;
  if (heights == null) return undefined;
  return {
    '--detail-row-height': `${Math.max(0, heights.base - 1)}px`,
    '--detail-last-row-height': `${Math.max(0, heights.last - 1)}px`,
  };
});
```

**关键 CSS**：

```scss
// 卡片根：纵向 flex（标题 + 表格区）；子级 .table-wrap flex:1 撑满剩余高度。
// 撑满边界 = 卡片内容区底边（卡片自身 16px 下内边距保留）。
// 上边距放 wrap 上而不是表格上，保持表头顶点偏移测量口径稳定。
.detail-table-card { display: flex; flex-direction: column; height: 100%; }
.table-wrap { flex: 1 1 auto; min-height: 0; margin-top: 12px; }

// 行高钉死：内容 19px + 上下 6px 内边距 + 1px 下边框 = 32px 行距
.detail-table {
  :deep(.ant-table-tbody > tr > td) {
    padding: 6px 4px !important;
    line-height: 19px;               // 行高确定 → rowCount × 32 换算行总高才精确
    font-size: 12px;
    text-align: center;
    white-space: nowrap;             // 不折行，行高不被内容撑开
  }

  // 固定表头（scroll.y）时 tbody 里的隐藏 measure-row 会撑开表头与首行间隙，还原之
  :deep(.ant-table-tbody > tr.ant-table-measure-row > td) {
    height: 0 !important; padding: 0 !important; border: 0 !important;
  }

  // 均分撑满（≤ 6 行）：td 内容高 = 行距 - 1px（去掉上下内边距），
  // vertical-align: middle 居中；内容超出行距时仍按最小内容高兜底。
  // 行距全部整数像素（余数归最后一行），规避不同机器 DPR / 缩放的非整数
  // 行高物理取整逐轮累积回灌
  &.detail-table--fill {
    :deep(.ant-table-tbody > tr > td) {
      height: var(--detail-row-height);
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      vertical-align: middle;
    }

    // 最后一行：吃掉均分余数后的独立行高
    :deep(.ant-table-tbody > tr:last-child > td) {
      height: var(--detail-last-row-height);
    }
  }

  // 空数据：占位行吃满表身，'暂无数据 + 占位图' 垂直居中（与饼图卡空态一致）
  &.detail-table--empty {
    :deep(.ant-table-tbody > tr.ant-table-placeholder > td) {
      height: var(--detail-row-height);
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      vertical-align: middle;
    }
  }

  // 内部滚动（> 6 行）：antd 固定表头时表体常驻滚动条占右侧 6px，
  // 表体表比表头表窄 6px、两边最右的边框错位；表体负外边距把滚动条
  // 挂到表格右外侧（卡片内边距内），表头/表体表宽恢复一致、右边框贴最右
  &.detail-table--scroll {
    :deep(.ant-table-body) { margin-right: -6px; }
  }

  // 滚动条美化沿用 DownComp3 / TableComp 规范：6px 细条、透明轨道、#cedff0 轨坑
  :deep(.ant-table-body) {
    scrollbar-width: thin;
    scrollbar-color: #cedff0 transparent;
    &::-webkit-scrollbar { width: 6px; height: 6px; }
    ...
  }
}
```

### 7.5 复用结论

- **流式页面里的块级大表**：接 `useTableScrollY`（一次接入 3 行）；
- **卡片等高布局内的表格**：不要把 hook 的 `scrollContainerSelector` 指到会被内容撑高的祖先/基准上；如需 hook 的 RO 惯例，按 `DetailTableCard` 的方式「测不动点盒子（自身包裹层）」，或者让 hook 只在测量基准高度与表格高度无关（定高）时使用。

## 8. 原生 `<table>` 接入（2026-11-10）：availableY 限高内滚 + 表头绝对定位副本

### 8.1 场景与背景问题

财务报表概览大表不是 antd 表格，而是带合并表头（3 行，含 `rowspan` / `colspan`）的原生 `<table>`（`FinanceIndex/FinancialStatements.vue` 及同构的 `miniFinanceIndex`、`specialCarFinance` 两处）。此前的问题：

- 纵向不限高，内容超出可视区时靠外层容器滚动，不能"一屏内展示"；
- 表头用表组级 `position: sticky` 吸顶（specialCar 更早已因此把表格拆成"冻结列双表"规避列 sticky）——Chromium 系浏览器对**表组级** sticky 存在内容绘制穿透：滚动中的正文文字/边线从吸顶表头里透出来。

本轮统一改为：`useTableScrollY` 测出的 `availableY` 做限高内滚 + **绝对定位表头副本钉顶**（不用 sticky），三个文件同构。

### 8.2 与 antd 场景（§4）接入方式的差异

|差异点|antd 场景|原生 `<table>` 场景|
| --- | --- | --- |
| hook 返回值的消费 | `scrollY` 透传给 `CockpitTable` | **不用 `scrollY`**，只用 `availableY`：本地把内层滚动盒子限高到 `availableY - 横向滚动条占位` |
| 行高 | 40（CockpitTable td） | 44（原生 td 定高，`options.rowHeight` 传入） |
| 留白 | 默认 100（页面级表格） | 80（本表是滚动容器最后一个区块，`options.bottomBuffer` 传入） |
| 排除口径 | availableY 已扣表头高（量 `.ant-table-thead`） | hook 里 `.ant-table-thead` 量不到（=0）→ availableY 即「容器可视高 - 顶边偏移 - 留白」，**不扣 120px 表头**：限高目标是整表，表头在滚动层内部随内容上滚，由副本钉顶补位 |
| 回放测基准 | 表高与容器高互相独立 | 本地再量表格自身盒高（见 §8.4，不动点原理同 §7 结论） |

### 8.3 结构

```
.finance-table-scroll（hook 的 tableWrapRef 绑定处）
└ .finance-table-hscroll   横向滚动层（overflow-x: auto；position: relative ← 副本定位参照；滚动条美化、始终可见）
  ├ .finance-table-box     纵向滚动层（overflow: hidden auto；滚动条隐藏；限高 :style 绑 scrollBoxStyle）
  │ └ table                真实表：全部表头（含三行合并表头）正常在流内，随内容上滚
  └ .finance-table-head-clone  表头副本（position: absolute; top: 0; left: 0; z-index; pointer-events: none），仅在限高内滚时渲染
```

- **限高判定**：本地 `ResizeObserver` 量 `table.offsetHeight`（rAF 延迟 + 值去重）。测量基准 = 表格自身盒子，与限高下发值无关 → 不动点、不回灌（§7 结论的直接应用）；`tableHeight > availableY − 横向滚动条高(8px)` 才限高，放得下时自然铺开且不出副本；
- **副本钉顶原理**：绝对定位的 containing block 是 `.finance-table-hscroll`——它只横向滚动、不纵向滚动，所以副本在纵向内滚时纹丝不动、盖住掠过顶部的表头/内容；本层横向滚动时副本随内容自动同步位移（无需 JS）；`pointer-events: none` 保证滚轮手势穿透到下方内容继续内滚。

### 8.4 接入示例与关键代码（FinanceIndex/FinancialStatements.vue）

#### 8.4.0 先用白话把整个方案讲通（30 秒理解）

这个表要解决两个方向的"超"：**行多**（纵向超一屏）、**列多/字宽**（横向超屏宽）。目标是整块只占一屏、超了就**在块的内部自己滚**；并且纵向滚动时表头始终钉在顶部——但 `sticky` 在浏览器里有"正文从表头透出来"的渲染 bug，所以表头不用 sticky，改用"贴一个替身"。

四层结构，**每层只干一件事**：

```
① hscroll      管横向滚动（overflow-x: auto）；position: relative 给替身当定位基准
  └ ② box      管纵向滚动（行多时给它限高，表格再高也只在这个盒子里滚）
      └ table  真表：完整渲染，只被"测量"，不改它
  └ ③ clone    表头的替身，absolute 钉在 ① 顶部（注意：不在 ② 里面！）
```

关键三句话：

1. **替身为什么钉得住**：绝对定位元素跟着它的定位父级走。替身的父级是 ①，而 ① 只横向滚、从不纵向滚——②里内容滚上去、真表头跟着上移，**替身原地不动，永远盖在顶部**；横向滚 ① 时 ①②替身一起移动，横向永远对齐（所以横向同步一行 JS 都不用写）。`pointer-events: none` 让滚轮穿过替身传给下方内容，鼠标停在表头上也能滚；
2. **替身为什么要量列宽**：替身是独立的表，浏览器不会自动把它和真表的列对齐。于是等真表渲染完，取**第一个数据行**（表头全是合并单元格切不出单列边界；数据行每个格子恰好对应一列），用 `cell.offsetLeft` 相邻相减得到每列真实宽度，塞进替身的 `<colgroup>` 并用 `table-layout: fixed`（fixed = 列宽"我说了算"，浏览器不再自己算）→ 替身与真表逐像素对齐；
3. **限高怎么决定**：hook 的 `availableY` ≈ 这块还剩多高可用；本地量真表总高 `tableHeight`。**塞得下就不限高**（自然铺开、不出替身——真表头本来就在顶部）；塞不下才限高（扣 8px 横向滚动条厚度，不然最后一行被压住）。量的是表格自己而不是祖先 → 限高不会反过来改表格高度，闭环稳定不死循环。

量取只解决"第一次对"；**什么时候重新量**由两个源兜底：RO 管表格"尺寸变了"（换数据行数变化）；watch 数据对象管"尺寸没变但文案变了"（如同名次换公司名，表格尺寸完全相同、RO 不触发）。`observeTable` 里 disconnect 再 observe 是因为换数据时 Vue 会替换整张表节点，旧 RO 挂在死节点上永远不再触发。

最后一个隐蔽坑：表格 `width: 100%` **不含自身边框**，实际外形总比 ② 盒子宽 1~2px——真表被 ② 的 `overflow-x: hidden` 裁掉没人看见，但替身挂在 ① 下面，滚动条计算把这 1~2px 也算进去 → **内容放得下也常驻横向滚动条**（幻影）。修复：给替身套一个和 ② 一样宽、`overflow: hidden` 的框，替身与真表被"裁"得一模一样。

**三种状态的最终效果**：

| 数据情况 | 页面表现 |
| --- | --- |
| 行少 + 列窄 | 普通表格，无滚动条、无替身 |
| 行多（纵向超屏） | 限高内滚 + 表头替身钉顶 |
| 列真溢出 | 另外出现横向滚动条（真溢出才有） |

以下段落是按上面这套思路展开的完整代码。

#### 8.4.1 模板（四层结构：滚动层 → 纵向盒 → 真实表 + 绝对定位副本）

```html
<div ref="tableWrapRef" class="finance-table-scroll">
  <!-- 空态在滚动链之外，空态高度不参与"放得下"判断 -->
  <div v-if="!hasData" class="finance-table-empty">
    <a-empty :description="'暂无数据'" :image-style="{ height: '60px' }" />
  </div>
  <template v-else>
    <!-- ① 横向滚动层：唯一展示滚动条的层；position: relative 是副本的定位参照 -->
    <div class="finance-table-hscroll">
      <!-- ② 纵向滚动层：滚动条隐藏；放不下时才收 :style 限高，放得下为 undefined -->
      <div class="finance-table-box" :style="scrollBoxStyle">
        <table ref="tableRef" class="finance-table">
          <thead>
            <!-- 三行合并表头，与普通表格写法无异：不吸顶，随内容上滚 -->
            <tr>
              <th colspan="3">{{ reportMonth }}</th>
              <!-- 合并单元格跨行跨列，正常使用 -->
              <th class="primary-company-header" colspan="2" rowspan="2">
                <span>{{ primaryCompanyHeader.name }}</span>
                <span v-if="primaryCompanyHeader.note">{{ primaryCompanyHeader.note }}</span>
              </th>
              <th v-for="(_, index) in subsidiaryCompanies" :key="index" colspan="2">
                <span class="company-index">{{ index + 1 }}</span>
              </th>
            </tr>
            <!-- 第 2 / 第 3 行依数据正常渲染（略） -->
          </thead>
          <tbody>
            <!-- 表体正文（略）；firstRow.cells 是后面量列宽的基准 -->
          </tbody>
        </table>
      </div>
      <!-- ③ 表头副本：同一份响应式数据驱动的「双份模板」（不要 cloneNode 后改真值） -->
      <div v-if="showHeadClone" class="finance-table-head-clone" :style="headCloneWrapStyle">
        <table class="finance-table" :style="headCloneTableStyle">
          <!-- colgroup 逐列喂进实测列宽；副本表 fixed 布局，只渲染表头 -->
          <colgroup>
            <col
              v-for="(width, index) in headColumnWidths"
              :key="index"
              :style="{ width: `${width}px` }"
            />
          </colgroup>
          <thead>
            <!-- 与真实表第一个 thead 完全同数据、同结构（同上三行合并表头，略） -->
          </thead>
        </table>
      </div>
    </div>
  </template>
</div>
```

#### 8.4.2 script（hook 接入 1 行 + 两套本地测量 + 4 个按需 computed）

```ts
/** 表体行高：td 在 CSS 钉死 44px（ §8.7 第 1 条：口径必须一致） */
const TABLE_ROW_HEIGHT = 44;
/** 本表是滚动容器最后一个区块，底部留白压小（默认 100 偏大） */
const BOTTOM_BUFFER = 80;
/** 横向滚动条高（6px 细条 + 余量），限高时先从可用高扣除 */
const HSCROLLBAR_HEIGHT = 8;

const totalRows = computed(() => balanceSheet.value.rows.length + taxStats.value.rows.length);

// 与 antd 场景相同的 1 行接入；原生表不消费 scrollY，只用 availableY
const { tableWrapRef, availableY } = useTableScrollY(() => totalRows.value, {
  rowHeight: TABLE_ROW_HEIGHT,
  bottomBuffer: BOTTOM_BUFFER,
});

// ==================== 表高与副本列宽：本地 RO（沿用 hook 的 rAF + 值去重惯例） ====================
const tableRef = ref<HTMLTableElement | null>(null);
const tableHeight = ref(0);
const headColumnWidths = ref<number[]>([]);
const headCloneWidth = ref(0); // 副本表 inline width = 真实表 offsetWidth
const headCloneWrapWidth = ref(0); // 副本包裹层宽 = 真实滚动盒 offsetWidth
let tableRO: ResizeObserver | null = null;
let observedTableEl: HTMLTableElement | null = null;
let measureRaf = 0;

/** 列宽数组按值比较：内容/尺寸未变时不替换引用，避免 colgroup 无效重渲染。 */
const sameWidths = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

function measureHeaderClone() {
  headColumnWidths.value = [];
  headCloneWidth.value = 0;
  headCloneWrapWidth.value = 0;
  const table = tableRef.value;
  if (!table || !table.isConnected) return;
  // 包裹层宽取真实盒子（父级 .finance-table-box）的 offsetWidth：
  // 给副本做 overflow: hidden 的裁剪基准（ §8.7 第 6 条幻影滚动条）
  headCloneWrapWidth.value = table.parentElement?.offsetWidth ?? 0;
  // 取第一个有数据行的表体行：其单元格数恰与总列数一致（含 rowspan 单元格），
  // 单元格左边界即各列起点，末列右边界用表格盒右边界补足
  const firstRow = Array.from(table.tBodies).find((body) => body.rows.length > 0)?.rows[0];
  if (!firstRow || firstRow.cells.length === 0) return;
  const lefts = Array.from(firstRow.cells).map((cell) => cell.offsetLeft);
  lefts.push(table.offsetLeft + table.offsetWidth);
  const widths = lefts
    .slice(1)
    .map((left, index) => left - lefts[index])
    .filter((width) => width > 0);
  if (widths.length !== firstRow.cells.length) return; // 列边界异常时不出副本
  if (!sameWidths(headColumnWidths.value, widths)) headColumnWidths.value = widths;
  headCloneWidth.value = table.offsetWidth;
}

function measureTable() {
  const el = tableRef.value;
  if (!el || !el.isConnected) return;
  const height = el.offsetHeight;
  // 值未变直接跳过：限高下发后自身尺寸回触发 RO，去重后不形成循环
  if (tableHeight.value === height) return;
  tableHeight.value = height;
}

function scheduleMeasure() {
  if (measureRaf) cancelAnimationFrame(measureRaf);
  measureRaf = requestAnimationFrame(() => {
    measureRaf = 0;
    measureTable();
    measureHeaderClone();
  });
}

function observeTable() {
  const el = tableRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  if (tableRO && observedTableEl === el) return;
  if (!tableRO) tableRO = new ResizeObserver(scheduleMeasure);
  // 数据刷新会替换表格节点：断开旧观察、改挂新节点
  tableRO.disconnect();
  tableRO.observe(el);
  observedTableEl = el;
}

// 两个触发源缺一不可：
// 1) 行数变化 → 首/重渲染后补建 RO，DOM 更新完再量（flush: 'post'）；
// 2) 数据对象本身 → 同行数的纯文案变化表格尺寸可能不变（RO 不触发），仍需重量列宽
watch(
  () => [totalRows.value, balanceSheet.value, taxStats.value],
  () =>
    nextTick(() => {
      observeTable();
      scheduleMeasure();
    }),
  { flush: 'post' },
);

onMounted(() => {
  measureTable();
  observeTable();
});

onBeforeUnmount(() => {
  if (measureRaf) cancelAnimationFrame(measureRaf);
  measureRaf = 0;
  observedTableEl = null;
  tableRO?.disconnect();
  tableRO = null;
});

// ==================== 限高与副本的按需下发 ====================

/** 放得下：不限高自然铺开；放不下：限高到可视剩余高度（先扣横向滚动条占位） */
const scrollBoxStyle = computed(() => {
  if (!hasData.value || availableY.value == null) return undefined;
  const available = Math.floor(availableY.value) - HSCROLLBAR_HEIGHT;
  if (tableHeight.value <= 0 || tableHeight.value <= available) return undefined;
  return { height: `${available}px` };
});

/** 限高内滚才需要钉顶副本；三件套未量到时都不出（避免错位盖内容） */
const showHeadClone = computed(
  () =>
    scrollBoxStyle.value != null &&
    headColumnWidths.value.length > 0 &&
    headCloneWidth.value > 0 &&
    headCloneWrapWidth.value > 0,
);

/** 副本表：fixed 布局 + 逐列精确列宽（inline width 覆盖类里的 width: 100%） */
const headCloneTableStyle = computed(() =>
  headCloneWidth.value > 0
    ? { width: `${headCloneWidth.value}px`, tableLayout: 'fixed' as const }
    : undefined,
);

/**
 * 副本包裹层显式宽 = 真实滚动盒 offsetWidth + overflow: hidden：
 * 表格 width: 100% 不含自身左 border，offsetWidth 恒比盒大 1~2px；真实表被
 * 盒子 hidden 裁掉、不进 hscroll 可滚动溢出；副本是 hscroll 的绝对后代，
 * 不裁剪会把这部分算进溢出，造成"内容放得下也常驻横向滚动条"的幻影
 * （无头 Chrome 实测：修前 scrollWidth 1834 / client 1832，修后 1832 / 1832）
 */
const headCloneWrapStyle = computed(() =>
  headCloneWrapWidth.value > 0
    ? { width: `${headCloneWrapWidth.value}px`, overflow: 'hidden' as const }
    : undefined,
);
```

#### 8.4.3 CSS（三层的滚动条控制 + 副本钉顶）

```scss
// ① 横向滚动层：6px 细条 + 透明轨道 + #cedff0 轨坑；position: relative
// 是副本的定位参照（绝对后代随本层横向滚动、不随内层纵向滚动）
.finance-table-hscroll {
  position: relative;
  overflow: auto hidden;
  scrollbar-width: thin;
  scrollbar-color: #cedff0 transparent;

  &::-webkit-scrollbar { width: 6px; height: 6px; }
  &::-webkit-scrollbar-thumb { border-radius: 3px; background: #cedff0; }
  &::-webkit-scrollbar-track { background: transparent; }
}

// ② 纵向滚动层：滚动条彻底隐藏（不占布局）；width: max-content 让表格
// 横向溢出由自身盒子暴露给外层 ①；min-width: 100% 保证内容窄时占满可视宽
.finance-table-box {
  width: max-content;
  min-width: 100%;
  overflow: hidden auto;   // x 方向 hidden：真实表的 1~2px 外溢在此被裁
  scrollbar-width: none;

  &::-webkit-scrollbar { display: none; }
}

// 真实表（副本表加同一个 class）：行高/字号/边框/底色统一在此钉死——
// hook 的行高换算、副本对齐、视觉一致都依赖这份口径
// 注意不要给 min-width 下限（ §8.7 第 4 条：数据放得下也会被撑出滚动条）
.finance-table {
  width: 100%;
  table-layout: auto;
  border-spacing: 0;
  border-top: 1px solid var(--cockpit-color-table-border, #cedff0);
  border-left: 1px solid var(--cockpit-color-table-border, #cedff0);
  color: var(--cockpit-color-brand-primary, #004567);
  text-align: center;

  th, td {
    padding: 0 10px;
    border-right: 1px solid var(--cockpit-color-table-border, #cedff0);
    border-bottom: 1px solid var(--cockpit-color-table-border, #cedff0);
    white-space: nowrap;               // 列宽不被内容折行打散，行总高可换算
  }

  th {
    height: var(--cockpit-table-header-height, 40px);   // 表头行高钉死
    background: var(--cockpit-color-table-header-bg, #e4eefa);  // 不透明，副本盖底
    font-size: 18px;
    font-weight: 330;
  }

  td {
    height: var(--cockpit-table-row-height, 44px);      // 表体行高钉死（rowHeight=44 的依据）
    background: var(--cockpit-color-surface-base, #fff);
    font-size: 16px;
  }
}

// ③ 表头副本：钉顶 + 裁宽；z-index 要盖住表格正文；
// pointer-events: none 让滚轮手势穿透到下方内容继续纵向内滚
.finance-table-head-clone {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  overflow: hidden;        // §8.7 第 6 条：裁掉比盒子宽出的 1~2px（inline 有 width 控制）
  pointer-events: none;
}
```

**运行节奏（一屏内展示的完整闭环）**：

```
数据到达 ──watch(flush:'post')──DOM 更新完成──nextTick──┐
窗口/缩放/容器变化 ──hook 内 RO（.smart-box-container 及其子块）──>  availableY 重算
                                                        │
表格自身尺寸变化 ──本地 RO（tableRef）──rAF──> measureTable（限高判定输入）
                                            └> measureHeaderClone（副本对齐输入）
                                                        │
scrollBoxStyle: availableY 存在且 tableHeight > availableY−8  → 限高
showHeadClone: 限高生效 且 三项测量就绪                          → 副本出现
```


### 8.5 副本列对齐（本方案的关键）

副本不是 `cloneNode` 整表克隆，而是「模板复刻的表头 + colgroup」的独立表（`table-layout: fixed`），逐列宽度从真实表量取：

```ts
// 取第一个有数据行的表体行：其单元格数恰与总列数一致（含 rowspan 单元格），
// 单元格左边界即各列起点，末列右边界用表格盒右边界补足
const lefts = Array.from(firstRow.cells).map((cell) => cell.offsetLeft); // 布局像素，不受 scale 影响
lefts.push(table.offsetLeft + table.offsetWidth);
// 相邻边界差 = 列宽；副本表 width 直接取真实表 offsetWidth
```

要点：

- **为什么不从表头量宽**：表头是合并单元格（rowspan/colspan），单个真实列的边界在表头里切不出来；表体首行每个单元格恰好对应一列；
- **为什么必须 `table-layout: fixed` + colgroup**：auto 布局要吃到全部行列内容才能收敛出同样的列宽，副本表没有表体；fixed + 实测列宽才能逐列严格对齐。实测宽是该列在真实布局下的最终值（长文本列已被表体内容撑到位），表头文本不会溢出；
- **重测时机（两个来源缺一不可）**：`watch([行数, 两个表的数据对象], ..., { flush: 'post' })` → `nextTick` 量。数据刷新会**替换表格节点**（RO 要 disconnect 重新 observe 新节点）；同名次、同行数的纯文案变化（公司名等）表格尺寸可能完全不变、RO 不触发，必须由数据 watch 兜底重量列宽；
- **异常保护**：量出的列边界数与单元格数不符（布局异常）时不出副本，宁可无钉顶也不错位盖内容。

### 8.6 specialCar 的取舍（冻结列双表 → 单表）

`specialCarFinance` 曾用「冻结列双表」（左固定表 = 序号/类目/指标/合并报表列，右横向滚动表）规避列 sticky 穿透。本次统一回**单表 + 整表横向滚动**（与 FinanceIndex 同构）：本方案里横向同步已由 hscroll 层 + colgroup 副本解决，双表反而引入两个副本、双份列宽测量与左右行高对齐的成本；代价是横向滚动时序号/指标列会滚出视口——如需冻结列，可在同结构上扩展「双副本」（左表副本静止、右表副本监听 scrollLeft 做平移），不要回到 sticky。

### 8.7 复用核对清单

1. `options.rowHeight` 与原生 td 实际行高一致、"放得下"判断才准；本表是该滚动容器最后区块时 `bottomBuffer` 传小值（本例 80）；
2. 从 availableY 里先扣**横向滚动条**占位再限高（本例 8px），否则限高后底部一行被横向滚动条压住；
3. 副本表头与真实表头保持**同一份数据驱动的双份模板**（不要 cloneNode 后维护两份真值），绑定相同响应式数据，天然同步；
4. 真实 `.finance-table` **不要设 `min-width` 强制宽度**（作用于整表下限，数据本来放得下也会被撑出横向滚动条）：`width: 100%` + auto 布局下 nowrap 列宽由内容自然收敛，放得下占满容器、放不下自动溢出给外层 hscroll；副本 inline `width` 直接取实测 `offsetWidth`，会覆盖 `width: 100%` 类样式，无需其他对齐兜底；
5. 限高层的纵向滚动条务必隐藏（`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`），横向滚动条挂在外层 hscroll 底部、始终可见；
6. **副本包裹层必须显式宽 = 真实滚动盒 `offsetWidth` 并 `overflow: hidden`（1~2px 幻影横向滚动条）**：表格 `width: 100%` 不含自身左 border，`offsetWidth` 恒比所在滚动盒宽 1~2px；真实表被盒子 `overflow-x: hidden` 裁掉、不会进入 hscroll 的可滚动溢出，但副本是 hscroll 的**绝对后代**，不裁剪会把这点宽度计入溢出——表现为"内容放得下也常驻横向滚动条"。无头 Chrome 复现实测：修前 `scrollWidth 1834 / clientWidth 1832`，修后 `1832 / 1832`。

   举例说明（设计宽 1832px，表格 `border-left: 1px`）：

   ```
   ① 真实表（没事）：
      ② 盒子 [0 ─────── 1832]            offsetWidth = 1832
        └ 真实表 [0 ─────── 1833]         width:100%（内容盒=1832）+ 左 border 1 = border-box 1833
                                          多出的 1px 被 ② 的 overflow-x: hidden 裁掉
                                          → 不计入 hscroll 可滚动溢出 → 无滚动条 ✓

   ② 替身（出事前）：
      hscroll 可滚动溢出 = 所有后代右边缘最大值
      ├ ② 盒子 …… 右边缘 1832            （被自己 hidden 裁掉，不算溢出）
      └ 替身 …… 右边缘 1833 ★            （挂着 hscroll 下、无任何裁剪，直接计入）
      → scrollWidth 1833 > clientWidth 1832 → 滚动条出现，但用户并没有任何内容看不到 → 幻影 ✗

   ③ 修复（出事后）：
      └ wrapper [0 ─────── 1832] overflow:hidden   （width = ② 盒子的 offsetWidth）
          └ 替身 1833 → 出框的 1px 被裁 → 计入溢出的最右回到 1832
      → scrollWidth 1832 = clientWidth 1832 → 滚动条消失 ✓
      ```
      修复的裁剪基准（wrapper 宽）取**真实滚动盒的 offsetWidth**，与真表被裁掉的口径完全一致——因此替身右侧边框的表现与滚到顶部时的真表一模一样。

## 9. 2026-11-19 扩展：页面下方区块与恒内滚按需滚动条（专用车总览接入）

### 9.1 场景与背景问题

专用车营销·销售总览（`SpecialCarSellOverview`）的滚动容器 `.smart-box-container` 里纵向排 4 个锚点块（市场分析 / 销售团队签约 / 销售节点分布 / 项目表格区），**项目表格区（`ProjectTable` → 按业务类型切 `ProjectTableHw` 环卫运营 / `ProjectTableZb` 装备销售）是最后一个块**，且两表都是 **CockpitTable + Pagination 的分页小表（10 行/页）**。原样接入（与 §4 同款 3 行）后出现两类 bug：

| 现象 | 根因 | 修复 |
| --- | --- | --- |
| **内容较长而窗口不够时没有内部滚动，滚动条延伸到表头** | 分页小表常态「放得下」（10 行 × 40 = 400 ≤ 可用高度），`scroll.y` 不下发 → antd 不拆分表头、表体无内滚，外层滚动容器滚动时表头跟着内容一起被带走，页面滚动条管辖范围盖住表头区域 | `alwaysScroll: true`——有数据恒下发 `scroll.y`，表体恒限高内部滚动（滚动条只出现在表体一侧），见 §9.4 |
| **窗口缩小后表体变小是对的，恢复变大后滚动条不消失、表格区域不变大** | ① `topOffset` 的 `'auto'` 分支按顶边**设计坐标**判断——本表顶边设计坐标随窗口高度缩放跨过 `clientHeight` 边界时，在「真实偏移 / 0」两个分支间**跳变**，缩小与恢复落在不同分支、值不对称；② `scroll.y` 在「下发 / 收回」间翻转，叠加 RO 时序漏发后恢复方向停在小值态 | `topOffsetMode: 'zero'` + §2.2 触发兜底——可用高度随窗口高度单调变化，缩小/恢复天然对称，见 §9.4 |

中间尝试过「保持默认闸门 + 组件内单元级 sticky 表头」：表头能钉住，但"放得下"态仍是页面滚动管辖表格区域（滚动条延伸到表头），与期望的内部滚动不符，未采用；`alwaysScroll` 的滚动条常驻副作用用 §9.4 的 CSS 覆盖消除。

### 9.2 与 antd 场景（§4）接入方式的差异

| 差异点 | §4 页面级大表（提车/线索明细） | §9 专用车总览两表 |
| --- | --- | --- |
| 本表在滚动容器中的位置 | 首个 / 中间块（顶边≈0 或恒在首屏外） | **最后一个块**，上方还有多个大块，顶边设计坐标可能落在首屏内（部分可见） |
| 数据量 | 接口大表恒超一屏，`scroll.y` 恒有值 | **分页小表**（10 行/页），常态放得下 |
| `topOffsetMode` | 不传（`'auto'`） | **`'zero'`**：顶边偏移恒按 0 |
| `alwaysScroll` | 不传（放得下不下发，数据恒溢出故等效恒下发） | **`true`**：有数据恒下发（表体恒内滚、区域随窗口变化） |
| 滚动条 | 常驻（数据恒溢出，无观感差异） | **按需出现**：组件内 CSS 覆盖 `overflow-y: auto` + `scrollbar-gutter: stable` |
| 表内额外占高 | 无 | Zb 有**小计行**（`#summary` 渲染在表体滚动区内），须计入行总高 |
| 全屏 | 无 | Zb 有伪全屏（`Teleport` 到 body），退出后需 `remeasure` 补测 |

### 9.3 调用方式（两组件实际接入代码）

```ts
// ProjectTableHw.vue（环卫运营 · 风险与异常项目预警）
const { tableWrapRef, scrollY } = useTableScrollY(() => tableRows.value.length, {
  topOffsetMode: 'zero',   // 页面下方区块：顶边偏移恒按 0
  alwaysScroll: true,      // 表体恒内滚：表头恒吸顶、区域随窗口变化
});
```

```ts
// ProjectTableZb.vue（装备销售 · 重点项目TOP10）
// 小计行经 #summary 渲染在表体滚动区内（antd 固定表头时 Footer 跟在 bodyTable
// 之后同处内滚容器），占一行高度，须计入行总高；空数据时小计不渲染，计 0
const { tableWrapRef, scrollY, remeasure } = useTableScrollY(
  () => (tableRows.value.length > 0 ? tableRows.value.length + 1 : 0),
  { topOffsetMode: 'zero', alwaysScroll: true },
);

// 全屏退出后主动补测：Teleport 回归后占位容器按原位置高度撑住布局、
// 锚点盒子不变，RO 不触发，而页面内 scroll.y 可能已残旧（进入全屏前的值 /
// 全屏期间窗口变过尺寸）
watch(
  [fullscreen, () => tableRows.value.length],
  () => {
    if (fullscreen.value) {
      scheduleFullscreenMeasure();
    } else {
      fullscreenScrollY.value = undefined;
      nextTick(() => remeasure());
    }
  },
  { flush: 'post' },
);
```

模板侧与 §4 完全一致：`tableWrapRef` 绑在包住 `CockpitTable` 的容器上，`scrollY` 透传 `:scroll-y`（Zb 全屏期间切换为独立的 `fullscreenScrollY`，按全屏 flex 布局实测）。组件内另有一条滚动条按需出现的 CSS（见 §9.4）。

### 9.4 实现原理

**`topOffsetMode: 'zero'`——顶边偏移恒按 0（修"恢复不对称"）。** 原 `'auto'` 分支只为「滚动容器首个区块」设计（VehicleDetail 顶边≈0，真实偏移分支取到的就是≈0）；下方区块滚进视口时顶边≈容器顶、应占满整个可视高度（同 CodeDetail 的 0 分支效果），但顶边**设计坐标**落在首屏内（部分可见）时 `'auto'` 会取真实偏移压缩可用高度，且该坐标随窗口高度缩放在首屏边界两侧跳动。`'zero'` 下公式退化为：

```
可用高度 = 滚动容器 clientHeight − 表头高 − 留白
```

与顶边位置、滚动位置完全无关，**随窗口高度单调变化**——给定窗口尺寸，`scroll.y` 是确定值，缩小与恢复天然对称；配合 §2.2 的触发兜底（window resize + 子块重建重挂观察 + `remeasure`），恢复方向必然重算回正确值。

**`alwaysScroll: true`——有数据恒下发（修"没有内部滚动 / 表头被带走"）。** 触发闸门改为「有数据就下发」（空数据收回）：

```
scrollY = 行数 > 0 ? max(可用高度, minHeight) : undefined
```

表体恒限高 = 可用高度：内容较长而窗口不够时表体内部滚动（滚动条只出现在表体一侧、表头恒吸顶在表体上方），表底贴住可视区底；窗口变大/变小时表体区域跟随可用高度单调变化。死循环安全性：前提是测量基准（`.smart-box-container`）为页面流定高容器（`flex: 1 1 auto` + 上级链路全定高 + `overflow: hidden`），表格自身高度变化被容器 `overflow-y: auto` 内滚吸收、不回灌基准盒子（不动点成立，同 §2.2 的论证）。**未传 `alwaysScroll` 的旧调用方行为零变化**（默认走原闸门）。

**滚动条按需出现——组件内 CSS 覆盖（修"滚动条常驻"观感）。** `scroll.y` 恒下发后 antd 给表体写死 `overflow-y: scroll`（内容放得下也显示滚动条）。组件内覆盖：

```scss
:deep(.ant-table-body) {
  overflow-y: auto !important; // stylelint-disable-line declaration-no-important
  scrollbar-gutter: stable;
}
```

- `overflow-y: auto`：滚动条只在真溢出时出现——窗口变大后内容放得下，滚动条消失；
- `scrollbar-gutter: stable`：**恒保留滚动条槽位**，表体内容盒几何与常驻滚动条时完全一致——antd 固定表头模式下表头/表体共用同一套列宽（`bodyColGroup`），槽位恒定则滚动条出现/消失不引起表头/表体错位（antd 默认 `scroll` 正是靠"恒占槽位"保证对齐，`auto` 裸用会让槽位随溢出出现/消失、列宽跟着抖动）；
- 样式表 `!important` 覆盖 antd 的内联 `overflow-y: scroll` 是标准级联行为（作者样式表的 important 声明高于普通内联声明），配合 `scrollbar-gutter: stable` 把唯一的风险点（几何抖动）消除。

### 9.5 Zb 特有口径

- **小计行计数**：antd 固定表头（`scroll.y` 下发）时 `#summary` 的 Footer 渲染在 `.ant-table-body` 内、跟在 bodyTable 之后，占一行表体高度；不计入就漏算 40px——放得下判断失准、`scroll.y` 少 40px。行数 getter 按 `行数 + 1` 计入（空数据时小计随 `data.length` 不渲染，计 0）；
- **伪全屏**：全屏期间 `Teleport` 到 body，`closest` 找不到滚动容器时 `updateScrollY` 静默跳过（页面内 `scrollY` 冻结为进入前的值）；全屏表体高度由独立的 `fullscreenScrollY` 按 `wrap.clientHeight − 表头高` 实测；退出全屏后占位容器（`.project-table-holder`）按原位置高度撑住布局、锚点盒子不变、RO 不触发——必须 `nextTick` 后 `remeasure()` 补测，否则页面内表体停在旧值。全屏面板自身 `overflow: hidden` 且无滚动，组件内的滚动条按需 CSS 同样作用于全屏表体。

### 9.6 复用核对清单

1. 本表是滚动容器**最后一个区块 / 页面下方区块**（上方还有多个大块）→ `topOffsetMode: 'zero'`；只有首个区块才用默认 `'auto'`；
2. 分页小表常态「放得下」又要求表头恒吸顶、表体恒内滚 → `alwaysScroll: true`，并确认测量基准是页面流定高容器（auto 容器会回灌死循环，见 §7）；同时按 §9.4 加滚动条按需出现的 CSS 覆盖，否则滚动条常驻；
3. 表体滚动区内有额外固定行（小计 / 合计）→ 行数 getter 计入，行高与 `rowHeight` 口径一致；
4. 组件有 `Teleport`（全屏 / 弹层）往返 → 回归后调 `remeasure()` 补测；
5. 「恒下发 + 滚动条按需」之外更保守的备选：保持默认闸门，接受"放得下时表头随页面滚动被带走"（即 §4 大表在数据偶发放得下时的固有表现）；
6. `EqSalesRightPanel` 等纯榜单卡片（无 antd 表格、定高布局）不适用本 hook——它没有 `.ant-table-body` 与 `scroll.y`，症状与本 hook 无关，勿误接入。

## 10. 经验小结

- wujie（iframe 沙箱）子应用里不要信任 `window.innerHeight` / window resize：隐藏 iframe 视口为 0 且 resize 不在事件白名单，视口信息一律改为最近内部滚动容器的布局测量；
- `transform: scale` 缩放容器内，`getBoundingClientRect()` 是视觉像素、布局值是设计像素，混算必错；rect 参与测量时用"视觉宽 / 布局宽"的已应用缩放比换算，任何时刻自洽；
- antd 表格 `scroll.y` 有"滚动条常驻"副作用：`alwaysScroll` 恒下发配合组件内 `overflow-y: auto` + `scrollbar-gutter: stable` 覆盖（§9.4）即可既恒内滚又让滚动条按需出现；单纯覆盖 `overflow-y` 而不加 `scrollbar-gutter` 会因槽位随溢出出现/消失引起表头/表体列宽抖动；
- **测量基准必须是不动点**：量「祖先盒子高度」来推「自己高度」，祖先高度又由自己内容撑开时，测一次变一次、必然漂移甚至死循环（§7 的行高增大/收缩两个坑同根因）；要么确认基准盒子定高（页面级：`.smart-box-container`；卡片级：flex 定高的自身包裹层），要么把公式换成以自身为变量也稳定的不动点形式；
- **下发的布局值全部整数化**：均分行高这类"除不尽"的值直接下发非整数像素，会被不同机器的 DPR / 浏览器缩放按物理像素取整，每行累积的零点几像素足以把 auto 容器逐轮回灌撑大（表现为"只有部分电脑滚动区域总高度一直增加"）；`Math.floor` + 余数归最后一行是通用解法；
- **回声护栏是自适应布局的最终防线**：只要"输入不变（行数 / 表头没变）而基准（容器/包裹层）却变大"，就应当冻结基准而不是重派——auto 容器会被自身写入逐帧计入回声，数学上的不动点在真实浏览器（DPR、缩放、subpixel 取整差）里未必严格成立，护栏保证最坏情况是"少充满几个像素"而不是无限爬升；
- 表组级 `position: sticky`（thead/整行吸顶、列冻结）在 Chromium 系存在内容绘制穿透（滚动正文从吸顶元素里透出来），吸顶/冻结一律改用「绝对定位副本」实现——副本的 containing block 放在**只单轴滚动**的外层上（横滚层），即可既不随内滚移动、又随外轴滚动同步（§8）；
- **量测公式里凡有"位置相关"的分支项，先确认调用方的布局位置**：`topOffset` 的真实偏移分支只对首个区块成立，下方区块的顶边设计坐标会随窗口缩放跨过首屏边界、在两个分支间跳变，表现为"缩小对、恢复不对称"（§9.1）——与位置无关的量测（`topOffsetMode: 'zero'`）才随窗口单调、天然对称；
- **"放得下不下发"是让滚动条按需出现的优化，不是行为目标**：分页小表常态放得下，表头会随页面滚动被带走、表体区域也不跟随窗口变化——`alwaysScroll` 恒下发 + 滚动条按需覆盖（§9.4）才是"表头恒吸顶、区域随窗口变化、滚动条只在真溢出时出现"的完整解，前提是基准盒子定高（auto 容器会回灌死循环，见 §7）；
- `transform: scale` 与"内部滚动容器 + 定高"是这套 hook 成立的两个隐含前提，换布局体系时先用 §7.4 的结论核对适用边界，再决定直接接入还是参照本地测算。
