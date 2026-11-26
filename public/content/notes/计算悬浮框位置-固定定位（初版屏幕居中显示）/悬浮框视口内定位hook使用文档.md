# useViewportPopover 悬浮框视口内定位 hook 使用文档

> Hook 路径：`apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/utils/useViewportPopover.ts`
> 参考用例：`apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/lcvProd/SchedulingAndRisk.vue`（轻商生产-排班与风险卡片，悬浮详情卡 `RiskDetail.vue`）

## 一、简介

`useViewportPopover` 用于**悬浮框 / Tooltip 类浮层**的定位计算，解决两类常见问题：

1. **浮层超出屏幕可视区域**：按浮层实际尺寸与视口边界动态计算坐标，任何位置展示都不会超出视口（上下左右均留安全边距）。
2. **浮层参与 flex 布局导致页面元素被挤压**：浮层渲染后成为 flex 容器的新子元素，会命中 `:last-child` 等子元素选择器，造成卡片宽度重排（如 `OutputDelivery` 被压缩）。配合 `Teleport to="body"` 使用可彻底规避。

定位规则（当前默认策略）：

- **水平**：浮层整体放在**锚点元素左侧**（不遮挡锚点内容），左侧空间不足时 clamp 到视口安全边距；
- **垂直**：相对**屏幕居中**展示（天然在视口内），再做 clamp 兜底；
- **尺寸**：每次展示时实测浮层元素尺寸（浮层内容长度会影响高度），测量后再计算位置。

---

## 二、API

```ts
export function useViewportPopover(options?: { margin?: number; gap?: number }): {
  popoverRef: Ref<HTMLElement | { $el?: HTMLElement } | null>;
  popoverPos: { x: number; y: number };   // reactive，可直接绑定 :style
  showAt: (anchorRect: DOMRect) => Promise<void>;
}
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `options.margin` | `number`（默认 `8`） | 浮层距视口边缘的安全边距（px）。 |
| `options.gap` | `number`（默认 `8`） | 浮层与锚点元素之间的水平间距（px）。 |
| `popoverRef` | `Ref` | 浮层元素/组件的模板 ref。**可直接绑定在组件上**（内部自动取 `$el`），也可绑定原生元素。 |
| `popoverPos` | `reactive({ x, y })` | 计算出的浮层坐标（已取整），直接绑定 `left` / `top`。 |
| `showAt(anchorRect)` | `(DOMRect) => Promise<void>` | 展示浮层后调用：内部先 `await nextTick()` 等浮层渲染完成，再实测尺寸并按锚点矩形计算位置。 |

---

## 三、调用示例

以下示例来自 `SchedulingAndRisk.vue`：鼠标经过日历格时，在日期格左侧展示悬浮详情卡。

### 1. 组件模板

```vue
<template>
  <CardComp title="本月排班与物料风险" class="scheduling-risk">
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
  </CardComp>

  <!-- 必须 Teleport 到 body：避免浮层成为 flex 容器子元素影响布局 -->
  <Teleport to="body">
    <RiskDetail
      v-if="hoverDetail"
      ref="popoverRef"
      :detail="hoverDetail"
      class="sr-popover"
      :style="{ left: `${popoverPos.x}px`, top: `${popoverPos.y}px` }"
    />
  </Teleport>
</template>
```

### 2. 脚本

```ts
import { computed, ref } from 'vue';
import RiskDetail from './RiskDetail.vue';
import { useViewportPopover } from '@/views/kongguJww/commercialVehicle/components/utils/useViewportPopover';

const hoverDay = ref<number | null>(null);
const { popoverRef, popoverPos, showAt } = useViewportPopover();

const hoverDetail = computed(() => {
  if (hoverDay.value === null) return null;
  return { ...defaultDetail, dateLabel: `08/${hoverDay.value}` };
});

function handleCellEnter(cell: DayCell, event: MouseEvent) {
  if (!cell.current) return;
  // 先置 hover 态让浮层渲染（v-if），再等渲染完成测量尺寸并定位
  hoverDay.value = cell.day;
  // 锚点取触发元素（日期格）自身矩形，而不是鼠标坐标：
  // 悬浮期间鼠标在格内移动时位置保持稳定
  const cellRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  void showAt(cellRect);
}

function handleCellLeave() {
  hoverDay.value = null;
}
```

### 3. 自定义边距 / 间距

```ts
// 浮层距视口边缘 12px，与锚点元素间距 12px
const { popoverRef, popoverPos, showAt } = useViewportPopover({ margin: 12, gap: 12 });
```

---

## 四、关键 CSS 配置

浮层自身只需要三点：

```scss
.sr-popover {
  position: fixed;      // 1. 固定定位：坐标即视口坐标，hook 计算的 x/y 直接可用
  z-index: 10;          // 2. 保证浮在页面内容之上（Teleport 到 body 后页面 z-index 不受组件嵌套影响）
  pointer-events: none; // 3. 浮层不拦截鼠标事件：鼠标划过浮层不会误触发锚点的 mouseleave 抖动
}
```

| 属性 | 作用 | 缺失后果 |
| --- | --- | --- |
| `position: fixed` | 让 `left/top` 直接对应视口坐标，与 hook 计算结果一一对应 | 改为 `absolute` 时坐标相对最近定位祖先，会偏离视口计算 |
| `z-index` | Teleport 到 body 后与页面其余浮层（弹窗等）比层级 | 可能被后续弹窗/遮罩盖住 |
| `pointer-events: none` | 鼠标事件穿透浮层 | 鼠标移到浮层上会触发锚点 `mouseleave`，浮层闪隐 |

> 注：**不要**在浮层上再叠加 `transform: translate(...)` 做位置微调 —— 坐标已由 hook 全量计算，transform 会叠加偏移导致定位不准；同时也不要给浮层祖先加 `transform`（会使 `position: fixed` 相对祖先而非视口定位）。

---

## 五、实现逻辑说明

`showAt(anchorRect)` 的内部流程：

1. `await nextTick()`：等待 `v-if` 控制的浮层完成渲染，模板 `ref` 挂上；
2. 取浮层元素（组件则取 `$el`），实测 `offsetWidth` / `offsetHeight`（内容动态变化也准确）；
3. 计算坐标：
   - 水平：`x = anchorRect.left - 浮层宽 - gap`（浮层整体在锚点左侧）；`x < margin` 时收紧为 `margin`；
   - 垂直：`y = (视口高 - 浮层高) / 2`（屏幕居中）；再 clamp 到 `[margin, 视口高 - 浮层高 - margin]` 兜底；
4. 坐标取整后写入 `popoverPos`，通过响应式绑定驱动浮层移动。

### 注意事项

- `showAt` 必须在**置位 v-if 条件之后**调用（先让浮层开始渲染，hook 内部再等 `nextTick`），否则测量不到元素，位置保持上次值。
- 若浮层内容高度**极大概率超过视口高度**，居中策略退化为 clamp（顶/底对齐边距），内容自身需支持滚动。
- 锚点矩形建议取**触发元素**（`event.currentTarget`）而非鼠标坐标，悬浮期间浮层位置稳定不抖动。
