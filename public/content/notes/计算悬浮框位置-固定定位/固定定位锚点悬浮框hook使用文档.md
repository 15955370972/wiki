# useFixedAnchorPopover 固定定位锚点悬浮框 hook 使用文档

> Hook 路径：`apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/utils/useFixedAnchorPopover.ts`
> 参考用例：`apps/commercial-vehicle/src/views/kongguJww/commercialVehicle/components/lcvProd/SchedulingAndRisk.vue`（轻商生产-排班与风险卡片，悬浮详情卡 `lcvProd/RiskDetail.vue`）
> 姊妹 hook：
> - `useAnchorPopover`（容器内绝对定位，见《悬浮框锚点定位hook使用文档》）
> - `useViewportPopover`（fixed + 视口定位、锚点左侧展示，见《悬浮框视口内定位hook使用文档》）

## 一、简介

`useFixedAnchorPopover` 用于**页面级悬浮框 / Tooltip 类浮层**的定位计算：悬浮框 `Teleport` 到 body 后 `position: fixed` 展示，默认出现在**锚点元素正下方、水平居中**，带小三角指向锚点。解决四类问题：

1. **祖先 overflow 裁切**：悬浮框不在页面 DOM 子树内，任何卡片/滚动容器的 `overflow: hidden/auto` 都裁切不到它；
2. **页面内固定头部遮挡**：悬浮框层级高于页面内固定不滚动的头部（如 `.prod-header`），可覆盖其上；
3. **宿主顶部栏遮挡**：嵌入宿主时子应用处于宿主的层叠上下文内，body 级悬浮框**盖不住**宿主 fixed 顶部栏（如「经营驾驶舱」），重叠必被挡。hook 将可视区上边界收敛到顶部栏之下，悬浮框永不进入该区域，从根源避免遮挡；
4. **页面缩放失配**：页面被 `WidthScaleContainer(designWidth: 1920)` transform 缩放，body 级悬浮框不受缩放会偏大；hook 用 `useCockpitScale` 取 scale 后对悬浮框反向缩放，与页面视觉比例一致。

定位规则（与 `useAnchorPopover` 保持一致）：

- **水平**：居中于锚点，clamp 到可视区宽度内；箭头水平位置（`--arrow-left`）跟随锚点中心；
- **垂直**：默认锚点下方 `gap`；实测高度后超出可视下边界时翻转到锚点上方（`gap + flipExtra`），上下都放不下时 clamp 到可视区内；
- **可视区**：视口与 `.width-scale-container__screen` 矩形的交叠，上边界再避开探测到的 fixed/sticky 顶部障碍；
- **滚动**：页面任意滚动（含内部滚动容器）时自动隐藏，避免 fixed 悬浮框与锚点错位。

### 与 useAnchorPopover 的选型对比

| 维度 | useAnchorPopover | useFixedAnchorPopover |
| --- | --- | --- |
| 渲染位置 | 定位容器（`position: relative`）内 | `Teleport to="body"` |
| 定位方式 | `absolute`，容器内布局像素 | `fixed`，视口视觉像素 |
| 缩放处理 | 无需处理（处于缩放子树内） | 需 `useCockpitScale` 反向缩放 |
| 祖先 overflow 裁切 | 受限制 | 不受限制 |
| 页面内固定头部 | 可能遮挡（靠滚动容器可视区规避） | 可覆盖，不遮挡 |
| 宿主 fixed 顶部栏 | 不涉及（不超出页面内容区） | 无法覆盖，靠可视区上边界收敛规避 |
| 典型场景 | 弹框内（`CockpitDialog` body 滚动容器） | 页面级卡片（如排班与风险日历） |

---

## 二、API

