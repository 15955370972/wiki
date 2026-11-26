# useAnchorPopover 悬浮框锚点定位 hook 使用文档

> Hook 路径：`apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/utils/useAnchorPopover.ts`
> 参考用例：
> 1. `apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/prodIndex/MonthDialog.vue`（安全绿十字弹框，事故日期悬浮详情卡 `lcvProd/DayDetail.vue`，滚动容器为弹框 body）
> 2. `apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/lcvProd/SchedulingAndRisk.vue`（页面内卡片，无滚动容器，悬浮详情卡 `lcvProd/RiskDetail.vue`，垂直方向以屏幕视口为界）
> 姊妹 hook：`useViewportPopover`（Teleport 到 body + `fixed` 定位，见《悬浮框视口内定位hook使用文档》）

## 一、简介

`useAnchorPopover` 用于**弹框/容器内部绝对定位**的悬浮框定位计算：悬浮框不 Teleport 到 body，而是作为定位容器（`position: relative`）的子元素绝对定位。解决四类问题：

1. **被弹框边缘裁切**：悬浮框默认出现在锚点下方，下方空间不足时自动翻转到锚点上方（可附加额外上偏移），上下都放不下时 clamp 到滚动容器可视区内，保证任何位置都完整显示；
2. **水平溢出容器**：悬浮框水平居中于锚点，超出容器宽度时 clamp 到容器内；
3. **箭头指向锚点**：悬浮框被水平 clamp 后，箭头（小三角）水平位置跟随锚点中心偏移，始终指向锚点；
4. **外层 transform 缩放**：全部使用 `offsetLeft/offsetTop/scrollTop/clientHeight` 等**布局像素**计算，与 `getBoundingClientRect`（视觉像素，受缩放影响）无关，无需换算 scale。

定位规则：

- **水平**：`x = 锚点中心 - 悬浮框宽 / 2`，clamp 到 `[0, 容器宽 - 悬浮框宽]`；
- **垂直**：默认 `y = 锚点下边缘 + gap`；实测高度后若 `y + 悬浮框高 > 可视区下边缘`，翻转为 `y = 锚点上边缘 - gap - 悬浮框高 - flipExtra`（需仍不小于可视区上边缘），否则 clamp 到可视区；
- **箭头**：`--arrow-left = 锚点中心 - x`，clamp 到 `[arrowInset, 宽 - arrowInset]`；翻转时箭头换到悬浮框底部朝下。

---

## 二、API

```ts
export function useAnchorPopover(options: {
  width: number;
  gap?: number;
  flipExtra?: number;
  arrowInset?: number;
  scrollContainerSelector?: string;
}): {
  containerRef: Ref<HTMLElement | null>;              // 定位父容器（需 position: relative）
  popoverRef: Ref<HTMLElement | { $el?: HTMLElement } | null>; // 悬浮框元素/组件 ref
  visible: Ref<boolean>;                               // 是否展示中
  placement: Ref<'bottom' | 'top'>;                    // 悬浮框在锚点下方/上方
  position: { x: number; y: number; arrowLeft: number }; // reactive 坐标（布局像素）
  popoverStyle: ComputedRef<Record<string, string>>;   // left/top/--arrow-left，直接绑 :style
  show: (anchorEl: HTMLElement) => void;               // 鼠标进入锚点时调用
  hide: () => void;                                    // 鼠标离开锚点时调用
};
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `options.width` | `number`（必填） | 悬浮框宽度（px），用于水平居中与 clamp。 |
| `options.gap` | `number`（默认 `6`） | 悬浮框与锚点元素的垂直间距（px）。 |
| `options.flipExtra` | `number`（默认 `0`） | 翻转到锚点上方时，额外向上偏移的距离（px）。 |
| `options.arrowInset` | `number`（默认 `16`） | 箭头中心距悬浮框左右边缘的最小距离（px），防止箭头越过圆角。 |
| `options.scrollContainerSelector` | `string`（默认 `'.cockpit-dialog__body'`） | 滚动容器选择器：垂直翻转/clamp 相对其可视区计算，且其滚动时自动隐藏悬浮框。**找不到时以屏幕视口为界**（见实现原理 4）。 |
| `containerRef` | `Ref` | 定位父容器模板 ref，**必须 `position: relative`**，悬浮框绝对定位在其中。 |
| `popoverRef` | `Ref` | 悬浮框元素/组件的模板 ref（组件自动取 `$el`），用于渲染后实测高度。 |
| `visible` | `Ref<boolean>` | `show`/`hide` 维护的展示态，可用于 `v-if` 或内部守卫。 |
| `placement` | `Ref<'bottom' \| 'top'>` | 垂直方向：`bottom` 悬浮框在锚点下方、箭头朝上；`top` 在锚点上方、箭头朝下。透传给悬浮框组件切换箭头样式。 |
| `popoverStyle` | `ComputedRef` | 含 `left`、`top`、`--arrow-left` 的样式对象，直接绑定 `:style`。 |
| `show(anchorEl)` | `(HTMLElement) => void` | 鼠标进入锚点元素时调用，`anchorEl` 取 `event.currentTarget`。 |
| `hide()` | `() => void` | 鼠标离开锚点元素（或滚动容器滚动）时调用。 |

---

## 三、调用示例

以下示例来自 `MonthDialog.vue`：鼠标经过事故日期格时，在日期格正下方展示悬浮详情卡 `DayDetail.vue`，空间不足时翻转到上方。

### 1. 组件模板

```vue
<template>
  <!-- 定位容器：必须 position: relative -->
  <div ref="greenCrossRef" class="green-cross">
    <span
      v-for="day in days"
      :key="day.date"
      class="day-cell"
      @mouseenter="handleDayEnter(day, $event)"
      @mouseleave="handleDayLeave"
    >
      {{ day.text }}
    </span>

    <DayDetail
      v-if="hoverDetail"
      ref="popoverRef"
      :detail="hoverDetail"
      :placement="hoverPlacement"
      class="green-cross__popover"
      :style="popoverStyle"
    />
  </div>
