# 智能科技驾驶舱 - MapChart 下钻地图组件定制指南

> 涉及目录：`src/views/kongguJww/smartTechnology/components/homeIndex/map/` 关键文件：`MapChart.vue`、`index.vue`（mock 入口）、`config/mapConfig.ts`、`utils/worldMapGeo.ts`

## 一、组件定位

`MapChart.vue` 是基于 ECharts + 静态 GeoJSON 的三级下钻地图组件，结构：

```
世界地图（默认加载）
  │  echarts.registerMap('zhikeWorld', world.json)
  │
  ├─ 点击 "中国" → 省份地图
  │   │  echarts.registerMap('china', china.json)
  │   │
  │   └─ 点击某省份 → 城市地图
  │       │  动态加载 citiesgeojson/{adcode}.json
  │       │  echarts.registerMap(省份名, geoJson)
  │       └─ 点击返回 → 返回上级
```

每一级都共用同一个 ECharts 实例，靠 `currentLevel` 状态机切换 GeoJSON + 数据聚合方式。

---

## 一之二、实现思路（数据流与分层）

这一节解释组件**为什么这么写**，后续改动前先读这里，能避免改错层导致「配了不生效」。

### 1.2.1 五层结构

| 层 | 职责 | 关键代码 |
| --- | --- | --- |
| **Props 层** | 接收 3 类输入：数据（`mapData`/`worldData`）、配置（`options`）、开关（`interaction`/`chinaOnly`/`showSouthChinaSea`/`detailType`） | `defineProps` + `interactionConfig` computed |
| **状态机层** | `currentLevel`（world/province/city）+ `currentProvince` + `currentScale`/`currentWorldZoom` 驱动视图切换 | `resetMapViewForLevel`、`handleMapClick`、`backToProvince` |
| **数据装配层** | 把业务数据转成 ECharts 系列数据：`getWorldData` / `getProvinceData` / `getCityData` 产出 map 系列，`generateBaseScatterData` 产出 effectScatter 系列 | 三个 `get*Data` + `aggregateProvinceRevenueItems` |
| **配置生成层** | `getChartOption(mapName, data, seriesName)` 合成完整 EChartsOption：tooltip / visualMap / geo / series | `getChartOption` |
| **渲染与资源层** | GeoJSON 按需 fetch + `registerMap`、实例生命周期、`ResizeObserver`、zoom 按钮 | `ensureBaseMapsRegistered`、`initChart`、`loadCityMap` |

### 1.2.2 核心数据流

```
业务数据 ProvinceData[] / WorldCountryData[]
        │
        ├─ resolveRevenueItems()  每级 revenueItems 归一为 {key, value, unit}
        │        │
        │        └─ sumRevenueItems()  求合计 → 驱动 visualMap 颜色档位
        │
        ├─ getWorldData / getProvinceData / getCityData
        │        └─ MapDataItem[]  （name / value / rawValue / revenueItems / coord / label / hasMarker）
        │                │
        │                ├─ map 系列数据（区域着色）
        │                └─ generateBaseScatterData → ScatterDataItem[]（打点）
        │
        └─ getChartOption()
                 ├─ visualMap  max = 当前层级有效值最大值
                 ├─ geo        区域底色 / 布局 / 世界级国名 nameMap
                 ├─ series[0]  map  （geoIndex:0，与 geo 共用坐标系）
                 └─ series[1]  effectScatter（水波纹，z=19）
```

### 1.2.3 三组「值」的区别（改代码最容易踩的坑）

| 字段 | 含义 | 用途 |
| --- | --- | --- |
| `rawValue` | 真实合计（可为 `null`） | **只给 tooltip 展示**，`null` 显示 `--` |
| `value` | 参与 visualMap 的值 | 区域着色；`null` 会被转成 `undefined` |
| `revenueItems` | 键值对明细 | tooltip 分项行、`#detail` 插槽 |

有基地但合计为 0 的区域，`value` 会被替换成 `getZeroRevenueMarkerVisualValue(max)`（倒数第二档颜色），而 `rawValue` 仍是 0 —— 这就是「0 收入区域有颜色但 tooltip 显示 0」的实现方式。

### 1.2.4 GeoJSON 资源策略

- 世界 / 中国地图在 `initChart` 时**并行 fetch 一次**，结果缓存在模块级 `baseMapsRegistered` / `baseMapsRegistration`，同页多个 MapChart 实例共享，不会重复下载。
- 省份地图**首次点击时才加载**：优先 `citiesgeojson/{adcode}.json`，缺失时回退从 `cities.json` 里按 `parent.adcode` 过滤出该省 feature 集合。
- 注册名 = 省份名（已 normalize），所以 `getChartOption` 的城市层级可以直接用 `currentProvince` 当 `mapName`。

### 1.2.5 世界级特殊处理

世界地图比其他层级多三件事，都集中在 `getChartOption` 的 `isWorldMap` 分支：

1. `nameMap` 注入「英文名 → 中文名」映射，同时给 `label.formatter` 兜底（不同 ECharts 版本对 `emphasis.label` 尊重 `nameMap` 的程度不一致）。
2. `buildWorldRegions()` 逐国生成 label 颜色（有值的国家白色）。
3. `center` 交给 `WORLD_VIEW.center`（`undefined` 表示按地图 bbox 自动居中），`zoom` 用 `currentWorldZoom` 独立维护，与国内层级的 `layoutSize` 是两套缩放口径。

### 1.2.6 tooltip 双模式

| 模式 | 走法 |
| --- | --- |
| `detailType="view"` | `formatTooltipContent` 拼 HTML 字符串，ECharts 直接渲染 |
| `detailType="custom"` | 渲染 `#detail` 插槽 → 手动 `createVNode` + `render` 到复用的 `detailContainer`，再把 DOM 交给 ECharts 当 tooltip 内容 |

custom 模式额外做了四件事：气泡背景透明化、`position` 回调让卡片跟手且不压光标、`transitionDuration=0`、`z-index: 100` 避免盖住全局下拉面板。`interaction.detailArea` 在这一层做「打点 / 区域」过滤 —— 注意它只影响 tooltip，不影响点击下钻。

### 1.2.7 改动的六个必经点（清单）

给组件加新能力时按此顺序检查，漏一处就会出现「数据配了但不生效」：

1. **类型定义** —— 业务字段走 `detailData?: MapDetailData`（`unknown`）泛型透传，**不要**在 MapChart 里定义业务字段。
2. **数据装配** —— `getWorldData / getProvinceData / getCityData` 里补字段、补同名合并逻辑。
3. **打点数据** —— `generateBaseScatterData`，点数据必须带 `provinceName`（点击下钻依赖）和 `value` 第三位数值（symbolSize 依赖）。
4. **tooltip / 插槽** —— 透传字段要显式塞进 `slotProps`，否则插槽拿不到。
5. **Props 与 watch** —— 新开关是否要触发 `updateChart()`；不在 watch 列表里的必须伴随被 watch 的 prop 变化。
6. **geo / series 布局** —— 涉及层级时同时检查 `initChart` 初始层级、`handleMapClick`、`backToProvince` 三条链路。

---

## 二、Props（v8 - 四入参版）

```ts
interface Props {
  /** 各层级数据：world 可选，provinces 必传 */
  data: MapDataset;
  /** 全局配置：tooltip、散点、区域底色、视图范围 scope、布局 */
  options?: MapChartOptions;
  /** 交互开关：下钻 / 打点 / 打点粒度 / 下钻门槛 / 悬浮框触发范围 */
  interaction?: MapInteractionOptions;
}
// 第 4 个入参是插槽：写了 #detail 即走自定义悬浮卡片
```

```ts
export interface MapDataset {
  /** 世界级单国条目；不传则世界层级无数据 */
  world?: WorldCountryData[];
  /** 省份/基地明细（驱动省份级与城市级地图） */
  provinces: ProvinceData[];
}

export interface MapInteractionOptions {
  drill?: boolean;                                  // 默认 true
  markers?: boolean;                                // 默认 = drill
  markerGranularity?: 'province' | 'city';           // 默认 'province'
  drillRequiresMetricValue?: boolean;                // 默认 true
  detailArea?: 'all' | 'dot';                        // 默认 'all'
}
```

> **v8 变更要点（入参通用性）**：顶层 props 从 7 个收敛为 3 个 + 1 个插槽。
>
> | v8 之前 | v8 之后 | 说明 |
> | --- | --- | --- |
> | `:map-data="x"` + `:world-data="y"` | `:data="{ provinces: x, world: y }"` | 合并为单一数据集；**取消**「不传 world 就自动聚合中国」的隐式行为 |
> | `:china-only="true"` | `:options="{ scope: { chinaOnly: true } }"` | 视图范围归入 options |
> | `:show-south-china-sea="true"` | `:options="{ scope: { southChinaSea: true } }"` | 同上 |
> | `detail-type="custom"` | **删除** | 有 `#detail` 插槽即 custom，无需再声明 |
> | （无） | `options.tooltip.mode: 'view'` | 逃生阀：写了插槽但想用内置卡片时显式指定 |
>
> **`revenueItems` 与 visualMap 解耦**：新增 `metricValue`，visualMap 只读它（未提供时回退 `revenueItems` 合计）。`revenueItems` 从此**只负责展示**，改它不会影响区域颜色，改 `metricValue` 不会影响悬浮卡片。
>
> **视觉配置支持按层级覆盖**：`options.scatter` / `options.visual` 的颜色类字段改为 `PerLevel<T>`，可直接给值（三层共用）或给 `{ world, province, city }` 对象按层级配置。