```ts
export function useFixedAnchorPopover(options: {
  width: number;
  gap?: number;
  flipExtra?: number;
  arrowInset?: number;
  margin?: number;
}): {
  popoverRef: Ref<HTMLElement | { $el?: HTMLElement } | null>; // 悬浮框元素/组件 ref
  visible: Ref<boolean>;                                       // 是否展示中
  placement: Ref<'bottom' | 'top'>;                            // 悬浮框在锚点下方/上方
  position: { x: number; y: number; arrowLeft: number };       // reactive 坐标（视觉像素，arrowLeft 为布局像素）
  popoverStyle: ComputedRef<Record<string, string>>;           // left/top/transform/--arrow-left，直接绑 :style
  show: (anchorEl: HTMLElement) => void;                       // 鼠标进入锚点时调用
  hide: () => void;                                            // 鼠标离开锚点时调用
};
```

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `options.width` | `number`（必填） | 悬浮框宽度（**布局像素** px），用于水平居中与 clamp。 |
| `options.gap` | `number`（默认 `6`） | 悬浮框与锚点元素的垂直间距（**布局像素** px）。 |
| `options.flipExtra` | `number`（默认 `0`） | 翻转到锚点上方时，额外向上偏移的距离（**布局像素** px）。 |
| `options.arrowInset` | `number`（默认 `16`） | 箭头中心距悬浮框左右边缘的最小距离（**布局像素** px），防止箭头越过圆角。 |
| `options.margin` | `number`（默认 `8`） | 悬浮框距可视区边缘的安全边距（**视觉像素** px）。 |
| `popoverRef` | `Ref` | 悬浮框元素/组件的模板 ref（组件自动取 `$el`），用于渲染后实测高度。 |
| `visible` | `Ref<boolean>` | `show`/`hide` 维护的展示态，可用于 `v-if` 或内部守卫。 |
| `placement` | `Ref<'bottom' \| 'top'>` | 垂直方向：`bottom` 悬浮框在锚点下方、箭头朝上；`top` 在锚点上方、箭头朝下。透传给悬浮框组件切换箭头样式。 |
| `popoverStyle` | `ComputedRef` | 含 `left`、`top`、`transform: scale(...)`、`--arrow-left` 的样式对象，直接绑定 `:style`。 |
| `show(anchorEl)` | `(HTMLElement) => void` | 鼠标进入锚点元素时调用，`anchorEl` 取 `event.currentTarget`。 |
| `hide()` | `() => void` | 鼠标离开锚点元素（或页面滚动）时调用。 |

> 单位约定：`width/gap/flipExtra/arrowLeft` 为**布局像素**（设计稿尺寸，悬浮框自身坐标系）；`margin` 与内部可视区边界为**视觉像素**（视口坐标系），两者通过 `scale` 换算。

---

## 三、调用示例

以下示例来自 `SchedulingAndRisk.vue`：鼠标经过日历格时，在日期格正下方展示悬浮详情卡，空间不足翻转到上方。

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

  <!-- 必须 Teleport 到 body：脱离祖先 overflow 裁切与层叠限制 -->
  <Teleport to="body">
    <RiskDetail
      v-if="hoverDetail"
      ref="popoverRef"
      :detail="hoverDetail"
      :placement="placement"
      class="sr-popover"
      :style="popoverStyle"
    />
  </Teleport>
</template>
```

### 2. 脚本

```ts
import { computed, ref } from 'vue';
import RiskDetail from './RiskDetail.vue';
import { useFixedAnchorPopover } from '@/views/kongguJww/commercialVehicle/components/utils/useFixedAnchorPopover';

const hoverDay = ref<number | null>(null);
// 悬浮框宽 270px；翻转上方时额外上偏 20px
const { popoverRef, placement, popoverStyle, show: showPopover, hide: hidePopover } =
  useFixedAnchorPopover({ width: 270, gap: 6, flipExtra: 20 });

const hoverDetail = computed(() => {
  if (hoverDay.value === null) return null;
  return { ...defaultDetail, ...detailOverrides[hoverDay.value] };
});

function handleCellEnter(cell: DayCell, event: MouseEvent) {
  if (!cell.current) return;
  hoverDay.value = cell.day; // 先置位 v-if 条件，让悬浮框开始渲染
  showPopover(event.currentTarget as HTMLElement);
}

function handleCellLeave() {
  hoverDay.value = null;
  hidePopover();
}
```

### 3. 悬浮框组件配合（RiskDetail.vue）

箭头水平位置由 `--arrow-left` 驱动，`placement` 切换箭头朝向：

```vue
<div class="risk-detail" :class="{ 'risk-detail--top': placement === 'top' }">
  <span class="risk-detail__arrow"></span>
  ...