</template>
```

### 2. 脚本

```ts
import { useAnchorPopover } from '@/views/kongguJww/commercialVehicle/components/utils/useAnchorPopover';

const {
  containerRef: greenCrossRef,
  popoverRef,
  placement: hoverPlacement,
  popoverStyle,
  show: showPopover,
  hide: hidePopover,
} = useAnchorPopover({ width: 304, gap: 6, flipExtra: 20 });

function handleDayEnter(day: DayItem, event: MouseEvent) {
  if (day.status !== 'accident') return;
  hoverKey.value = day.date; // 先置位 v-if 条件，让悬浮框开始渲染
  showPopover(event.currentTarget as HTMLElement);
}

function handleDayLeave() {
  hoverKey.value = null;
  hidePopover();
}
```

### 3. 悬浮框组件配合（DayDetail.vue）

```vue
<div class="day-detail" :class="{ 'day-detail--top': placement === 'top' }">
  <span class="day-detail__arrow"></span>
  ...
</div>
```

```scss
.day-detail__arrow {
  position: absolute;
  top: -4px;                        // 朝上：探出悬浮框顶边
  left: var(--arrow-left, 50%);     // 水平位置由 hook 写入的 CSS 变量控制
  width: 8px;
  height: 8px;
  margin-left: -4px;
  transform: rotate(45deg);
  border-radius: 2px 0 0;
  background: #fbfcfd;
}

// 翻转到锚点上方时，箭头换到底部朝下
.day-detail--top .day-detail__arrow {
  top: auto;
  bottom: -4px;
  border-radius: 0 0 2px;
}
```

### 3. 无滚动容器场景（页面内卡片）

以下示例来自 `SchedulingAndRisk.vue`：页面内卡片无 `.cockpit-dialog__body` 滚动容器，垂直方向自动以屏幕视口为界；定位容器取包裹日期网格的 `position: relative` 包装层。

```vue
<template>
  <CardComp title="本月排班与物料风险">
    <div ref="containerRef" class="sr-grid-wrap">
      <div class="sr-grid">
        <div
          v-for="(cell, index) in dayCells"
          :key="index"
          class="sr-cell"
          @mouseenter="handleCellEnter(cell, $event)"
          @mouseleave="handleCellLeave"
        >
          {{ cell.day }}
        </div>
      </div>

      <RiskDetail
        v-if="hoverDetail"
        ref="popoverRef"
        :detail="hoverDetail"
        :placement="placement"
        class="sr-popover"
        :style="popoverStyle"
      />
    </div>
  </CardComp>
</template>

<script setup lang="ts">
  // 悬浮框宽 270px；无滚动容器 → 垂直以屏幕视口为界翻转/clamp
  const { containerRef, popoverRef, placement, popoverStyle, show, hide } = useAnchorPopover({
    width: 270,
  });

  function handleCellEnter(cell: DayCell, event: MouseEvent) {
    if (!cell.current) return;
    hoverDay.value = cell.day;
    show(event.currentTarget as HTMLElement);
  }

  function handleCellLeave() {
    hoverDay.value = null;
    hide();
  }
</script>

<style scoped lang="scss">
  .sr-grid-wrap {
    position: relative; // 定位容器
  }

  .sr-popover {
    position: absolute; // 不再 Teleport 到 body + fixed，避免 scale 换算
    z-index: 10;
    pointer-events: none;
  }
