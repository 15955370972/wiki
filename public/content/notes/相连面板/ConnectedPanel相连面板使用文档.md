# ConnectedPanel 上下相连面板 使用文档

> 组件路径：
> - 原件：`apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/common/ConnectedPanel.vue`
> - 副本：`apps/smart-technology/src/views/kongguJww/smartTechnology/components/common/ConnectedPanel.vue`（逐行拷贝移植，两者保持同步）

## 一、组件简介

`ConnectedPanel` 是用于**下钻页面**的布局容器：上半部分是一排可点击的指标卡，下半部分是明细/趋势面板。它通过 SVG 描边把**当前选中的那张卡片**与**下方面板**连成一个闭合的整体外框——

- 选中卡片底部与面板顶部之间的边界被“打穿”，外框从选中卡片左上角绕行（沿卡片外圈）→ 下沿到面板 → 面板外圈 → 回到卡片，一整条闭合路径；
- 未选中卡片与面板之间的边界保持断开（卡片行 gap 处仍是独立卡片边框，由卡片自身样式绘制）；
- 整条路径带统一的投影（`drop-shadow`）与描边色。

一句话概括：**外框 + 投影由该组件统一绘制，卡片只需“报名”自己是选中项，无需各自维护高亮边框逻辑。**

### 为什么不直接用边框实现？

普通卡片的高亮边框可以给卡片加 `border` 完成，但“选中卡片与下方面板连通”意味着边框要在三者交界处精确断开/绕行，随着窗口缩放、卡片列数变化、面板高度变化都要保持精确。组件采用**绝对定位的全尺寸 SVG + 动态计算 `path`** 来绘制整条轮廓，天然支持任意布局变化。

---

## 二、Props

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `connected` | `boolean` | `true` | 是否允许卡片与面板连通。**加载中传 `false`**：只绘制明细面板自身的矩形框（卡片骨架屏期间不高亮连接）。 |
| `gap` | `number` | `16` | 卡片行与下方面板的间距（px）。与卡片行自身的 `gap: 16px` 视觉上保持一致即可，一般不用改。 |
| `borderColor` | `string` | `'#004567'` | 外框描边颜色。 |
| `background` | `string` | `'#fff'` | 外框整体填充色（含面板背景），即整条闭合路径内的底色。 |

---

## 三、插槽与高亮标记

### 插槽

| 插槽 | 说明 |
| --- | --- |
| `#cards` | 上半部分卡片行。一般放一个横向容器（`grid` 或 `flex`）承载指标卡。 |
| 默认插槽 | 下半部分明细面板（表格 / 图表卡等）。组件会自动给它加 `margin-top: var(--connect-gap)`。 |

### 高亮标记：`data-connected-active`

组件在**每帧更新时**用 `querySelector('[data-connected-active]')` 找卡片行里带该属性的 DOM 节点，作为“选中卡片”参与路径计算。因此选中逻辑只需要在卡片上绑定：

```vue
<IndicatorCard
  v-for="(item, index) in cardList"
  :key="item.metricType"
  :card-data="item"
  :data-connected-active="activeIndex === index ? '' : undefined"
  @click="handleCardClick(index)"
/>
```

要点：

1. 绑定 `data-connected-active` 时**必须用 `'' : undefined` 三元切换**，不要用布尔值的 `:data-connected-active="activeIndex === index"`（布尔会渲染成 `data-connected-active="true"` 字符串，所有卡片永远带该属性，组件会永远选中第一张）。
2. 最多只能有一张卡片带该属性，否则按 DOM 顺序取第一张。
3. 选中卡片自身不画边框：组件给 `[data-connected-active]` 设置了 `border: 1px solid transparent` + 上圆角 `4px 4px 0 0`，外框的描边效果由整条 SVG path 覆盖。

---

## 四、使用示例

### 示例 1：卡片 + 明细表（来自 commercial-vehicle `financeIndex/DownComp.vue`）

```vue
<template>
  <ConnectedPanel class="profit-drill" :connected="!cardsLoading">
    <template #cards>
      <div class="card-row">
        <IndicatorCard
          v-for="(item, index) in cardList"
          :key="item.metricName"
          :card-data="item"
          class="card-item"
          :data-connected-active="activeIndex === index ? '' : undefined"
          @click="handleCardClick(index)"
        />
      </div>
    </template>
    <div class="detail-panel">
      <CardComp :title="...">
        <CockpitTable :columns="visibleTableColumns" :data="tableData" />
      </CardComp>
    </div>
  </ConnectedPanel>
</template>

<script setup lang="ts">
  import ConnectedPanel from '../common/ConnectedPanel.vue';
</script>

<style scoped lang="scss">
  .card-row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 16px;
  }

  // 面板内的 CardComp 自带边框/圆角/阴影，统一去掉，由外框描边
  .detail-panel :deep(.card-comp) {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
</style>
```

