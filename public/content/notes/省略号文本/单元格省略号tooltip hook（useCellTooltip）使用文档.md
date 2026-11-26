# 单元格省略号 tooltip hook（useCellTooltip）使用文档

日期：2026-11-12
涉及文件：

- hook 实现：`apps/smart-technology/src/views/kongguJww/smartTechnology/components/utils/useCellTooltip.ts`
- 逻辑来源（抽离前）：`smartTechnology/components/clueMatrixAnalysis/TreeTable.vue` 的单元格 tooltip（`isCellOverflow` / `handleCellEnter` / `handleCellLeave` / scale 坐标换算）
- 配套渲染（省略号单元格）：`smartTechnology/components/cardAndChartComponents/CockpitTable.vue` 的列配置 `ellipsis: true`
- 接入示例：`smartTechnology/components/specialCarSell/sellOverview/ProjectTableHw.vue`、`ProjectTableZb.vue`

## 1. 这是什么

给表格/列表单元格提供「**内容单行展示、超出省略号、悬浮才弹 tooltip**」能力的公共 hook。之前该逻辑内联在 TreeTable.vue 里（逐格 `@mouseenter` / `@mouseleave` 绑定 + 组件内私有 tooltip），其他表格（如 CockpitTable）用不了。本次抽成公共 hook，配合 CockpitTable 新增的 `ellipsis` 列配置，调用方 **2 行模板 + 1 行脚本** 接入。

## 2. 原理

### 2.1 溢出检测：等字体克隆探针（为什么不用 scrollWidth > clientWidth）

`scrollWidth` / `clientWidth` 都被浏览器**四舍五入取整**：当文本溢出不足 1px 时（实测溢出仅 0.08~0.24px），两者取整后相等，误判为「未溢出」——但浏览器只要内容比盒子宽哪怕 0.01px 就会渲染省略号，100% 显示缩放下该误差尤其常见。

方案：把一个**等字体、不换行、不裁剪**的克隆探针（`<span>`）插入到**同一个单元格**内（同一 scale 坐标系），用 `getBoundingClientRect` 量它和单元格盒子的「带小数」宽度。两者被同一 scale 缩放，可直接相减比较；`> 0` 即溢出，留极小阈值 0.05 仅用于过滤测量噪声。

### 2.2 触发：外层容器事件委托（为什么不用逐格绑定）

- **mouseover 委托**：只在表格外层包裹层绑一个 `mouseover`，`event.target.closest(cellSelector)` 命中单元格才处理——鼠标在格内移动时反复命中的是同一个格子（结果幂等），移到另一格自动切换，无需逐格绑 `mouseenter`，动态行数/换页也不用重新绑定；
- **mouseleave 整体收起**：鼠标离开包裹层（去分页器、去标题区）时整体收起 tooltip；
- mouseover 命中的是格子之间的 padding / 间隙（closest 未命中）时也收起，避免残留上一个格子的提示。

### 2.3 定位：position: fixed + scale 容器本地坐标换算

页面运行在 `WidthScaleContainer`（`transform: scale` 等比缩放）之下，`position: fixed` 的包含块是带 transform 的祖先：

- 直接用 viewport 坐标定位会被再次缩放，弹层放大且错位；
- 正确做法是**本地坐标 = (viewport 坐标 − 缩放容器左上角 viewport 坐标) ÷ 已应用缩放比**；
- 已应用缩放比 = 缩放元素 `getBoundingClientRect().width / offsetWidth`（transform 不改布局值，任何时刻自洽），并优先读 `#smart-technology-entry` 的 computed transform matrix；
- tooltip 样式锚点为 `transform: translate(-50%, -100%)`（水平居中于单元格、整体贴单元格顶边上方，带下箭头）。

## 3. API