</div>
```

```scss
.risk-detail__arrow {
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
.risk-detail--top .risk-detail__arrow {
  top: auto;
  bottom: -4px;
  border-radius: 0 0 2px;
}
```

---

## 四、关键 CSS 配置

悬浮框自身只需要四点：

```scss
.sr-popover {
  position: fixed;          // 1. 固定定位：坐标即视口视觉像素，与 hook 计算一一对应
  z-index: 10;              // 2. 高于页面内容（含页面内固定头部）；低于 CockpitDialog(1000)
  transform-origin: left top; // 3. 反向缩放的原点：left/top 即视觉左上角
  pointer-events: none;     // 4. 悬浮框不拦截鼠标事件
}
```

| 属性 | 作用 | 缺失后果 |
| --- | --- | --- |
| `position: fixed` | 让 `left/top` 直接对应视口坐标 | 改为 `absolute` 时坐标相对最近定位祖先，全部错位 |
| `z-index` | 与页面其余浮层比层级 | 被页面内固定头部等盖住 |
| `transform-origin: left top` | 配合 `popoverStyle` 的 `transform: scale(scale)`，缩放不改变左上角锚点 | 默认中心缩放，悬浮框相对坐标偏移 |
| `pointer-events: none` | 鼠标事件穿透悬浮框 | 鼠标移到悬浮框上触发锚点 `mouseleave`，悬浮框闪隐 |

> 注：**不要**在悬浮框上改写/叠加 `transform` —— `popoverStyle` 已写入 `transform: scale(scale)`，覆盖或追加 translate 会破坏缩放与定位；也不要给悬浮框增加带 transform 的祖先（Teleport 到 body 已保证不存在）。

---

## 五、实现原理

### 1. 为什么 Teleport 到 body + fixed

页面内绝对定位（`useAnchorPopover`）会被祖先的 `overflow: hidden/auto` 裁切（如页面滚动容器 `.prod-content`），也无法覆盖固定不滚动的页面头部。Teleport 到 body 后悬浮框脱离页面 DOM 子树：既不被裁切，层级也高于页面内所有静态/低层级元素。

### 2. 坐标系：视口视觉像素 + 反向缩放

- 悬浮框 Teleport 到 body 后位于 `WidthScaleContainer` 的 transform 缩放子树**之外**，不存在带 transform 的祖先，因此 `fixed` 的包含块就是**视口**，`left/top` 直接使用视口视觉像素；
- 锚点坐标取 `getBoundingClientRect()`（同为视觉像素，已含页面缩放与滚动），两者同坐标系直接计算，无需换算原点；
- 悬浮框自身按 `useCockpitScale` 的 `scale` 反向缩放（`transform: scale(scale)` + `transform-origin: left top`），否则 body 级元素不受页面缩放、会按设计稿原尺寸显示而偏大；
- 尺寸换算：悬浮框 `offsetWidth/offsetHeight` 是**布局像素**（未缩放），视觉占用 = `offset * scale`；`gap/flipExtra/width` 等设计量同为布局像素，参与视口计算时乘 `scale` 换为视觉像素。

> 反例（曾踩坑）：若误把坐标换算到 `.width-scale-container__screen` 的本地坐标系（减 screen 原点、除 scale），而悬浮框实际包含块是视口，会整体跑偏；clamp 边界混用布局像素与视觉像素还会把悬浮框推出视口导致"消失"。

### 3. 可视区收敛与顶部遮挡对策

嵌入宿主时，子应用整体处于宿主的层叠上下文内：body 级悬浮框的 `z-index` 再高也**盖不住**上下文之外的宿主 fixed 顶部栏（如「经营驾驶舱」），一旦重叠必然被挡。因此不追求"盖过"，而是**永不重叠**：

```
可视区左   = max(margin, screenRect.left)
可视区右   = min(innerWidth, screenRect.right)
可视区上   = max(margin, screenRect.top, 顶部障碍底边)
可视区下   = min(innerHeight, screenRect.bottom)
```

- `.width-scale-container__screen` 是子应用内容区矩形（嵌入时位于宿主顶部栏之下），水平/垂直 clamp 到该矩形内，悬浮框不会伸到宿主 chrome 区域；
- **顶部障碍探测**（`probeTopObstacleBottom`）：`document.elementFromPoint(innerWidth / 2, 2)` 取视口最顶部元素；若它不在 screen 子树内且 `position` 为 `fixed/sticky`（宿主顶部栏的典型特征），取其 `rect.bottom` 作为可视区上边界；命中 screen 子树（独立运行时无宿主栏）或非 fixed 元素时返回 0，不影响正常可视区。

### 4. 水平定位与箭头跟随

1. `centerX = rect.left + rect.width / 2`（锚点中心，视觉像素）；
2. `x = clamp(centerX - width * scale / 2, 可视区左, 可视区右 - width * scale)`：居中优先，靠边时收进可视区；
3. `arrowLeft = clamp((centerX - x) / scale, arrowInset, width - arrowInset)`：悬浮框被 clamp 平移后箭头仍对准锚点中心；除 `scale` 换回布局像素（箭头在悬浮框自身坐标系内）。

### 5. 垂直定位：先下、再翻、后 clamp

1. **先下**：`show` 时同步写入初始值 `y = rect.bottom + gap * scale`、`placement = 'bottom'`，悬浮框立即在锚点下方渲染（避免空帧）；
2. **实测**：`await nextTick()` 后取 `popoverRef` 元素的 `offsetHeight * scale`（高度由内容撑开，无法预知）；
3. **再翻**：若 `y + 视觉高 > 可视区下 - margin`，尝试上方：`aboveY = rect.top - gap * scale - 视觉高 - flipExtra * scale`；满足 `aboveY >= 可视区上` 时采用并置 `placement = 'top'`（箭头朝下）；
4. **后 clamp**：上方也放不下时 `y = clamp(可视区下 - margin - 视觉高, 可视区上, 可视区下 - margin)`，贴可视区展示兜底。

### 6. 滚动自动隐藏

`fixed` 悬浮框不随页面滚动：`show` 时以**捕获阶段**在 window 监听 `scroll`（捕获可收到内部滚动容器如 `.prod-content` 的事件），触发即 `hide`（同时移除监听），下次 mouseenter 重新定位。

### 7. 调用时序

```
mouseenter → 置位 v-if 条件 → show(anchorEl)
           → updateScale + updateBounds（screen 矩形 + 顶部障碍探测）
           → 同步：水平居中/clamp + 箭头 + 初始下方 y + visible = true + 监听 scroll(捕获)
           → nextTick：实测高度 → 保持下方 / 翻转上方 / clamp 兜底 → 写回 y 与 placement
mouseleave / 任意滚动 → hide()：移除 scroll 监听 + visible = false
```

---

## 六、注意事项

- `show` 必须在**置位 `v-if` 条件之后**调用（先让悬浮框开始渲染，hook 内部再等 `nextTick`），否则测量不到元素，垂直方向保持初始下方位置；
- 悬浮框必须 `Teleport to="body"`：一旦留在页面子树内，transform 祖先会夺取 fixed 包含块（坐标错位）、overflow 祖先会裁切、层叠上下文会限制层级；
- 单位不要混用：`width/gap/flipExtra/arrowInset` 为布局像素，`margin` 为视觉像素；新增计算量时注意所处坐标系；
- 嵌入宿主时悬浮框**无法覆盖**宿主 fixed 顶部栏（层叠上下文限制），靠可视区上边界收敛规避；若宿主顶部栏既非 fixed/sticky 又在 screen 之外，探测会退化为 screen 顶边兜底；
- 悬浮框高度超过可视区高度时，翻转条件不满足，退化为 clamp 贴边展示，内容自身需支持滚动；
- 页面滚动即隐藏：滚动后需重新 mouseenter 才展示，避免 fixed 悬浮框与锚点错位；
- 弹框（`CockpitDialog`）内场景优先使用 `useAnchorPopover`：弹框 body 是独立滚动容器且不存在宿主遮挡问题，容器内绝对定位无需 scale 换算。