> **v7 变更要点（参数收敛）**：v5 引入的 `drillable / showMarkers / markersWhenNotDrillable / chinaMarkerLevel / drillRequiresMetricValue / detailArea` 六个 prop 互相耦合（例如 `markersWhenNotDrillable` 只在 `drillable=false` 时有意义），现合并为单一 `interaction` 对象。
>
> | v7 之前 | v7 之后 |
> | --- | --- |
> | `:drillable="isDrillable"` | `:interaction="{ drill: isDrillable }"` |
> | `:show-markers="x"` | `:interaction="{ markers: x }"` |
> | `:china-marker-level="'city'"` | `:interaction="{ markerGranularity: 'city' }"` |
> | `:drill-requires-metric-value="x"` | `:interaction="{ drillRequiresMetricValue: x }"` |
> | `:detail-area="'dot'"` | `:interaction="{ detailArea: 'dot' }"` |
> | `:markers-when-not-drillable="true"` | **删除**（该开关从未真正生效，`drill=false` 时想要打点请显式写 `markers: true`） |
> | `:show-type="'china'"` | **删除**（`'china'` 视角无任何调用方，世界地图固定走整图居中视角） |
> | `detailArea="'area'"` | **删除**（无调用方，枚举收敛为 `'all' \| 'dot'`） |

> v4 起变更要点（相比 v3）：
> - 悬浮卡片数据**全部采用 `revenueItems` 键值对 `[{ key, value }]`**，移除 `cateringRevenue/supermarketRevenue/propertyRevenue/totalCatering/totalSupermarket/totalProperty` 等固定字段及其旧两写法兼容路径。
> - `RevenueItem.label` **重命名为 `key`**（更贴合"键值对"语义）。
> - **合计收入行统一关闭**：`options.tooltip.totalLabel` 与 `options.tooltip.showTotal` 删除；`options.tooltip.cateringLabel/supermarketLabel/propertyLabel` 同步删除（分项标签改由各 `revenueItems[i].key` 自定义）。

> `options` 关键字段：`tooltip.enterable`（悬浮卡片是否可移入停留）、`showProvinceLabel`（中国/省份层级常驻标签显隐）、`layout`（非 world 层级 `layoutCenter/layoutSize` 覆盖；**v6 起 `layout.size` 支持对象形态按 `province/city` 层级分别配置**，见 5.9 场景 I）。

### 2.1 基础调用

```vue
<template>
  <MapChart :data="{ provinces: mapData, world: worldData }" :options="options" />
</template>

<script setup lang="ts">
  import MapChart, {
    type MapChartOptions,
    type ProvinceData,
    type WorldCountryData,
  } from './MapChart.vue';

  const mapData = ref<ProvinceData[]>([
    /* 见第三节 */
  ]);
  const worldData = ref<WorldCountryData[]>([
    /* 见第三节 */
  ]);
  const options: MapChartOptions = {
    /* 见第四节 */
  };
</script>
```

> **暴露方法**：组件通过 `defineExpose({ resize })` 暴露 `resize()`；如需父组件在容器尺寸变化后手动触发 resize，可加 `ref` 调用：

```ts
const chartRef = ref<InstanceType<typeof MapChart>>();
// 容器折叠/展开后：
chartRef.value?.resize();
```

---

## 三、数据结构定义

所有公共类型都从 `MapChart.vue` 显式 `export interface`，可按需 `import { type } from './MapChart.vue'`。

### 3.1 收入分项（键值对，可变 N 项）— 核心

```ts
export interface RevenueItem {
  /** tooltip 中显示的分项 key，如 "007" / "MINI卡" / "GMV" / "客流" */
  key: string;
  /** 数值；null/undefined/NaN 视为无数据，tooltip 显示 "--"；0 是有效业务值显示 "0 {unit}" */
  value: string | number | null;
  /** 单位覆盖；不传则用全局 options.tooltip.unit 或 ProvinceData.unit */
  unit?: string;
}
```

`base` / `province` / `world` 三级数据都支持 `revenueItems`：tooltip 按数组顺序渲染各分项键值对行，**不再展示合计行**。v4 起移除旧的 `cateringRevenue/supermarketRevenue/propertyRevenue` 三项字段及其回退逻辑，缺失 `revenueItems` 时该点视为无数据。

### 3.2 基地信息 BaseInfo

```ts
export interface BaseInfo {
  baseName: string;
  /** 业务自定义悬浮卡片数据载荷（可选，结构由业务侧定义）；原样透传到 #detail 插槽（slotProps.detailData） */
  detailData?: MapDetailData; // type MapDetailData = unknown，MapChart 不感知业务结构
  unit: string;
  /** 自定义散点坐标 [经度, 纬度]，不传则按 baseName 查 cityCoordMap */
  coord?: [number, number];
  /** 该基地散点样式覆盖（仅作用于本级标记） */
  scatterStyle?: ScatterStyleOverride;
  /** 收入分项（键值对，可变 N 项）；为空时 tooltip 视为无数据 */
  revenueItems?: RevenueItem[];
}
```

> v4 已移除 `revenue / cateringRevenue / supermarketRevenue / propertyRevenue` 旧字段。
>
> **v7 已移除 `sortOrder`**：该字段组件内部从未读取，请直接从数据中删除（不删也只是多余的键，不影响类型检查以外的行为）。

### 3.3 省份数据 ProvinceData

```ts
export interface ProvinceData {
  provinceName: string; // 如 "安徽省"、"北京市"
  unit: string;
  baseList: BaseInfo[];
  /** 省份中心点自定义坐标，不传时按 provinceName 查 getProvinceCenter */
  coord?: [number, number];
  /** 省级汇总分项（键值对，可变 N 项）；为空时由 baseList 自行聚合 */
  revenueItems?: RevenueItem[];
}
```

> v4 已移除 `totalRevenue / totalCateringRevenue / totalSupermarketRevenue / totalPropertyRevenue` 旧字段。

### 3.4 世界级单国条目 WorldCountryData

```ts
export interface WorldCountryData {
  /** 国家名称，世界 GeoJSON 中可命中的中文/英文/别名均支持 */
  name: string;
  unit: string;
  /** 自定义散点中心 [经度, 纬度]；不传时按 name 查 getWorldFeatureCenter */
  coord?: [number, number];
  /** 散点样式覆盖（如给"中国"配强调色） */
  scatterStyle?: ScatterStyleOverride;
  /** 收入分项（键值对，可变 N 项） */
  revenueItems?: RevenueItem[];
}
```

> v4 已移除 `totalRevenue / totalCateringRevenue / totalSupermarketRevenue / totalPropertyRevenue` 旧字段。

### 3.5 散点样式覆盖 ScatterStyleOverride

```ts
export interface ScatterStyleOverride {
  color?: string;
  shadowBlur?: number;
  shadowColor?: string;
  /** 强调（中国/总部）散点的颜色 */
  highlightColor?: string;
  highlightShadowBlur?: number;
  highlightShadowColor?: string;
  /** 散点 symbolSize 上下限；不传则使用全局 options.scatter 对应值 */
  symbolSizeMin?: number;
  symbolSizeMax?: number;
}
```

---

## 四、options 全局配置 — MapChartOptions