```ts
function useCellTooltip(options?: UseCellTooltipOptions): {
  tooltipVisible: Ref<boolean>;        // tooltip 是否可见（v-show）
  tooltipText: Ref<string>;            // tooltip 完整文本
  tooltipStyle: Ref<CSSProperties>;    // tooltip 定位样式（fixed + 本地坐标），直接 :style 绑定
  tooltipEvents: {                     // 事件集，v-on="tooltipEvents" 绑到包含单元格的外层容器
    mouseover: (e: MouseEvent) => void;
    mouseleave: () => void;
  };
}
```

| options | 类型 | 说明 |
| --- | --- | --- |
| `cellSelector` | `string` | 单元格选择器（mouseover 委托 closest 命中目标），默认 `'[data-cell-text]'` |
| `getCellText` | `(el) => string` | 取单元格完整文本，默认读 `data-cell-text` 属性，缺失回退 `textContent` |

卸载时 hook 内部自动收起 tooltip，调用方无感知。

## 4. 使用方式（配合 CockpitTable ellipsis 列）

```vue
<template>
  <!-- ① v-on 绑定事件委托 + v-show 渲染 tooltip -->
  <div ref="tableWrapRef" class="table-body" v-on="tooltipEvents">
    <CockpitTable :columns="tableColumns" :data="tableData" :scroll-y="scrollY" />
  </div>
  <div v-show="tooltipVisible" class="cell-tooltip" :style="tooltipStyle">{{ tooltipText }}</div>
</template>

<script setup lang="ts">
import { useCellTooltip } from '@/views/kongguJww/smartTechnology/components/utils/useCellTooltip';

// ② 一行调用（默认 cellSelector / getCellText 即适配 CockpitTable ellipsis 列）
const { tooltipVisible, tooltipText, tooltipStyle, tooltipEvents } = useCellTooltip();

// ③ 列配置加 ellipsis: true（内容单行省略，CockpitTable 负责 .cockpit-table__cell-ellipsis 渲染）
const tableColumns: CockpitTableColumn[] = [
  { key: 'projectName', label: '项目名称', ellipsis: true },
];
</script>
```

`.cell-tooltip` 样式（灰底白字 + 下箭头，与 TreeTable 的 `tree-table__custom-tooltip` 一致）目前随组件复制，两处样式相同：

```scss
.cell-tooltip {
  position: fixed;
  z-index: 99999;
  max-width: 240px;
  padding: 6px 8px;
  border-radius: 4px;
  background: #595959;
  color: #fff;
  font-size: 14px;
  line-height: 20px;
  word-break: break-all;
  pointer-events: none;   // 悬浮提示不挡鼠标，滚轮可继续滚表格
  user-select: none;

  &::after { /* 下箭头 */ }
}
```

## 5. 非 CockpitTable 场景（自定义单元格）

目标单元格只需满足两点：

1. 溢出时自身渲染省略号：`overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`；
2. 能被 `cellSelector` 命中，且能取到完整文本——默认选择器 `[data-cell-text]` 要求在元素上挂 `data-cell-text="完整文本"`（渲染省略号后 DOM 的 textContent 已被截断，必须用属性携带完整文本；通过 `options.getCellText` 可换成任意取值方式）。

## 6. 注意事项 / 约束

1. `v-on="tooltipEvents"` 必须绑在**包含单元格的容器**上（通常是表格包裹层），绑到更外层会把标题/筛选区的一次 mouseover 也卷进来（无害但多一次判定），绑到更内层则丢失委托收益；
2. tooltip 元素自身必须 `pointer-events: none`，否则鼠标移到 tooltip 上触发外层 mouseover → closest 未命中 → tooltip 闪烁；
3. 溢出检测假设单元格是「单行 nowrap」盒子：多行截断（line-clamp）场景垂直方向溢出不在本 hook 检测范围；
4. 坐标换算依赖 `#smart-technology-entry` 作为缩放容器锚点（与 TreeTable / GanttChart 同一约定），脱离该体系使用时需同步调整 `getCurrentScale` / `toScaledLocalPoint`；
5. 同一容器上重复 hover 同一单元格会重复测量（幂等、结果一致），如单元格内有大量动态内容可自行加缓存，无需改 hook。