### 示例 2：卡片 + 图表（来自 commercial-vehicle `overviewIndex/MetricDrillDown.vue`）

下半部分放 `KeyTrendCard` 时，同样要盖掉其根节点（即 `.card-comp`）的边框，由 ConnectedPanel 统一描边：

```scss
// KeyTrendCard 根节点即 .card-comp，提高优先级盖掉其自带边框/内边距
.drill-panel .month-trend-card {
  padding: 12px 16px;
  border: 0;
  border-radius: 0;
  background: #fff;
}
```

### 示例 3：mock 静态场景（来自 smart-technology `specialCarFinance/DrillDown.vue`）

无接口loading时 `connected` 保持默认 `true` 即可：

```vue
<ConnectedPanel class="rank-drill">
  <template #cards>
    <div class="card-row">
      <IndicatorCard ... />
    </div>
  </template>
  <div class="trend-panel">
    <KeyTrendCard :title="trendTitle" :series-config="trendSeriesConfig" ... />
  </div>
</ConnectedPanel>
```

---

## 五、内部实现原理（便于维护）

一句话概括：**“卡片 + 面板”的并集轮廓被算成一条闭合 SVG path，白底、投影、描边全部从这一条 path 派生，而卡片行 DOM 恰好夹在“填充层”和“描边层”之间形成三明治**。下面依次给出：场景示例、核心机制（一条 path 两层 SVG）、路径计算、重算时机、可复现最小示例。

### 1. 场景示例（后文全部对照这组数字）

设定：根元素宽 1000px；`#cards` 一排 5 张卡（每张约 187px、列间距 16px），卡高 190px；卡行与面板 `gap:16`；面板高 380px；当前选中**第 3 张**卡。

```
y=0     卡1      卡2    [卡3]   卡4     卡5          ← 卡行顶部 / 卡高 190
y=190   └──────┴───────────────────────────────────┘   ← 卡行底部；卡3 左右两侧是 16px 断开区
y=206   ──────────────────────────────────────────────   ← panelTop（面板顶部，含 0.5 半像素）
                      面板（高 380px）
y=586   ──────────────────────────────────────────────   ← bottom（根底部减 0.5）
x=0     x≈406(卡3左)         x≈593(卡3右)        x=1000(根右)
```

### 2. 核心机制：同一条闭合 path，两层 SVG

#### (1) path 的本质：一条有方向的折线

组件只用了 4 种 SVG 指令：`M x y`（移笔到起点）、`H x / V y`（水平/垂直画线）、`Z`（闭合拉回起点）。选中卡 3 时 `updateOutline` 拼出的 `d`：

```
M 406.5 190.5 H 593.5 V 206.5 H 999.5 V 585.5 H 0.5 V 206.5 H 406.5 Z
```

沿这条折线走一遍，得到的是一个 **T 形（“凸”）多边形**——面板大矩形 + 顶部凸出一个选中卡小矩形，两矩形在共边处融合：

```
              ┌──────┐          ← 卡片凸出部分
    ┌─────────┤      ├──────────┐
    │              面板           │
    └───────────────────────────┘
```

**“相连”在几何上就是“两个矩形共边融合”**：因为整条轮廓是一个多边形，多边形内部**不存在**“卡和面板的分界线”，填充和描边天然没有接缝——不需要任何“边界拼接代码”。

#### (2) 同一条 path 喂给两个 `<path>`，属性不同、效果不同

```html
<!-- 白底 + 投影层：fill 多边形区域 -->
<svg class="outline outline--background"><path :d="path" :fill="background" /></svg>
<!-- 描边层：同一条折线只画周界线 1px -->
<svg class="outline outline--border"><path :d="path" fill="none" :stroke="borderColor" stroke-width="1" stroke-linejoin="round" /></svg>
```

| | 第一个 path | 第二个 path |
| --- | --- | --- |
| 属性 | `fill="#fff"`（浏览器对闭合区域涂色，T 形也照涂） | `fill="none" stroke=…`（只画折线本身 1px） |
| 角色 | 卡+面板的白色“底板” | 描边线 |
| 生效的额外样式 | `filter: drop-shadow(...)`（CSS 滤镜，对整层形状出投影） | `stroke-linejoin: round`（避免 90° 折角处 `miter` 尖刺） |

必须 `Z` 闭合：fill 需要**闭合区域**才能判定“内/外”，不闭合 fill 结果不可靠。

#### (3) 为什么要拆成两个 SVG：卡片行夹在两层之间（三明治）