```ts
export interface MapChartOptions {
  tooltip?: {
    unit?: string; // 默认单位文本，默认 "万元"；被 RevenueItem.unit 逐项覆盖
    labelColor?: string; // tooltip 文本颜色，默认 "#b7d7ea"
    valueColor?: string; // tooltip 数值颜色，默认 "#3eebff"
    titleColor?: string; // tooltip 顶部标题颜色，默认 "#fff"
    background?: string; // tooltip 气泡背景色，默认 mapConfig.tooltipBackground
    borderColor?: string; // tooltip 气泡边框色，默认 mapConfig.tooltipBorderColor
    shadow?: string; // tooltip 气泡阴影，默认 mapConfig.tooltipShadow
  };
  scatter?: {
    color?: string; // 默认散点颜色，默认 "#26d5ff"
    shadowBlur?: number;
    shadowColor?: string;
    highlightColor?: string; // 中国/总部等强调散点颜色，默认 "#00efff"
    highlightShadowBlur?: number;
    highlightShadowColor?: string;
    symbolSizeMin?: number; // 散点最小尺寸，默认 10
    symbolSizeMax?: number; // 散点最大尺寸，默认 12
    rippleBrushType?: 'stroke' | 'fill'; // 水波纹填充方式，默认 "stroke"
    rippleScale?: number; // 波纹缩放系数，默认 2.6
    ripplePeriod?: number; // 波纹周期，默认 4.4
  };
  visual?: {
    areaColor?: string; // 无数据区域填充色，默认 "#d9e8f5"
    borderColor?: string; // 区域边界色，默认 "rgba(255,255,255,0.78)"
    borderWidth?: number; // 边界宽度，默认 1
    emphasisAreaColor?: string; // hover 区域背景色，默认 "#0f4c81"
    emphasisBorderColor?: string; // hover 区域边界色，默认 "#ffffff"
    emphasisBorderWidth?: number; // hover 区域边界宽度，默认 1
    visualColors?: string[]; // visualMap 渐变色（从浅到深），默认 6 档蓝系
  };
  levelNames?: {
    world?: string; // 世界级埋点 mapName，默认 "世界地图"
    province?: string; // 国级埋点 mapName，默认 "中国地图"
  };
  showProvinceLabel?: boolean; // 中国/省份层级常驻省份名称标签显隐，默认 true；世界级恒不显示
  layout?: {
    center?: [string, string]; // 非 world 层级 geo.layoutCenter 覆盖，默认 ['50%','50%'] 居中
    /**
     * geo.layoutSize 覆盖（百分比，数字按 % 处理）；不传保持 mapConfig 默认（province 120% / city 112%）。
     * v6 起支持两种形态：
     *   - 数字/字符串：中国层级（province）与省份下钻层级（city）共用同一覆盖（旧写法，向后兼容）
     *   - 对象 { province, city }：按层级分别配置，未配置的层级回退 mapConfig 默认值
     */
    size?: number | string | { province?: number | string; city?: number | string };
  };
}
```

> 与 `mapConfig.ts` 的默认值对应：`RUIDA_MAP_VISUAL_CONFIG` / `RUIDA_MAP_RIPPLE_CONFIG`。所有 options 字段**只覆盖写法**，未提供的字段回退到默认。

---

## 五、改动场景对应的修改方法（重点）

### 5.1 场景 A：tooltip 文案/单位/分项数变化

#### A1. 单位由 "万元" 改为 "亿元" / "元"

```ts
const options: MapChartOptions = {
  tooltip: { unit: '亿元' },
};
```

> 改 `options.tooltip.unit` 一处即可，无需碰 mapConfig 或组件代码。

#### A2. 自定义分项标签（不再走 options.tooltip.*Label）

v4 起 tooltip 各分项标签直接来自 `revenueItems[i].key`，不再提供 `cateringLabel/supermarketLabel/propertyLabel` 等"固定三项"标签。如需换文案，直接改对应数据项的 `key`：

```ts
revenueItems: [
  { key: '餐厅收入', value: 980 },
  { key: '商超收入', value: 760 },
  { key: '物业营收', value: 420 },
],
```

#### A3. 增加第 4、5 项分项（任意 N 项，键值对）

每项分项从 `RevenueItem[]` 中读取，**不限定项数**，全部采用 `{ key, value }` 键值对：

```ts
const mapData: ProvinceData[] = [
  {
    provinceName: '安徽省',
    unit: '万元',
    revenueItems: [
      { key: '007', value: 1280 },
      { key: 'MINI卡', value: 860 },
      { key: '探索06', value: 540 },
      { key: '瑞虎8', value: 80 }, // 新增项
      { key: '广告收入', value: 12 }, // 新增项
    ],
    baseList: [
      {
        baseName: '合肥',

        unit: '万元',
        revenueItems: [
          { key: '007', value: 520 },
          { key: 'MINI卡', value: 360 },
          { key: '探索06', value: 210 },
          { key: '瑞虎8', value: 80 },
          { key: '广告收入', value: 12 },
        ],
      },
    ],
  },
];
```

#### A4. 单个 item 单位不同（如海外用美元、国内用万元）

```ts
revenueItems: [
  { key: '007', value: 520, unit: '万元' },
  { key: '海外销量', value: 80, unit: 'USD' },  // 逐项覆盖 options.tooltip.unit
],
```

#### A5. 合计行已默认关闭

v4 起「经营数据 / 销量分布」两种视图**不再展示合计收入行**，也无需配置。`options.tooltip.totalLabel / showTotal` 已移除。tooltip 只渲染各 `revenueItems[i]` 键值对分项。

#### A6. 改 tooltip 配色

```ts
const options: MapChartOptions = {
  tooltip: {
    labelColor: '#aabbcc',
    valueColor: '#ff0000',
    titleColor: '#000',
    background: 'rgba(0,0,0,0.85)',
    borderColor: 'rgba(255,255,255,0.2)',
    shadow: '0 0 12px rgba(255,200,0,0.4)',
  },
};
```

---

### 5.2 场景 B：打点散点样式变化

#### B1. 全局改散点颜色（所有省份/城市/世界的散点都换色）

```ts
const options: MapChartOptions = {
  scatter: {
    color: '#ff6600', // 普通基地散点
    highlightColor: '#ffaa00', // 中国/总部强调散点
  },
};
```

#### B2. 全局改波纹动效

```ts
const options: MapChartOptions = {
  scatter: {
    rippleScale: 3.5,
    ripplePeriod: 3.0,
    rippleBrushType: 'fill',
  },
};
```

#### B3. 全局改散点大小范围

```ts
const options: MapChartOptions = {
  scatter: { symbolSizeMin: 8, symbolSizeMax: 16 },
};
```

> 散点最终尺寸 = `Math.max(min, Math.min(max, Math.sqrt(metric) / 30))`

#### B4. 单个基地/省份自定义散点（只改这一个点）

```ts
const mapData: ProvinceData[] = [
  {
    provinceName: '湖北省',
    unit: '万元',
    revenueItems: [
      { key: '007', value: 860 },
      { key: 'MINI卡', value: 580 },
      { key: '探索06', value: 360 },
    ],
    baseList: [
      {
        baseName: '武汉',

        unit: '万元',
        revenueItems: [
          { key: '007', value: 860 },
          { key: 'MINI卡', value: 580 },
          { key: '探索06', value: 360 },
        ],
        scatterStyle: {
          color: '#ff0000', // 仅武汉基地改红色
          shadowBlur: 16,
          shadowColor: 'rgba(255,0,0,0.9)',
          symbolSizeMin: 12,
          symbolSizeMax: 18,
        },
      },
    ],
  },
];
```

> 单点覆盖优先于全局 options.scatter。

#### B5. 单点为"中国/总部"打高亮色（如海外总仓也要黄强调）

```ts
const worldData: WorldCountryData[] = [
  {
    name: '中国',
    unit: '万元',
    revenueItems: [
      /* ... */
    ],
    scatterStyle: {
      highlightColor: '#ffd400',
      highlightShadowBlur: 18,
      highlightShadowColor: 'rgba(255,212,0,0.9)',
    },
  },
];
```

> 当 `currentLevel === 'world'` 或 item.name 含 `中国` 时，组件自动取"强调"分支并读取 `scatterStyle.highlightColor`。

---

### 5.3 场景 C：打点坐标变化

#### C1. 给某个基地固定坐标（覆盖默认 cityCoordMap 查表）

```ts
{
  baseName: '昆山',

  unit: '万元',
  revenueItems: [{ key: '007', value: 100 }],
  coord: [120.95, 31.39],   // [经度, 纬度]，覆盖默认查表
}
```

#### C2. 给省份中心点固定坐标（覆盖默认 getProvinceCenter）

```ts
{
  provinceName: '上海市',
  unit: '万元',
  coord: [121.47, 31.23],   // 上海中心固定点
  baseList: [/* ... */],
}
```

> 省份级会基于该 center 用 `generateScatteredPoints(center, baseList.length)` 在周围生成多个分散点。

#### C3. 给世界级国家条目固定中心

```ts
const worldData: WorldCountryData[] = [
  {
    name: '中国',
    unit: '万元',
    coord: [104.0, 35.0], // 不传则按世界 GeoJSON 中国主多边形 bbox 中心自动算
    revenueItems: [
      /* ... */
    ],
  },
];
```

---

### 5.4 场景 D：区域底色/边界色变化

#### D1. 全局换底色（无数据省份/城市变灰）

```ts
const options: MapChartOptions = {
  visual: {
    areaColor: '#e6e6e6',
    borderColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
  },
};
```

#### D2. 改 hover 高亮色

```ts
const options: MapChartOptions = {
  visual: {
    emphasisAreaColor: '#ff9900',
    emphasisBorderColor: '#ffffff',
    emphasisBorderWidth: 2,
  },
};
```

#### D3. 改 visualMap 渐变色（区域收入映射颜色档）

```ts
const options: MapChartOptions = {
  visual: {
    // 5档红色系示例：低值浅红 → 高值深红
    visualColors: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
  },
};
```

> 注意：`visualColors.length - 2` 是 0 收入标识点的档位（"倒数第二档"），由组件内 `ZERO_REVENUE_MARKER_VISUAL_RANK = 1` 写死。改档数时最后一个值仍代表"最高"，倒数第二个值代表"有基地但合计0"。

---

### 5.5 场景 E：埋点名称变化

#### E1. 改下钻埋点的 mapName

