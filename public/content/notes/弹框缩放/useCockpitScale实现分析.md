# useCockpitScale 实现分析

## 一、概述

`src/hooks/web/useCockpitScale.ts` 是一个用于「获取驾驶舱大屏缩放比例」的组合式 Hook。

- 支持两种缩放来源：读取大屏容器的 `transform` 缩放、或按设计稿宽度计算比例。
- 将缩放值以响应式状态、CSS 变量样式、刷新方法的形式对外暴露。
- 监听窗口与 `visualViewport` 的 `resize` 事件，自动同步缩放值。

---

## 二、类型定义

```ts
export interface UseCockpitScaleOptions {
  scaleContainerSelector?: string;  // 主缩放容器选择器
  fallbackSelector?: string;        // 备选容器选择器
  cssVariableName?: string;         // 写入的 CSS 变量名
  designWidth?: number;             // 设计稿宽度
}

export interface UseCockpitScaleReturn {
  scale: Ref<number>;
  scaleStyle: ComputedRef<Record<string, string>>;
  updateScale: () => void;
  getCurrentScale: () => number;
}
```

---

## 三、常量与工具函数

### 1. `getScaleFromTransform(transform)`

解析 `transform` 字符串：

- 匹配 `matrix3d(...)` 或 `matrix(...)`，取第一个值（X 轴缩放，即 `values[0]`）。
- 非法 / 无 transform 时返回 `1`；缩放值必须 `> 0` 才生效，否则兜底 `1`。

### 2. `isVisibleScaleElement(element)`

判断元素「可见且非零尺寸」：`offsetWidth > 0` 且 `getBoundingClientRect` 的宽高均 `> 0`。

### 3. `findVisibleScaleElement(selector)`

`querySelectorAll` 后取**第一个可见**元素，避免匹配到多个同名但隐藏的容器。

### 4. `getElementScale(scaleElement)`

- 优先读 transform 的 scale；若非 `1` 则直接返回。
- 否则用 `getBoundingClientRect().width / offsetWidth` 计算（真实渲染宽度 / 布局宽度）。

### 5. `getDesignWidthScale(scaleElement, designWidth)`

按设计稿算比例：`容器实际宽度 / designWidth`；取不到容器时回退 `window.innerWidth`。

---

## 四、核心 Hook `useCockpitScale`

### 状态与计算

- `scale = ref(1)`，`updateRaf` 保存 rAF 句柄。
- `scaleStyle`：computed，返回 `{ [cssVariableName]: String(scale) }`，供模板 `:style` 绑定注入 CSS 变量。

### 取容器逻辑 `getScaleElement()`

先按 `scaleContainerSelector`（默认 `.width-scale-container__screen`）找可见元素，找不到再按 `fallbackSelector`（默认同主选择器）找，最终可能为 `undefined`。

### 计算逻辑 `getCurrentScale()`

- 无 `window` 返回 `1`；
- 有 `designWidth` → `getDesignWidthScale`；
- 否则 → 有容器就 `getElementScale`，没容器返回 `1`。

### 刷新 `syncScale` / `updateScale`

- `syncScale`：仅赋值 `scale.value = getCurrentScale()`。
- `updateScale`：先 `cancelAnimationFrame` 取消上一次，再立即 `syncScale`，然后用 `requestAnimationFrame` 调度一次（保证布局稳定后再取一次值，本质是 rAF 防抖）。

### 生命周期

- `onMounted`：先 `updateScale()` 初始化，并监听 `window.resize` 与 `window.visualViewport?.resize`（移动端软键盘等场景）。
- `onUnmounted`：移除监听 + `cancelAnimationFrame`，避免泄漏。

---

## 五、设计要点

| 点 | 说明 |
|---|---|
| 两种缩放来源 | transform 缩放（大屏整体 scale）或 designWidth 比例缩放，通过 `designWidth` 有无自动切换 |
| 可见容器筛选 | 多个同名容器时只取「可见且非零」的，避免误读隐藏容器 |
| 双事件监听 | `resize` + `visualViewport.resize`，兼容移动端 |
| rAF 防抖 | `updateScale` 立即执行一次 + rAF 再补一次，兼顾及时性与性能 |
| 服务端安全 | 所有 `window` / `document` 访问都有守卫，SSR 下返回兜底值 |

---

## 六、在 `RealTimeDetail.vue` 中的用法

```ts
const {
  scaleStyle: modalScaleStyle,
  updateScale: updateModalScale,
} = useCockpitScale({
  scaleContainerSelector: '.jww-index-entry .width-scale-container__screen',
  cssVariableName: '--jww-index-real-time-modal-scale',
  designWidth: 1980,
})
```

参数含义：

- `scaleContainerSelector`：指定用于读取缩放的容器（比默认选择器更精确，限定在 `.jww-index-entry` 内）。
- `cssVariableName`：把计算出的 scale 写入该 CSS 变量（默认 `--cockpit-scale`）。
- `designWidth: 1980`：按设计稿宽度 1980px 计算比例（`当前容器宽度 / 1980`）。

两个返回值的使用：

1. `modalScaleStyle`（computed）绑定在模板根节点 `:style="modalScaleStyle"`，把缩放值作为 CSS 变量传给整棵弹窗 DOM。
2. `updateModalScale`（`updateScale`）在弹窗 `visible` 变为 `true` 且 `await nextTick()` 后手动调用一次，因为此时容器可能刚渲染 / 可见，需主动刷新。

CSS 端消费变量：

```css
transform: translate(-50%, -50%) scale(var(--jww-index-real-time-modal-scale, 1));
```

弹窗居中偏移 `-50%` 的同时按该变量缩放，使弹窗与大屏保持一致比例。

> 注意：使用 `designWidth` 后，缩放不再依赖容器是否被 CSS `transform` 缩放，而是按实际渲染宽度与设计稿宽度的比值计算，`scaleContainerSelector` 主要作为「取容器宽度」的目标（取不到时回退 `window.innerWidth`）。

---

## 七、潜在注意点

1. `getScaleFromTransform` 只认 `matrix` / `matrix3d`，若大屏使用了 `scale(x, y)` 语法（浏览器通常会统一转成 matrix，故一般无碍）。
2. `scaleStyle` 返回对象未合并其它变量，绑定 `:style` 时会**整体覆盖**其它内联样式，需注意别与其它 style 混用（`RealTimeDetail.vue` 中该节点只有这一个 style，无问题）。
3. `updateScale` 返回值为 `void`，调用方无法 await 刷新结果，需在 `nextTick` 之后手动调用。