`z-index` 只能作用于**整个元素**，SVG 内部的两个 `<path>` 无法各自参与层叠。而视觉上必须做到“白底被卡片盖住、描边压在卡片上”（描边有一部分走的是选中卡外缘，要绘制在卡片边框之上），所以同一形状复制成两个 SVG：

```
.connected-panel（position: relative; isolation: isolate，形成独立层叠上下文）
├─ svg.outline--background  z-0  白底填充 + drop-shadow（垫底）
├─ .connected-detail        z-1  面板插槽容器（margin-top: var(--connect-gap)）
├─ .connected-cards         z-2  卡片行插槽容器（夹心层）
└─ svg.outline--border      z-3  描边（pointer-events: none，不拦截点击）
```

两个 SVG 都是 `position: absolute; inset: 0` 铺满根元素，画同一条 path。

#### (4) 实现细节逐项对应

- **`overflow: visible`**（两 SVG 共有）：stroke 在路径两侧各溢 0.5px、投影向外漫几像素，svg 默认会裁内容，放开才不被裁；
- **`pointer-events: none`**（描边层）：描边线压在选中卡外缘/圆角上，不放开会挡住卡片点击；
- **投影用 CSS `filter` 而非 SVG `<filter>` 元素**：整层渲染完形状再出阴影，随容器一起缩放，无 filter 元素可维护；
- **`isolation: isolate`**：根元素自成层叠上下文，外部容器的 z-index 干不到里面，内部 0/1/2/3 层级稳定；
- **±0.5px**：SVG stroke 以路径为中心线、宽 1px 时两侧各溢 0.5px。以根右边缘 x=1000 为例，直接 `H 1000` 线画在 999.5~1000.5（溢出 0.5px 可能被裁/出毛边）；`right = 1000 - 0.5` 后线画在 999~1000，完整压在边界内侧。组件对 `right`、`top+0.5`、`panelTop+0.5`、`bottom-0.5` 统一内切半像素，视觉上全部“线贴边走”；
- **选中卡不画自己的边框**：组件只给 `[data-connected-active]` 设 `border: 1px solid transparent`（占位但不显色、不改变盒模型），线完全交给 SVG path——卡自身边框与外框线永不打架。

### 3. 路径计算（`updateOutline`）

关键数据从 DOM 布局测量：

- `right`：根元素宽度 - 0.5；
- `bottom` / `panelTop`：`panelRef`（`.connected-detail`，返回 panel 本身）相对根元素的 `offsetTop + offsetHeight`；
- 选中卡片：`positionInRoot(card)` 沿 `offsetParent` 链（卡 → `.card-row` → `.connected-cards` → 根）累加 `offsetLeft/offsetTop`，得到卡片在根元素内的左上角坐标。

路径按“无选中 / 有选中”两种形态拼装，其中选中卡的**左右是否还有邻居**决定绕行段是否出现：

- **无选中卡片**（loading / `connected=false`）：只画面板矩形
  `M .5 panelTop H right V bottom H .5 Z`
- **有选中卡片**：整条 T 形闭合轮廓，从选中卡片顶部起点 → 水平到卡片右沿 → （卡片右侧还有邻居时）竖直向下到面板顶部再横到根右沿 → 面板右沿向下到底 → 底边横到左边缘 → 左边缘向上到面板顶部 → 水平回到卡片左沿 → `Z` 沿卡片左沿向上闭合。对比无选中 path 能看出：“相连”与“不相连”的差异只体现在这条**折线怎么绕**，代码层面没有第二种画法。

#### 坐标为何用 `offsetLeft/offsetTop` 累加而不是 `getBoundingClientRect`

驾驶舱全页有整体缩放（autofit.js / transform scale）场景：`getBoundingClientRect` 返回**缩放后的屏幕坐标**，而 SVG 元素自身也被一起缩放、其内部坐标仍是**本地（未缩放）CSS px**。例如布局中卡 3 的 x=406、页面 scale 0.5 时 `getBoundingClientRect().x` 只有约 203（还要叠加页面在视口里的初始平移），把屏幕坐标写进 `M 203 …` 后，轮廓相对根元素就水平偏移约 200px——整个外框飘走。累加 `offsetLeft/offsetTop` 得到的是**布局坐标**，与 SVG 用户坐标系自然同尺度，整条路径随容器一起正确缩放。

### 4. 重算触发时机（响应布局变化）

path 是**事后测量**的，不是维护中的状态，因此任何布局变化都能自我修复：