```ts
const options: MapChartOptions = {
  levelNames: {
    world: '全球分布图',
    province: '中国区域图',
  },
};
```

> 仅影响 `mapClick` 上报的 `mapName` 字段。

---

### 5.6 场景 F：仅中国地图模式（专用车总览等无世界层级页面）

`options.scope` 里的 `chinaOnly` + `southChinaSea` 组合使用：

```vue
<MapChart
  :data="{ provinces: mapData }"
  :options="{ scope: { chinaOnly: true, southChinaSea: true } }"
/>
```

| 配置 | 行为 |
| --- | --- |
| `scope.chinaOnly=true` | 跳过世界层级：初始 `currentLevel='province'`（即中国地图），不渲染返回按钮；数据变化时强制回到中国层级，避免沿用旧数据下的下钻视图 |
| `scope.southChinaSea=true` | 中国地图展示南海诸岛附图；`false`（默认）时附图区域整体置透明隐藏，视觉保持原样 |

> 注意：`chinaOnly` 模式下下钻仍然可用（受 `interaction.drill` 控制），点省份/打点照样进入城市地图，只是没有「返回世界地图」按钮（城市级返回按钮「切换回省份」正常渲染）。中国地图模式无需传 `data.world`。

---

### 5.7 场景 G：业务自定义悬浮框（#detail 插槽）

**v8 起不再需要 `detail-type="custom"`**：只要写了 `#detail` 插槽就走自定义卡片；没有插槽则用内置文案卡片。若写了插槽但临时想用内置卡片，传 `options.tooltip.mode: 'view'`。

内置卡片只能渲染「标题 + 键值对分项」的通用文案；需要渲染复杂业务卡片（多段落、按钮等）时用插槽：

```vue
<MapChart
  :data="{ provinces: mapData }"
  :options="{ tooltip: { enterable: false } }"
  :interaction="{ detailArea: activeTabIndex === 0 ? 'dot' : 'all' }"
>
  <template #detail="slotProps">
    <!-- slotProps.detailData 是业务载荷（结构由业务侧定义），卡片内部解析 -->
    <MapDetailTooltip1
      :title="getOperationDetail(slotProps).projectName"
      :sections="getOperationDetail(slotProps).sections"
    />
  </template>
</MapChart>
```

**`#detail` 插槽入参（MapDetailSlotProps）**：

| 字段 | 说明 |
| --- | --- |
| `name` | 展示用名称（世界级已转中文；城市级形如「石家庄市」） |
| `rawName` | ECharts 原始 data.name |
| `level` | 当前层级 `'world' \| 'province' \| 'city'` |
| `isDot` | 是否命中打点（effectScatter）；`false` 为区域（map 系列） |
| `rawValue` / `value` | 实际数值 / 视觉映射值 |
| `revenueItems` | 解析后的键值对分项 |
| `provinceName` | 所属省份（仅打点且数据可得时存在） |
| `detailData` | **业务自定义悬浮卡片数据载荷**：MapChart 不感知结构、不定义业务字段，数据里配什么原样透传什么（`export type MapDetailData = unknown`），标题、键值对段落等结构与回退全部由业务卡片内部解析 |
| `currentProvince` | 已下钻到的省份（中国层级为空） |

> 设计原则：**MapChart 内不定死任何业务字段**。悬浮卡片的标题、键值对内容等业务数据统一装进数据项的 `detailData`，由 `BaseInfo → MapDataItem / ScatterDataItem → MapCallbackData → slotProps.detailData` 泛型透传；业务卡片（如 MapDetailTooltip1）自行解析并定义回退兜底。

**`interaction.detailArea` 触发范围**：`all`（默认，区域+打点都触发）/ `dot`（仅打点触发，区域 hover 不出悬浮框）。v7 已移除无调用方的 `'area'`。

**组件内部已处理的 custom 细节**（业务无需关心）：气泡背景/边框置透明、`transitionDuration=0` 跟手、tooltip 锚定光标右下（放不下自动翻转）、`z-index` 压到 100 避免盖住全局下拉面板；是否可移入悬浮框由 `options.tooltip.enterable` 控制（custom 默认可移入，业务可显式关闭）。

> 踩坑：`options` 是非响应式对象，`tooltipConfig` 在每次悬浮时读取，`interaction.detailArea` 在 formatter 里读 `interactionConfig` 可以动态切换；但依赖 `updateChart()` 重算的配置（如散点、布局）变化时需确保有 watcher（`mapData` / `interaction` / `worldData` / `chinaOnly` 等）跟着触发。

---

### 5.8 场景 H：中国层级按项目城市逐点打点（interaction.markerGranularity='city'）

需求背景（环卫运营）：**中国地图和省份地图都要按项目打点** —— 省份地图打在当前城市的地理位置中心，中国地图打在城市的具体位置，hover 打点出对应项目的悬浮框。

```vue
<MapChart
  :data="{ provinces: mapData }"
  :interaction="{ markers: true, markerGranularity: 'city', detailArea: 'dot' }"
  :options="{ scope: { chinaOnly: true } }"
>
  <template #detail="slotProps"> ... </template>
</MapChart>
```

**两种粒度的行为对比**（`generateBaseScatterData` 中国层级分支）：

| `interaction.markerGranularity` | 打点数量 | 坐标 | 点数据来源 |
| --- | --- | --- | --- |
| `'province'`（默认） | 一省一点，仅 `baseList` 非空的省份 | `province.coord` → `getProvinceCenter`（省会） | 省级汇总 `revenueItems` |
| `'city'` | 每个项目城市一点（遍历所有省份 `baseList`） | `base.coord` → `getCityCoord(baseName)` → 省份中心兜底 | 该项目自身的 `revenueItems` |

**数据侧只需一件事**：给每个项目（`baseList` 条目）配 `coord`（城市地理位置中心，WGS84）。同一个坐标同时满足两种口径 —— 中国地图落在城市具体位置，下钻后的省份地图也落在该城市中心（城市级打点本来就是 `base.coord → getCityCoord`）。

```ts
{
  provinceName: '河北省',
  unit: '万元',
  baseList: [
    {
      baseName: '石家庄',
      unit: '万元',
      coord: [114.520828, 38.048684], // 项目所在城市的地理位置中心
      revenueItems: [ // 驱动打点数值与 visualMap
        { key: '作业车辆', value: 52, unit: '辆' },
        { key: '环卫运营收入', value: 430 },
      ],
      // 业务悬浮卡片载荷（结构由业务侧定义）：标题=项目名称（后端返回）+ 键值对段落（后端返回）
      detailData: {
        projectName: '石家庄环卫一体化运营项目',
        sections: [
          { label: '基本信息', items: [{ label: '项目经理', value: '李卫国' }, { label: '年合同额', value: '5,160.00', unit: '万元' }] },
          { label: '经营数据', unit: '万元', items: [{ label: '营收', value: '430.00', delta: '+3%' }, { label: '毛利率', value: '20.00', unit: '%', delta: '+3%' }, { label: '逾期应收', value: '86.00' }, { label: '回款率', value: '15.00', unit: '%' }] },
          { label: '成本指标', items: [{ label: '人工成本占比', value: '78.08', unit: '%' }, { label: '人工占比目标', value: '80.00', unit: '%' }, { label: '机械成本占比', value: '78.08', unit: '%' }, { label: '机械占比目标', value: '80.00', unit: '%' }] },
          { label: '运营指标', items: [{ label: '作业人员', value: 110 }, { label: '车辆', value: 52, unit: '台' }, { label: '其中无人车辆', value: 21, unit: '台' }] },
        ],
      },
    },
  ],
  revenueItems: [/* 省级汇总，驱动区域着色 */],
}
```

**联动行为**：
- hover 打点 → `#detail` 插槽收到 `slotProps.detailData`（业务载荷原样透传），业务卡片解析出标题与键值对段落；hover 区域是否出悬浮框由 `interaction.detailArea` 控制（环卫运营用 `dot`，区域不出）。
- 点击打点 → 靠点上的 `provinceName` 下钻到所属省份的城市地图（无需额外配置）。
- 点击省份区域同样可下钻（名称按 `findProvinceByBaseName` 反查归属省份）；**下钻门槛由 `interaction.drillRequiresMetricValue` 控制**（默认 `true`：至少一个城市有有效指标值，0 也算有效；`false`：只要有城市列表即可）。
- `detailData` 透传链路：`BaseInfo.detailData` →（`markerGranularity='city'`）`ScatterDataItem.detailData` → formatter → `slotProps.detailData`；城市级（省份地图）打点同样透传（同名城市合并时取首个非空载荷）。

> 注意：`interaction` 整体作为 `computed` 传入时，`markerGranularity` 变化会随 `interaction` 的引用变化触发 `updateChart()`；若在组件内部原地修改 `interaction` 对象字段则不会触发刷新。

---

### 5.9 场景 I：中国地图与省份下钻地图配置不同的默认缩放层级（layout.size 按层级配置，v6 新增）

需求背景（专用车总览）：中国地图的默认缩放保持 mapConfig 默认（120%）不变，**下钻后的省份地图需要默认缩小一些**，完整落在容器内。