</style>
```

---

## 四、关键 CSS 配置

| 选择器 | 属性 | 作用 | 缺失后果 |
| --- | --- | --- | --- |
| 定位容器 | `position: relative` | 作为悬浮框绝对定位的坐标系原点 | 悬浮框相对更外层祖先定位，坐标全部错位 |
| 悬浮框 | `position: absolute` | 坐标即容器内布局像素，与 hook 计算一一对应 | 参与文档流，挤压布局 |
| 悬浮框 | `z-index: 10` | 浮在容器内其他内容之上 | 被同级内容盖住 |
| 悬浮框 | `pointer-events: none` | 鼠标事件穿透悬浮框 | 悬浮框盖住其他锚点时拦截 mouseenter，悬浮切换失效 |

> 注：不要在悬浮框上再叠加 `transform: translate(...)` 微调位置；坐标与箭头位置已由 hook 通过 `left/top/--arrow-left` 全量计算。

---

## 五、实现原理

### 1. 为什么用布局像素而非 `getBoundingClientRect`

页面/弹框内容常处于 `transform: scale(...)` 的缩放容器中（如 `CockpitDialog` 按 `--cockpit-dialog-scale` 缩放）。`getBoundingClientRect()` 返回**视觉像素**（已乘 scale），而 `offsetLeft/offsetTop/offsetWidth/offsetHeight/scrollTop/clientHeight` 返回**布局像素**（未乘 scale）。悬浮框绝对定位在缩放子树内部，其 `left/top` 也是布局像素，因此全程使用布局像素计算天然自洽，无需获取或换算 scale。

### 2. 坐标系统一

- 锚点元素（日期格）的 `offsetParent` 为定位容器（容器 `position: relative`，中间祖先均无定位），故 `anchorEl.offsetLeft/offsetTop` 即容器内坐标，直接用于水平定位与箭头计算；
- 垂直方向需与滚动容器的 `scrollTop/clientHeight` 同坐标系：用 `container.offsetTop - scrollContainer.offsetTop` 把容器顶边换算进滚动内容坐标系（两者共享同一 `offsetParent`，差值即布局距离），再加 `anchorEl.offsetTop` 得到锚点上/下边缘 `anchorEdge.top/bottom`。

### 3. 水平定位与箭头跟随

1. `center = anchorEl.offsetLeft + anchorEl.offsetWidth / 2`（锚点中心）；
2. `x = clamp(center - width / 2, 0, container.clientWidth - width)`：居中优先，靠边时收进容器；
3. `arrowLeft = clamp(center - x, arrowInset, width - arrowInset)`：悬浮框被 clamp 平移后，箭头仍对准锚点中心；`arrowInset` 防止箭头越过悬浮框圆角。

### 4. 垂直定位：先下、再翻、后 clamp

1. **先下**：`show` 时同步写入初始值 `y = anchorEdge.bottom + gap`、`placement = 'bottom'`，悬浮框立即在锚点下方渲染（避免空帧）；
2. **实测**：`await nextTick()` 后取 `popoverRef` 元素的 `offsetHeight`（高度由内容撑开，无法预知）；
3. **确定可视区**：
   - 找到滚动容器（`scrollContainerSelector`，默认 `.cockpit-dialog__body`）：`viewTop = scrollTop`、`viewBottom = scrollTop + clientHeight`；
   - **找不到滚动容器**（如页面内卡片）：以**屏幕视口**为界。容器可能处于 `transform: scale(...)` 缩放子树中，用容器自身推导 scale（`scale = getBoundingClientRect().width / offsetWidth`，视觉宽与布局宽之比），再把视口上下边界换算到容器布局坐标系：`viewTop = -rect.top / scale`、`viewBottom = (innerHeight - rect.top) / scale`；
4. **再翻**：若 `y + 高 > viewBottom`，尝试上方：`aboveY = anchorEdge.top - gap - 高 - flipExtra`；满足 `aboveY >= viewTop` 时采用并置 `placement = 'top'`（箭头朝下）；
5. **后 clamp**：上方也放不下（悬浮框高于可视区等极端情况）时 `y = clamp(viewBottom - 高, viewTop, viewBottom)`，贴可视区展示兜底。

### 5. 滚动自动隐藏

`show` 时对滚动容器监听 `scroll` → 触发 `hide`（同时移除监听）。滚动后可视区与锚点相对关系变化，继续展示会停留在过期位置被裁切，故直接收起，由下次 mouseenter 重新定位。

### 6. 调用时序

```
mouseenter → 置位 v-if 条件 → show(anchorEl)
           → 同步：水平 clamp + 箭头 + 初始下方 y + visible = true + 监听 scroll
           → nextTick：实测高度 → 保持下方 / 翻转上方 / clamp 兜底 → 写回 y 与 placement
mouseleave → hide()：移除 scroll 监听 + visible = false
```

---

## 六、注意事项

- `show` 必须在**置位 `v-if` 条件之后**调用（先让悬浮框开始渲染），否则 `nextTick` 后测量不到元素，垂直方向保持初始下方位置；
- 定位容器必须 `position: relative`，且锚点元素与容器之间**不能有其他定位祖先**，否则 `offsetParent` 改变、`offsetLeft/offsetTop` 不再相对容器；
- 垂直翻转/clamp 依赖 `container.offsetTop - scrollContainer.offsetTop` 的差值，要求二者共享同一 `offsetParent`（常规 DOM 下成立）；
- 滚动容器默认按 `.cockpit-dialog__body`（`CockpitDialog` 传 `height` 时的滚动 body）查找，非弹框场景通过 `scrollContainerSelector` 配置；找不到时垂直方向以屏幕视口为界做翻转/clamp（页面内卡片场景），且不做滚动自动隐藏；
- 悬浮框高度超过滚动容器可视区时，翻转条件不满足，退化为 clamp 贴边展示，内容自身需支持滚动。