- `onMounted`：创建 `ResizeObserver` 观察**根元素、卡片行、面板**三个节点（窗口缩放、列宽变化、内容撑开都会触发），并监听 `window resize`；
- `onUpdated`：每次组件更新后重算——**切换选中卡**时，`data-connected-active` 从旧卡挪到新卡，DOM 变更触发 `onUpdated` → `querySelector` 找到新卡 → 新 path（不重算的话旧轮廓会停留在旧卡上）；
- `watch(connected, gap)`（`flush: 'post'`，DOM 已更新后执行）：`connected` 开关或 `gap` 变化时 `nextTick` 重算；
- **同值跳过**：`path.value = 新字符串`，若与旧串完全相同，Vue 响应式不 patch、DOM 不动，因此频繁重算无成本，也不需要防抖；
- `onBeforeUnmount`：统一 `observer.disconnect()` + 移除 `window` 监听，无内存泄漏。

### 5. 复现一个最小示例（自验证用）

把下面代码存成 html 打开，可见同一条 path 如何同时生成白底、投影、描边（示例里 panelTop=60、卡区凸起 100px 宽）：

```html
<div style="position:relative; width:600px; height:300px; isolation:isolate">
  <!-- 底层：白底 + 投影 -->
  <svg style="position:absolute; inset:0; width:100%; height:100%; z-index:0; filter:drop-shadow(0 4px 6px rgba(79,129,189,.3)); overflow:visible">
    <path d="M 200.5 8.5 H 300 V 60 H 599.5 V 299.5 H 0.5 V 60 H 200.5 Z" fill="#fff"/>
  </svg>
  <!-- 内容：卡片行（凸出区）与面板 -->
  <div style="position:relative; z-index:2; height:60px;">
    <div style="position:absolute; left:200px; top:8px; width:100px; height:53px; background:#fff">选中卡</div>
  </div>
  <div style="position:relative; z-index:1; background:#fff; height:240px">面板</div>
  <!-- 顶层：同一条 path 只描边 -->
  <svg style="position:absolute; inset:0; width:100%; height:100%; z-index:3; pointer-events:none; overflow:visible">
    <path d="M 200.5 8.5 H 300 V 60 H 599.5 V 299.5 H 0.5 V 60 H 200.5 Z" fill="none" stroke="#004567" stroke-width="1" stroke-linejoin="round"/>
  </svg>
</div>
```

改掉 `d` 中任一坐标，白底和描边会**同时**跟着变——这就是“同一条 path、两类属性”的直观效果；而若用两个独立 rect 分别画卡和面板，交界融合段（`V 60 → H 599.5 → … → V 60 → H 200.5` 的绕行段）就没人画了，16px gap 交界处会立刻露出“断带”，投影也会在交界处叠出深带。

---

## 六、使用注意事项

1. **卡片必须有 `min-width: 0`**：卡片行是 grid/flex 等分列，长数值卡片不加 `min-width: 0` 会把行撑爆，导致轮廓与卡片错位。
2. **面板内的卡片的自身边框要去掉**：`CardComp` / `KeyTrendCard` 的根节点是 `.card-comp`，若不去边框会出现“框中框”，记得参照示例 1/2 覆盖样式。
3. **loading 期间关闭连接**：若卡片行分“骨架屏 / 正常卡片”两个 `v-if`/`v-else` 分支，用 `:connected="!cardsLoading"` 切换，让 loading 期间只画面板矩形。
4. **选中卡内部样式按需覆盖**：选中高亮只解决外框连通；数值字号、卡片高度等仍需在使用处用 `:deep()` 按设计稿覆盖（参考 DownComp 的 `.card-item :deep(.value-display ...)` 缩字号写法）。
5. **`gap` 与卡片行间距保持一致**：默认 `gap: 16` 对应设计稿卡片间 16px 规范。如果卡片行改为其它间距/面板上下间距，务必同步调整该 prop。
6. **同值 path 不会重绘**：`onUpdated` 中先计算再按值赋给 `path`，值相同则 Vue 不会重新渲染，无需额外做防抖或比对。
7. **投影由外部 SVG 绘制**：面板的填充、描边、投影全部在根元素的两层 SVG 上，`.connected-detail` 内部不要再做 `overflow: hidden` 或叠加边框/阴影，避免与外框冲突形成“框中框”或裁剪异常。
8. **两份副本需同步**：commercial-vehicle 与 smart-technology 各持一份拷贝，修改交互/样式时记得同步另一份（目前两份代码一致）。
9. **组件无 emit / 无 expose**：所有状态都是内部消费，父组件只需要控制 props + 插槽内容。

---

## 七、与卡片组件的推荐搭配

| 场景 | 卡片区组件 | 面板区组件 |
| --- | --- | --- |
| 指标下钻（利润/排名类） | `IndicatorCard`（多卡，一排 grid） | `CardComp` + `CockpitTable` 明细表 |
| 月度趋势下钻 | `IndicatorCard`（多卡） | `CardComp` 或 `KeyTrendCard` 组合图 |
| 静态排名下钻（伪 mock） | `IndicatorCard`（多卡） | `KeyTrendCard` 双柱折线趋势图 |