```ts
const options: MapChartOptions = {
  // 中国层级不传 → 保持默认 120%；省份下钻层级（city）默认缩小到 100%
  layout: {
    size: { city: 100 },
  },
};
```

**`layout.size` 三种写法对比**：

| 写法 | 生效范围 | 适用场景 |
| --- | --- | --- |
| 不传 | province 120% / city 112%（mapConfig 默认） | 默认行为 |
| 数字 / 字符串（如 `87`） | province 与 city 两层级**共用**同一覆盖 | 两层级缩放一致时（ProjectDistMap / MarketMap 旧写法，向后兼容） |
| 对象 `{ province, city }` | 按层级分别取值，未配置的层级回退 mapConfig 默认 | 两层级需要不同默认缩放时 |

> 说明：
> - `layout.center` 仍是单一覆盖，province / city 两层级共用（不区分层级）。
> - 覆盖值仅在 `resetMapViewForLevel`（初始渲染 / 下钻 / 返回上级）时生效；用户用 ± 按钮缩放后以 `currentScale` 为准，范围仍受 `layoutSizeRange`（50–200）约束。
> - 层级语义：`province` = 中国地图层级，`city` = 下钻后的省份（城市）地图层级。

---

## 六、改造回放：本批 v4 改动

v4 围绕"合计统一关闭 + 键值对数据 + 配置项精简"三类诉求落地，本次改造在 `MapChart.vue` 中具体落地：

### 6.1 文件清单（按修改顺序）

| 文件 | 改动 |
| --- | --- |
| `MapChart.vue` | `RevenueItem.label` 重命名为 `key`；移除旧 `catering/supermarket/property` 兜底逻辑；`resolveRevenueItems` 只消费 `revenueItems` |
| 同上 | `MapChartOptions.tooltip` 移除 `totalLabel / showTotal / cateringLabel / supermarketLabel / propertyLabel` |
| 同上 | `tooltipConfig` computed 同步精简（保留 unit / 颜色 / 背景等） |
| 同上 | `formatTooltipContent` 移除合计行渲染，仅渲染各 `revenueItems[i].key` 键值对 |
| 同上 | tooltip formatter 不再计算 `total`，分项全空即返回空 tooltip |
| 同上 | `BaseInfo / ProvinceData / WorldCountryData / MapDataItem / ScatterDataItem / MapCallbackData` 全部移除 `total*` / `cateringRevenue` 等固定字段 |
| 同上 | `getWorldData / getProvinceData / getCityData / aggregateProvinceRevenueItems / generateBaseScatterData` 不再回传旧字段，聚合按 `key` 分桶求和 |
| `index.vue` mock | `options.tooltip` 移除已删除字段；`operationWorldData / distributionWorldData / mapData` 全量改为 `{ key, value }` 键值对（demo 用 "007 / MINI卡 / 探索06 / 瑞虎8 / 销量"） |

### 6.2 兼容性说明

- v4 **不再向下兼容** `cateringRevenue / supermarketRevenue / propertyRevenue` 及 `totalCateringRevenue / totalSupermarketRevenue / totalPropertyRevenue` 旧字段：调用方需迁移到 `revenueItems`（键值对）。
- 合计收入行已彻底关闭；如未来需恢复合计，需在 `MapChartOptions.tooltip` 重新加入 `totalLabel/showTotal`，并在 `formatTooltipContent` 中恢复合计行渲染逻辑。
- `mapConfig.ts` 中所有默认值继续作为 `options.scatter / options.visual` 未填项的兜底。
- 世界级 `worldData` 仍可选：未传时由 `mapData` 按 `key` 聚合为单条「中国」（向下兼容路径保留）。

---

## 七、运行验证

### 7.1 类型检查 & lint

```bash
# 类型（针对本目录）
npx vue-tsc --noEmit --skipLibCheck | Select-String "homeIndex\\map"

# Lint
npx eslint --max-warnings 0 `
  "src/views/kongguJww/smartTechnology/components/homeIndex/map/MapChart.vue" `
  "src/views/kongguJww/smartTechnology/components/homeIndex/map/index.vue"

# Prettier（项目脚本）
pnpm lint:format-zk
```

> 当前改造后以上命令对本组件均为零错误。

### 7.2 功能验证清单

- [ ] 默认进入世界地图，只显示中国高亮 + 脉冲点
- [ ] hover 中国 → tooltip 显示"中国 / 007 / MINI卡 / 探索06"（销量分布）或"中国 / 销量"（经营数据），不再出现合计收入行
- [ ] 点击中国 → 进入省份地图，鼠标 hover 某省 → tooltip 显示该省 key/value 分项
- [ ] 点击"开封基地所在"的河南 → 进入河南城市地图，hover 开封 → tooltip 出现"瑞虎8"行（N 项 demo）
- [ ] 返回按钮逐级回退
- [ ] 改 `options.tooltip.unit` → tooltip 单位随之变化
- [ ] 改 `options.visual.areaColor` → 无数据省份底色随之变化
- [ ] 改 `options.scatter.color` → 普通散点颜色随之变化（世界中国强调散点保持高亮色不变）
- [ ] 改 `options.scatter.highlightColor` → 世界级中国散点颜色随之变化
- [ ] 改某基地 `scatterStyle.color` → 仅该基地散点变色

---

## 八、常见踩坑

1. **`revenueItems` 数组元素不能为空对象**：必须包含 `key` 与 `value`，否则 tooltip 渲染 `undefined`。
2. **`key`（不是 `label`）**：v4 起字段名由 `label` 改为 `key`，旧数据请迁移，否则属性不会被识别。
3. **省级 `coord` 仅做散点中心**，不影响地图区域 shape（GeoJSON 边界仍由 `world.json` / `china.json` / `citiesgeojson/*.json` 决定）。
4. **`visualColors` 数组至少 4 档**：组件内部 `ZERO_REVENUE_MARKER_VISUAL_RANK = 1` 假设至少 2 档色彩，少于此会出现 NaN。
5. **打开滚轮缩放** 与组件当前 `roam: 'move'` 冲突：本次改造未改动 `roam`，仍只允许拖拽；如需滚轮缩放请改 `MapChart.vue` 的 `geo.roam` 为 `'scale'` 或 `true`。
6. **`options.visual.visualColors` 改色后**，hover 颜色仍是 `emphasisAreaColor`，不会自动跟随 `visualColors` 深色端；如需对齐请同时调 `emphasisAreaColor`。
7. **合计收入行已关闭**：不再需要配置 `totalLabel / showTotal`；若想恢复合计，需重新在 `MapChartOptions.tooltip` 中加回并改 `formatTooltipContent`。

---

## 九、附：完整接入示例

```vue
<template>
  <div class="page">
    <MapChart :data="{ provinces: mapData, world: worldData }" :options="options" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import MapChart, {
    type MapChartOptions,
    type ProvinceData,
    type WorldCountryData,
  } from '@/views/kongguJww/smartTechnology/components/homeIndex/map/MapChart.vue';

  // 1. 全局 options：tooltip 单位 / 散点 / 底色均可调（合计行已默认关闭）
  const options: MapChartOptions = {
    tooltip: { unit: '万元' },
    visual: { visualColors: ['#c2d7ec', '#a9c9e7', '#91bde2', '#70a6d5', '#4f8fc7', '#0f4c81'] },
    scatter: { color: '#26d5ff', highlightColor: '#00efff' },
  };

  // 2. 世界级 Mock：仅补中国（键值对分项）
  const worldData = ref<WorldCountryData[]>([
    {
      name: '中国',
      unit: '万元',
      revenueItems: [
        { key: '007', value: 14040 },
        { key: 'MINI卡', value: 9420 },
        { key: '探索06', value: 5780 },
      ],
    },
  ]);

  // 3. 省份/基地 Mock：统一采用 revenueItems 键值对（不再支持旧 catering/supermarket/property 字段）
  const mapData = ref<ProvinceData[]>([
    {
      provinceName: '上海市',
      unit: '万元',
      revenueItems: [
        { key: '007', value: 980 },
        { key: 'MINI卡', value: 760 },
        { key: '探索06', value: 420 },
      ],
      baseList: [
        {
          baseName: '上海',

          unit: '万元',
          revenueItems: [
            { key: '007', value: 980 },
            { key: 'MINI卡', value: 760 },
            { key: '探索06', value: 420 },
          ],
          scatterStyle: { color: '#ff6600' },
          coord: [121.47, 31.23],
        },
      ],
    },
    // …略，详见 index.vue mock
  ]);
</script>
```

---

## 十、关联文件

| 路径 | 说明 |
| --- | --- |
| `components/homeIndex/map/MapChart.vue` | 主组件（本次改造全部配置项在此 export） |
| `components/homeIndex/map/index.vue` | mock 入口 / 父组件调用示例 |
| `components/homeIndex/map/config/mapConfig.ts` | 默认视觉/布局/波纹参数（兜底） |
| `components/homeIndex/map/utils/worldMapGeo.ts` | 世界级国名映射、主多边形中心计算 |
| `components/homeIndex/map/utils/formatDisplayNumber.ts` | 数字千分位格式化（tooltip 兜底用） |
| `@/utils/lib/echarts` | ECharts 实例封装 |
| `@/utils/map/provinceAdcode.ts` | 省份名 → 6 位 adcode 映射（点击省份下钻用） |
| `@/utils/map/cityCoordinates.ts` | 城市经纬度 / 省会 / 区域中心坐标 |
| `@/utils/map/citiesgeojson/{adcode}.json` | 各省市级 GeoJSON 资源（点击省份后动态加载） |
| `@/shared/cockpit` → `mapClick()` | 下钻埋点接口 |

---

## 十一、v5 改造回放：专用车总览新用法（chinaOnly + custom 悬浮框 + 城市级打点）

> **v7 已将本节涉及的六个交互 prop 合并为 `interaction` 对象**，下方清单保留 v5 原貌用于回溯，实际写法以第二节 v7 对照表为准。

### 11.1 文件清单

| 文件 | 改动 |
| --- | --- |
| `MapChart.vue` | v5 新增交互 Props（v7 已收敛进 `interaction`：`showMarkers → markers`、`detailArea → detailArea`、`chinaMarkerLevel → markerGranularity`、`drillRequiresMetricValue → drillRequiresMetricValue`、`drillable → drill`；`markersWhenNotDrillable / showType` 于 v7 删除）；`options` 新增 `tooltip.enterable / showProvinceLabel / layout` |
| 同上 | 新增 `markerGranularity='city'` 分支（v5 名为 `chinaMarkerLevel`）：`generateBaseScatterData` 中国层级由「一省一点」改为「按项目城市逐点」（`base.coord → getCityCoord → 省份中心` 兜底），点数据携带 `provinceName / detailData / revenueItems` |
| 同上 | **泛型业务透传**：`BaseInfo / MapDataItem / ScatterDataItem / MapCallbackData / MapDetailSlotProps` 全部增加 `detailData?: MapDetailData`（`type MapDetailData = unknown`，**不定义任何业务字段**）；`getCityData` 合并同名城市时保留首个非空 `detailData`；tooltip formatter 把 `detailData` 原样注入 `#detail` 插槽 |
| 同上 | custom 悬浮框基础设施：tooltip 气泡透明化、跟随光标定位、`transitionDuration=0`、`z-index=100`、`detailArea` 触发范围过滤 |
| 同上 | 南海诸岛附图：`showSouthChinaSea=false` 时把「南海诸岛」region 整体置透明（map 系列 data 与 geo.regions 双处注入） |
| `specialCarIndex/mockData.ts` | 每个项目（`baseList` 条目）带 `coord`；`detailData` 装载业务悬浮卡片载荷 `{ projectName（标题，后端返回）+ sections（键值对段落，后端返回） }`，并 export `SpecialCarOperationDetailData` 载荷类型 |
| `specialCarIndex/SpecialCarMap.vue` | 按 Tab 切换 `interaction` 的 `markers / markerGranularity / detailArea / drillRequiresMetricValue`；`#detail` 插槽在卡片侧解析 `slotProps.detailData`（类型守卫 + 回退兜底），标题/内容不依赖 MapChart 任何业务字段 |

### 11.2 改造 MapChart 的核心点（后续扩展照此清单）

给 MapChart 加新能力时，按数据流向依次检查 6 处，**漏一处就会出现「数据配了但不生效/不透传」**：

1. **类型定义（泛型透传原则）**：业务悬浮卡片数据**不在 MapChart 里定义业务字段**，统一走 `detailData?: MapDetailData`（`unknown`）泛型透传；业务载荷接口（如 `SpecialCarOperationDetailData`）由业务侧 export，卡片内部用类型守卫解析并定义回退兜底。只有地图自身需要的通用字段（`name / coord / provinceName / revenueItems / scatterStyle`）才进 MapChart 的接口。
2. **数据装配函数**：`getWorldData / getProvinceData / getCityData` 负责 map 系列数据；透传字段和同名合并逻辑在这里维护（如 `getCityData` 合并同名城市时坐标取首个、`detailData` 取首个非空载荷）。
3. **打点数据 `generateBaseScatterData`**：按 `currentLevel` 分世界/中国/城市三个分支（v7 起不再依赖系列名称字符串判断）；新打点粒度（如 `interaction.markerGranularity='city'`）在中国层级分支里加，注意点数据必须带 `provinceName`（点击下钻依赖它）和 `value` 第三位数值（symbolSize 计算依赖），业务载荷 `detailData` 记得同步带上。
4. **tooltip formatter 与插槽入参**：透传字段要在此显式注入 `slotProps`，否则 `#detail` 插槽拿不到；无数据的早退分支（`items` 全空返回空 tooltip）按需调整。
5. **Props 定义与 watch**：新 Prop 是否需要触发 `updateChart()`？已 watch 的有 `mapData`（引用变化）、`[worldData, interaction.drill, chinaOnly]`（重置层级）、`showSouthChinaSea`；不被 watch 的（如 `interaction.markerGranularity / options / detailType`）必须伴随被 watch 的 Prop 变化，或在文档中注明限制。
6. **geo / series 布局**：涉及视图层级（如 chinaOnly 跳过世界级、南海附图）要同时检查 `initChart` 初始层级、`handleMapClick` 分支、`backToProvince` 回退链路。

### 11.3 调用方接入要点（以 SpecialCarMap 为例）

```ts
// v7 写法：Tab 切换时 interaction 整体联动（环卫运营打点 / 装备销售不打点）
const mapInteraction = computed(() => ({
  markers: activeTabIndex.value === 0,                                        // 环卫运营开打点
  markerGranularity: activeTabIndex.value === 0 ? 'city' : 'province',        // 环卫运营按城市逐点
  detailArea: activeTabIndex.value === 0 ? 'dot' : 'all',                     // 环卫运营仅打点触发悬浮框
  drillRequiresMetricValue: activeTabIndex.value === 0,                       // 装备销售只要有城市列表即可下钻
}));
```
```vue
<MapChart :map-data="mapData" :interaction="mapInteraction" :china-only="true" detail-type="custom" />
```

```ts
// #detail 插槽：卡片内部解析 detailData（MapChart 不感知业务结构）
// 载荷类型由业务侧 export：{ projectName（标题，后端返回）, sections（键值对段落，后端返回） }
function isOperationDetailData(value: unknown): value is SpecialCarOperationDetailData {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SpecialCarOperationDetailData).projectName === 'string' &&
    Array.isArray((value as SpecialCarOperationDetailData).sections)
  );
}

function getOperationDetail(slotProps: MapDetailSlotProps): SpecialCarOperationDetailData {
  if (isOperationDetailData(slotProps.detailData)) return slotProps.detailData;
  // 数据未携带载荷时回退共用占位数据
  return {
    projectName: `${slotProps.name}·环卫运营明细`,
    sections: specialCarOperationTooltipMock.sections,
  };
}
```

### 11.4 验证清单（专用车总览）

- [ ] 环卫运营 Tab：中国地图每个项目城市出现水波纹点（石家庄/唐山/…），坐标落在城市实际位置
- [ ] hover 打点 → 悬浮框标题为项目名称（如「石家庄环卫一体化运营项目」），内容为该项目数据；hover 省份区域不出悬浮框（`interaction.detailArea='dot'`）
- [ ] 点击打点 → 下钻到所属省份城市地图，城市打点落在城市地理位置中心，hover 同样出项目悬浮框
- [ ] 切到装备销售 Tab：无打点，hover 区域/下钻行为与 v4 一致（`interaction.detailArea='all'`）
- [ ] `typecheck` / `oxlint` 零错误（存量 vite.config.ts 报错除外）

---

## 十二、v6 改造回放：layout.size 支持按层级配置默认缩放

需求背景：专用车总览要求**中国地图默认缩放保持不变（120%），下钻后的省份地图默认缩小到 100%**；且该能力作为可配置项下发，其他使用处（数字写法）行为不变。

### 12.1 文件清单

| 文件 | 改动 |
| --- | --- |
| `MapChart.vue` | `MapChartOptions.layout.size` 类型扩展为 `number \| string \| { province?, city? }`；对象形态按层级分别配置，数字/字符串形态保持原语义（province/city 共用，向后兼容） |
| 同上 | `geoLayoutOverride` 不再解析 size 数值（保留原始形态，center 逻辑不变）；新增 `resolveLayoutSizeOverride(level)` 按层级解析覆盖值：对象形态取 `size[level]`，数字/字符串形态直接用，未配置返回 null 回退 mapConfig 默认 |
| 同上 | `resetMapViewForLevel` 改用 `resolveLayoutSizeOverride(level)` 取覆盖值（原来统一取单个 size），± 缩放按钮的 `layoutSizeRange` 约束不变 |
| `specialCarIndex/SpecialCarMap.vue` | `options.layout` 传入 `size: { city: 100 }`：中国层级保持默认 120%，省份下钻层级默认 100% |

### 12.2 兼容性说明

- 数字/字符串写法（ProjectDistMap `size: 100`、MarketMap `size: 87`）**行为完全不变**，无需迁移。
- 不传 `layout.size` 时仍回退 mapConfig 默认（province 120% / city 112%）。
- `layout.center` 不支持按层级区分，仍是 province/city 共用的单一覆盖。

---

## 十三、v7 改造回放：参数收敛与死代码清理

需求背景：组件 props 增长到 13 个，其中多处互相耦合且存在「传了但永不生效」的组合（`markersWhenNotDrillable` 在 `drillable=true` 时无效、`showType` 全仓库无调用方）。本次统一收敛，并清理一批从未被读取的字段与样式。

### 13.1 Props 收敛

| 原 Prop | 现状 |
| --- | --- |
| `drillable` | → `interaction.drill` |
| `showMarkers` | → `interaction.markers`（默认跟随 `drill`） |
| `chinaMarkerLevel` | → `interaction.markerGranularity` |
| `drillRequiresMetricValue` | → `interaction.drillRequiresMetricValue` |
| `detailArea` | → `interaction.detailArea`，枚举收敛为 `'all' \| 'dot'` |
| `markersWhenNotDrillable` | **删除**（从未真正生效） |
| `showType` | **删除**（`'china'` 视角无调用方，世界地图固定整图居中） |

### 13.2 删除的无用字段 / 死代码

| 位置 | 清理内容 |
| --- | --- |
| `BaseInfo.sortOrder` | 从未被读取；`SpecialCarMap / MarketMap / ProjectDistMap` 三处赋值同步删除 |
| `MapDataItem.visualMap` | 只写不读 |
| `MapDataItem.itemStyle` / `interface MapAreaStyle` | 无任何生产者 |
| `MapChartOptions.levelNames.city` | 保留字段但从未使用 |
| `mapConfig.RUIDA_MAP_BASE_CONFIG.worldCenter/worldZoom/worldZoomRange` 的 `china` 视角副本 | 合并为单一 `WORLD_VIEW` 常量（`worldAllCenter/worldAllZoom/worldAllZoomRange` 重命名为 `worldCenter/worldZoom/worldZoomRange`） |
| `displayName = name.replace('市', '市')` | 恒等操作，替换为 `const displayName = name` |
| `.skeleton-container` 样式 | 模板已无对应节点 |
| `handleResize` + `window.addEventListener('resize')` | 与 `ResizeObserver` 重复，保留后者 |

### 13.3 通用性改进

- **`generateBaseScatterData` 改为按 `currentLevel` 分支**：原先用 `seriesName === '省份分布'` 魔法字符串判断层级，调用方一旦改系列名散点就会错乱。同步删除已无用的 `seriesName` 参数。
- **`mapData` watch 改为引用监听**（去掉 `deep: true`）：5 个调用方均整体替换数组，深层遍历大数组是纯开销。
- **导出面收敛**：`MapLevel / MapDetailData / MapDataItem / ScatterDataItem / MapCallbackData` 改为内部类型，仅导出被外部引用的 `RevenueItem / BaseInfo / ProvinceData / WorldCountryData / ScatterStyleOverride / MapDetailSlotProps / MapChartOptions / MapInteractionOptions`。

### 13.4 关于 `showMarkers` 能否被 `drillable` 替代

**不能完全替代，因此保留但改名为 `interaction.markers`**：

- 在 `drillable=false` 的场景（首页「经营数据」Tab）两者语义一致 —— 都不下钻也不打点。
- 但 `SpecialCarMap` 的「装备销售」Tab 需要 **可下钻但不打点**（点击省份直接下钻，地图上不要水波纹点），这是 `drillable` 单值无法表达的第三种组合。合并为 `interaction` 对象后，`markers` 与 `drill` 各自独立，`markers` 默认跟随 `drill`，语义就清晰了。

### 13.5 调用方迁移清单

| 文件 | 改动 |
| --- | --- |
| `homeIndex/map/index.vue` | `:drillable` → `:interaction="{ drill: isDrillable }"` |
| `miniHomeIndex/MapCenter.vue` | 同上 |
| `specialCarIndex/SpecialCarMap.vue` | 六个 prop → 单个 `mapInteraction` computed；删除 `:show-south-china-sea="false"`（等于默认值） |
| `specialCarSell/sellOverview/MarketMap.vue` | 删除 `:drillable="true"`、`:markers-when-not-drillable="true"` |
| `specialCarSell/steam/ProjectDistMap.vue` | 同上 |
| 三个 specialCar 调用方 | 删除 `BaseInfo.sortOrder` 赋值 |

### 13.6 验证清单

- [ ] 首页世界地图：经营数据 Tab 无打点、不可下钻；销量分布 Tab 有打点、可下钻 —— 行为与改造前一致
- [ ] MINI 卡总览地图：同首页
- [ ] 专用车总览：环卫运营 Tab 打点且仅打点出悬浮框；装备销售 Tab 无打点但可下钻
- [ ] 市场分析 / 项目分布地图：有打点、可下钻、南海诸岛可见
- [ ] 所有地图世界层级初始缩放与改造前一致（整图完整落在画布内）
- [ ] 容器尺寸变化（侧栏折叠、窗口缩放）地图正常跟随

---

## 十四、入参通用性优化计划（待评审，暂未实施）

本节是**方案清单**，不是已落地的改动。每条给出「现状问题 / 建议 / 影响面 / 风险」。

### 14.1 悬浮框字段完全交给插槽（收益最高）

**现状**：`revenueItems` 既是「数值来源」又是「展示结构」。组件内部用 `resolveRevenueItems` → `sumRevenueItems` 求合计驱动 visualMap，同时 tooltip 直接把 `revenueItems` 逐行渲染。

问题在于这两件事被绑死了：业务只要换一种卡片排版（分组、带箭头/同比、多列），就得把 `revenueItems` 硬塞成扁平行，或者退化成 `detailType="custom"` 写一整个插槽 —— 而 `custom` 模式下 `revenueItems` 仍由组件解析、再透传，属于中间层的冗余。

**建议**：拆成两类职责

```ts
interface BaseInfo {
  /** 只用于 visualMap 合计与颜色档位，组件不理解它的语义 */
  metricValue?: number | null;
  /** 悬浮卡片载荷，组件原样透传给 #detail，绝不解析 */
  detailData?: unknown;
}
```

- `metricValue` 只喂 `visualMap` 和 0 收入档位判断，**不再**参与 tooltip。
- `revenueItems` 从 MapChart 的类型里彻底移除，由业务在自己的 `detailData` 里携带；`detailType="view"` 保留为「通用兜底卡片」，由组件从 `detailData` 里取一个约定的 `items` 键或直接读 `metricValue`。
- 收益：MapChart 从「懂收入的组件」退化为「懂数值和坐标的组件」，`SpecialCarMap / MarketMap / ProjectDistMap` 三张业务卡片完全自由。

**风险**：v4 以来 `revenueItems` 是公开契约，5 个调用方全部要迁移；`detailType="view"` 的默认卡片需要重新约定数据形状。建议分两步：先加 `metricValue` 并让 visualMap 优先读它（`revenueItems` 仍作为回退），观察一轮后再删 `revenueItems`。

### 14.2 `mapData` / `worldData` 双入口可合并

**现状**：`mapData` 必填、`worldData` 可选，且 `worldData` 为空时组件会把 `mapData` 聚合成单条「中国」。

**建议**：合并为单一 `data` + 显式层级标记

```ts
type MapDataset = {
  world?: WorldCountryData[];
  provinces: ProvinceData[];
};
```

- 去掉「不传世界数据就自动聚合中国」这条隐式兼容路径 —— 它现在是「向下兼容」的历史包袱，5 个调用方里只有 2 个（首页 / MINI 首页）真正传 `worldData`，其余 3 个走 `chinaOnly` 根本不进世界层级。
- 收益：数据形状与 `chinaOnly` 开关一致性更好（`chinaOnly` 时根本不需要 `world`），也避免「忘传 worldData 导致世界层级显示一个假的聚合中国」这种误用。

**风险**：首页 / MINI 首页要显式传 `{ world, provinces }`；如果未来有页面依赖自动聚合，需要保留一个显式开关（`aggregateWorld: true`）而不是隐式行为。

### 14.3 `showSouthChinaSea` / `chinaOnly` 可并入 `interaction`

**现状**：`showSouthChinaSea` 与 `chinaOnly` 是「视图范围」开关，却和「交互」开关分居两个 prop。

**建议**：

```ts
interface MapChartOptions {
  /** 视图范围与静态展示，和交互无关，仍留在 options */
  scope?: {
    chinaOnly?: boolean;
    southChinaSea?: boolean;
  };
}
```

或者更彻底：把 `interaction` 扩成 `behavior`，内含 `{ drill, markers, granularity, drillRequiresMetricValue, tooltipScope, scope }`，**只保留 `mapData / data / options / detailType` 四个顶层 prop**。

**风险**：纯搬家，功能零变化，但会让 `options` 变成「什么都装」的大对象。建议只做 `scope` 归并（语义清晰），不要把交互也塞进 options。

### 14.4 `detailType` 可退化为「有没有插槽」

**现状**：`detailType="view" | "custom"` 和 `#detail` 插槽存在性是两个独立信号，组件里要判断 `props.detailType === 'custom' && slots.detail`，业务侧也可能出现「传了 custom 但忘了写插槽 → tooltip 空白」。

**建议**：删掉 `detailType`，改为

```ts
const useCustomTooltip = computed(() => Boolean(slots.detail));
```

- 有插槽就走 custom，没有就走内置 view 卡片。少一个 prop，也消灭了「custom 无插槽」这种无效组合。
- 若担心误传插槽导致样式变化，可保留一个 `forceView?: boolean` 逃生阀。

**风险**：`SpecialCarMap` 等三处传的 `detail-type="custom"` 要删掉；确认这 5 个调用方没有「写了插槽但故意想用 view」的场景（目前没有）。

### 14.5 坐标相关的隐式约定应收敛

**现状**：`coord` 的语义在三个层级各不相同 —— 世界级是国家中心、省级是省份打点中心、城市级是城市打点中心；且城市级还会 `item.name.replace('市','')` 再查 `getCityCoord`。

**建议**：统一为「打点中心」，并在文档明确「子级打点坐标优先取子级自己的 `coord`，不继承父级」；把 `normalizeCityName` 的「补 `市` / 去 `基地`」逻辑从组件里抽到 `utils/`，避免业务侧各写一份 `stripCitySuffix`（现在 `SpecialCarMap` / `MarketMap` 各有一份）。

**风险**：低。属于纯重构，但要回归「同名多基地合并」「坐标缺失回退省会」两个既有行为。

### 14.6 视觉配置可按层级覆盖

**现状**：`options.visual / scatter` 是全局单值，`layout.size` 已经支持按层级配置，但其他视觉项不支持。例如中国层级想要深底、省份下钻想要浅底，只能改组件。

**建议**：把 `layout.size` 的对象形态推广为通用能力

```ts
type PerLevel<T> = T | { world?: T; province?: T; city?: T };
visual?: { areaColor?: PerLevel<string>; ... };
scatter?: { color?: PerLevel<string>; ... };
```

**风险**：中。配置解析层要多一层 `resolveLevel(value, level)`，但实现很机械；收益是配置能力对齐，减少「为了一个颜色改组件」的情况。

### 14.7 建议实施顺序

| 顺序 | 项 | 理由 |
| --- | --- | --- |
| 1 | 14.4 删 `detailType` | 零风险，立刻减少一个无效组合 |
| 2 | 14.3 `scope` 归并 | 零功能变化，纯搬 key |
| 3 | 14.1 `metricValue` 与 `detailData` 解耦 | 收益最大，但要分两步走 |
| 4 | 14.2 数据入口合并 | 需要 2 个调用方配合 |
| 5 | 14.5 坐标约定收敛 | 纯重构 |
| 6 | 14.6 按层级视觉配置 | 有实际需求再做 |

---

## 十五、v8 改造回放：入参通用性优化（已实施）

第十四节的 6 项优化计划已全部落地。本节记录实际改动与**行为差异**。

### 15.1 顶层入参：7 → 3 + 1 插槽

```vue
<!-- v7 -->
<MapChart
  :map-data="mapData"
  :world-data="worldData"
  :options="options"
  :interaction="interaction"
  :china-only="true"
  :show-south-china-sea="true"
  detail-type="custom"
/>

<!-- v8 -->
<MapChart :data="{ provinces: mapData, world: worldData }" :options="options" :interaction="interaction">
  <template #detail="slotProps"> ... </template>
</MapChart>
```

| 旧 | 新 |
| --- | --- |
| `mapData` + `worldData` | `data: MapDataset` |
| `chinaOnly` | `options.scope.chinaOnly` |
| `showSouthChinaSea` | `options.scope.southChinaSea` |
| `detailType` | 删除；有 `#detail` 插槽即 custom |
| （无） | `options.tooltip.mode` 逃生阀 |
| `interaction` | 不变 |

### 15.2 visualMap 与展示解耦

`BaseInfo / ProvinceData / WorldCountryData` 新增 `metricValue?: number | null`。

```ts
// visualMap 颜色的取值顺序
resolveMetricValue(target):
  target.metricValue !== undefined  → 用 metricValue
  否则                              → 用 revenueItems 合计（兼容旧数据）
```

- `metricValue` 只喂 visualMap 与 0 收入档位判断。
- `revenueItems` 只用于展示（view 卡片 / `#detail` 插槽），不再暗中影响区域颜色。
- 城市级同名合并时，`metricValue` 逐基地累加。

### 15.3 视觉配置支持按层级覆盖

```ts
export type PerLevel<T> = T | { world?: T; province?: T; city?: T };
```

`options.scatter` 的 `color / shadowBlur / shadowColor / highlight* / symbolSize*` 与 `options.visual` 的 `areaColor / borderColor / borderWidth / emphasis*` 均改为 `PerLevel<T>`：

```ts
const options: MapChartOptions = {
  visual: {
    areaColor: '#d9e8f5',                                  // 三层共用（旧写法，行为不变）
    emphasisAreaColor: { province: '#0f4c81', city: '#7a2b2b' }, // 按层级
  },
};
```

由 `resolveLevel(value, fallback)` 在读取时按 `currentLevel` 解析，未配置的层级回退默认。

### 15.4 名称归一逻辑抽到 utils

新增 [mapNames.ts](../../apps/smart-technology/src/views/kongguJww/smartTechnology/components/homeIndex/map/utils/mapNames.ts)：

| 方法 | 用途 |
| --- | --- |
| `normalizeProvinceName` | 去「省 / 自治区 / 市」后缀，对齐 ECharts 中国地图区域名 |
| `normalizeCityName` | 归一为「XX市」，对齐城市地图区域名 |
| `stripCitySuffix` | 仅去后缀，用于按 `cityCoordMap` 查坐标 |

`MapChart` 内部改用前两个；`SpecialCarMap` / `MarketMap` 原先各自维护的 `stripCitySuffix` 改为从这里引入，统一口径。

### 15.5 行为差异（务必回归）

| 项 | 差异 | 影响面 |
| --- | --- | --- |
| **世界层级不再隐式聚合** | v7 中不传 `worldData` 会把 `provinces` 聚合成一个「中国」条目；v8 世界层级直接为空 | 首页 / MINI 首页原本就传 `worldData`，不受影响；`chinaOnly` 页面本来不进世界层级 |
| **view 卡片新增指标兜底** | 数据只有 `metricValue`、没有 `revenueItems` 时，view 卡片显示一行「数值: xxx」，而不是空悬浮框 | 首页 / MINI 首页若接口不下发 `revenueItems`，会从「无悬浮框」变为「显示单个数值」 |
| **无数据判定（修正）** | v7 与 v8 一致：分项全空且无 `detailData` 时**区域和打点都不弹悬浮框**。判定条件为「有效分项 / `detailData` 载荷 / （仅 view 模式）指标兜底行」三者皆无即视为无数据。曾有一版误让 custom 模式跳过该校验，导致无数据省份弹出只有标题的空卡片，已修复 | 无（与 v7 行为对齐） |
| **`#detail` 插槽成为唯一信号** | 删除 `detailType` 后，任何写了 `#detail` 的地方都自动走 custom | 五个调用方中只有三个写了插槽，行为不变 |
| **`scope` 默认值** | `chinaOnly` / `southChinaSea` 默认 `false`，与 v7 一致 | 无 |

### 15.6 调用方迁移对照

| 文件 | 改动 |
| --- | --- |
| `homeIndex/map/index.vue` | 新增 `mapDataset` computed；`:data` 替代 `:map-data` + `:world-data` |
| `miniHomeIndex/MapCenter.vue` | 同上 |
| `specialCarIndex/SpecialCarMap.vue` | `:data`；`scope` 移入 options；删除 `detail-type`；`stripCitySuffix` 改为共享；清理 `toHwBase/toEqBase` 无用 `index` 参数 |
| `specialCarSell/sellOverview/MarketMap.vue` | `:data`；`scope` 移入 options；删除 `detail-type`；共享 `stripCitySuffix`；清理无用 `index` 参数 |
| `specialCarSell/steam/ProjectDistMap.vue` | `:data`；`scope` 移入 options；删除 `detail-type`；清理无用 `index` 参数 |

### 15.7 验证清单

- [ ] 首页世界地图：经营数据 Tab 无打点不可下钻；销量分布 Tab 有打点可下钻；hover 中国有 tooltip
- [ ] MINI 卡总览地图：同上
- [ ] 专用车总览 环卫运营 Tab：中国地图按项目城市打点，仅打点出悬浮框
- [ ] 专用车总览 装备销售 Tab：无打点，区域可 hover 出悬浮框，可下钻
- [ ] 市场分析 / 项目分布地图：有打点、可下钻、南海诸岛可见
- [ ] 上述页面下钻后的省份地图打点位置与改造前一致
- [ ] 给某省份配 `metricValue` 后区域颜色变化、但悬浮卡片内容不变
- [ ] `typecheck` / `oxlint` 对本目录零错误
