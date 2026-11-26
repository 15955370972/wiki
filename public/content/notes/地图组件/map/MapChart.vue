<!--
 * @Description: 瑞达驾驶舱地图组件（视觉映射与区域高亮色对齐商社首页 SocietyWorldMapPanel）
 * @Author: chenpei <chenpei15.supplier@mychery.com>
 * @Date: 2026-05-21
 * @LastEditors: chenpei <chenpei15.supplier@mychery.com>
 * @LastEditTime: 2026-07-14 00:00:00
-->
<template>
  <div class="map-chart">
    <!-- 实际内容：数据加载完成后显示 -->
    <button
      v-if="
        (currentLevel === 'city' && interactionConfig.drill) ||
        (!scopeConfig.chinaOnly && currentLevel === 'province')
      "
      class="back-btn"
      @click="backToProvince"
    >
      <span class="back-icon">←</span>
      <span>{{ currentLevel === 'city' ? '切换回省份' : '切换回世界地图' }}</span>
    </button>
    <div ref="chartRef" class="chart-container"></div>
    <div class="zoom-controls">
      <button class="zoom-btn zoom-in" @click="handleZoomIn">+</button>
      <button class="zoom-btn zoom-out" @click="handleZoomOut">-</button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    createVNode,
    getCurrentInstance,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    render,
    useSlots,
    watch,
  } from 'vue';
  import { useDebounceFn } from '@vueuse/core';
  import type {
    DefaultLabelFormatterCallbackParams,
    EChartsOption,
    SeriesOption,
    TooltipComponentFormatterCallbackParams,
  } from 'echarts';
  import type { ECElementEvent } from '@/utils/lib/echarts';
  import echarts from '@/utils/lib/echarts';
  import {
    loadChinaGeoJson,
    loadCitiesGeoJson,
    loadProvinceCityGeoJson,
    loadWorldGeoJson,
  } from './utils/geoAssets';
  import { provinceAdcodeMap } from './utils/provinceAdcode';
  import { getCityCoord, cityCoordMap, provinceCapitalMap } from './utils/cityCoordinates';
  import { normalizeCityName, normalizeProvinceName } from './utils/mapNames';
  import { mapClick } from '@/shared/cockpit';
  import { formatDisplayNumber } from './utils/formatDisplayNumber';
  import {
    RUIDA_MAP_BASE_CONFIG,
    RUIDA_MAP_NAMES,
    RUIDA_MAP_RIPPLE_CONFIG,
    RUIDA_MAP_VISUAL_CONFIG,
  } from './config/mapConfig';
  import {
    buildWorldNameMap,
    buildWorldRegions,
    getWorldCountryName,
    getWorldFeatureCenter,
    setWorldFeatures,
  } from './utils/worldMapGeo';

  // ==================== 常量配置 ====================

  /** 当前地图级别：世界级别 / 省份级别 / 城市级别 */
  type MapLevel = 'world' | 'province' | 'city';

  /** 总收入为 0 的标识点区域映射到倒数第二档颜色 */
  const ZERO_REVENUE_MARKER_VISUAL_RANK = 1;

  /** ECharts registerMap 第二参类型。 */
  type EChartsRegisterMapInput = Parameters<typeof echarts.registerMap>[1];

  /** ECharts registerMap 接收的 GeoJSON 对象分支，排除 string / svg map input 后才能安全读取 features。 */
  type GeoJsonMapInput = Extract<EChartsRegisterMapInput, { type: 'FeatureCollection' }>;

  let areBaseMapsRegistered = false;

  /** 基础地图（世界 + 中国）注册 Promise，供多次调用复用。 */
  let baseMapsRegistration: Promise<boolean> | null = null;

  /**
   * 校验动态 JSON 是否为可注册的 GeoJSON FeatureCollection。
   * @param value Vite JSON 模块或其 default 导出的未知值。
   * @returns 仅当包含 FeatureCollection 与 features 数组时返回 true。
   */
  function isGeoJsonMap(value: unknown): value is GeoJsonMapInput {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { type?: unknown }).type === 'FeatureCollection' &&
      Array.isArray((value as { features?: unknown }).features)
    );
  }

  /**
   * 注册已校验的地图资源。
   * @param mapName ECharts 地图名称。
   * @param geoJson 未受信任的静态或动态 JSON 资源。
   * @returns 是否完成注册；失败时调用方必须保持当前地图层级。
   */
  function registerGeoJsonMap(mapName: string, geoJson: unknown): boolean {
    if (!isGeoJsonMap(geoJson)) return false;
    echarts.registerMap(mapName, geoJson);
    return true;
  }

  /**
   * 按需加载并注册世界/中国基础地图。
   * GeoJSON 外置于 public/geo，按级别 fetch；失败时抛错由调用方兜底。
   * @returns 两个基础地图是否全部注册成功。
   */
  function ensureBaseMapsRegistered(): Promise<boolean> {
    if (areBaseMapsRegistered) return Promise.resolve(true);
    if (baseMapsRegistration) return baseMapsRegistration;

    baseMapsRegistration = Promise.all([loadWorldGeoJson(), loadChinaGeoJson()])
      .then(([worldJson, chinaJson]) => {
        const worldRegistered = registerGeoJsonMap(RUIDA_MAP_NAMES.world, worldJson);
        if (worldRegistered) setWorldFeatures(worldJson);
        const chinaRegistered = registerGeoJsonMap(RUIDA_MAP_NAMES.china, chinaJson);
        areBaseMapsRegistered = worldRegistered && chinaRegistered;
        if (!areBaseMapsRegistered) {
          console.error('瑞达总览基础地图资源格式无效');
        }
        return areBaseMapsRegistered;
      })
      .catch((error) => {
        console.error('瑞达总览基础地图资源加载失败：', error);
        baseMapsRegistration = null;
        return false;
      });
    return baseMapsRegistration;
  }

  // ==================== 工具函数 ====================

  /**
   * 获取省份中心坐标
   * @description 优先从城市坐标映射表获取，其次通过省会城市匹配，最后使用默认坐标
   * @param provinceName - 省份名称（已去除"省"、"自治区"、"市"后缀）
   * @returns 返回经纬度坐标数组 [经度, 纬度]
   */
  function getProvinceCenter(provinceName: string): [number, number] {
    // 优先从城市坐标映射表获取（直辖市等直接匹配）
    if (cityCoordMap[provinceName]) {
      return cityCoordMap[provinceName];
    }

    // 尝试匹配省会名称
    const capital = provinceCapitalMap[provinceName];
    if (capital && cityCoordMap[capital]) {
      return cityCoordMap[capital];
    }

    // 返回默认坐标
    return RUIDA_MAP_BASE_CONFIG.defaultCenter;
  }

  // ==================== 响应式状态 ====================

  /** 图表容器 DOM 引用 */
  const chartRef = ref<HTMLDivElement | null>(null);

  /** ECharts 实例 */
  let chartInstance: ReturnType<typeof echarts.init> | null = null;

  /** 容器尺寸监听器 */
  let resizeObserver: ResizeObserver | undefined;
  let lastChartWidth = 0;
  let lastChartHeight = 0;

  /** 当前地图级别：世界级别 / 省份级别 / 城市级别 */
  const currentLevel = ref<MapLevel>('world');

  /** 当前选中的省份名称 */
  const currentProvince = ref<string>('');

  /** 当前缩放级别 */
  const currentScale = ref<number>(RUIDA_MAP_BASE_CONFIG.layoutSize.world);

  /** 世界地图 geo.zoom，和商社首页世界地图保持同一缩放口径 */
  const currentWorldZoom = ref<number>(RUIDA_MAP_BASE_CONFIG.worldZoom);

  // ==================== 类型定义 ====================

  /** 供图表视觉映射和前端聚合使用的数值收入。 */
  type NullableRevenue = number | null;

  /**
   * 收入分项：动态任意 N 项（键值对形式）。
   * @description 当 mapData/worldData 提供 revenueItems 时，tooltip 按本数组顺序渲染分项。
   *   value 为 null/undefined 时 tooltip 显示 "--"，0 视为有效业务值显示 "0 {unit}"。
   *   悬浮卡片数据采用通用键值对，不再使用固定的餐饮/商贸/物业字段。
   */
  export interface RevenueItem {
    /** tooltip 中显示的分项标签，如 "007" / "MINI卡" / "GMV" / "客流" 等 */
    key: string;
    /** 数值；null/undefined/NaN 视为无数据，tooltip 显示 "--"，0 视为有效业务值显示 "0 {unit}" */
    value: string | number | null;
    /** 单位覆盖；不传则用全局 options.tooltip.unit 或 ProvinceData.unit */
    unit?: string;
  }

  /**
   * 业务自定义悬浮卡片数据载荷（泛型透传）。
   * @description MapChart 不感知业务结构、不定义业务字段：业务侧把卡片标题、键值对段落等
   *   任意内容装进 detailData，组件原样透传到 #detail 插槽（slotProps.detailData），
   *   结构解析与回退全部由业务卡片内部处理
   */
  type MapDetailData = unknown;

  /**
   * 单个散点（基地/省份中心点）样式覆盖。
   * @description 当 mapData/worldData 每一项中提供 scatterStyle 时，仅作用于该点；
   *   未提供的字段回退到 options.scatter 或默认 mapConfig。
   */
  export interface ScatterStyleOverride {
    color?: string;
    shadowBlur?: number;
    shadowColor?: string;
    /** 中国/总部等强调点的颜色 */
    highlightColor?: string;
    highlightShadowBlur?: number;
    highlightShadowColor?: string;
    /** 散点 symbolSize 上下限；不传则使用全局配置 */
    symbolSizeMin?: number;
    symbolSizeMax?: number;
  }

  /**
   * 单层级取值：直接给值表示三个层级共用；对象形态按层级分别配置，未配置的层级回退默认。
   */
  export type PerLevel<T> = T | { world?: T; province?: T; city?: T };

  /**
   * 组件级全局配置：tooltip 文案、散点样式、区域底色均可通过 options 覆盖默认 mapConfig。
   * @description 留空字段保持默认；逐项可被数据条目中的 coord/scatterStyle 单点覆盖。
   *   scatter / visual 的颜色类字段支持 PerLevel 按层级分别配置（v8）。
   */
  export interface MapChartOptions {
    tooltip?: {
      /**
       * 悬浮框模式：默认按「有没有 #detail 插槽」自动判断；
       * 显式传 'view' 可在写了插槽的同时强制使用内置文案卡片。
       */
      mode?: 'view' | 'custom';
      /** 默认单位文本，默认 "万元" */
      unit?: string;
      /** view 卡片在数据未提供 revenueItems 时，指标行使用的标签，默认 "数值" */
      metricLabel?: string;
      /** 鼠标是否可移入悬浮卡片内停留；不传时 custom 模式默认 true，view 模式默认 false */
      enterable?: boolean;
      /** tooltip 文本配色 */
      labelColor?: string;
      valueColor?: string;
      titleColor?: string;
      /** tooltip 气泡背景、边框、阴影 */
      background?: string;
      borderColor?: string;
      shadow?: string;
    };
    scatter?: {
      /** 默认散点颜色（可 PerLevel） */
      color?: PerLevel<string>;
      shadowBlur?: PerLevel<number>;
      shadowColor?: PerLevel<string>;
      /** 中国/总部等强调散点颜色（可 PerLevel） */
      highlightColor?: PerLevel<string>;
      highlightShadowBlur?: PerLevel<number>;
      highlightShadowColor?: PerLevel<string>;
      /** 散点 symbolSize 上下限 */
      symbolSizeMin?: PerLevel<number>;
      symbolSizeMax?: PerLevel<number>;
      /** 水波纹动效 */
      rippleBrushType?: 'stroke' | 'fill';
      rippleScale?: number;
      ripplePeriod?: number;
    };
    visual?: {
      /** 无数据区域填充色（可 PerLevel） */
      areaColor?: PerLevel<string>;
      /** 区域边界色（可 PerLevel） */
      borderColor?: PerLevel<string>;
      borderWidth?: PerLevel<number>;
      /** hover 区域背景色（可 PerLevel） */
      emphasisAreaColor?: PerLevel<string>;
      emphasisBorderColor?: PerLevel<string>;
      emphasisBorderWidth?: PerLevel<number>;
      /** visualMap 渐变色（从浅到深），驱动 metricValue→颜色映射 */
      visualColors?: string[];
    };
    levelNames?: {
      /** 世界级埋点 mapName，默认 "世界地图" */
      world?: string;
      /** 国家级埋点 mapName，默认 "中国地图" */
      province?: string;
    };
    /** 是否显示省份常驻标签（中国层级）；不传默认显示 */
    showProvinceLabel?: boolean;
    /** 非 world 层级（province/city）的 geo 布局覆盖：默认居中、省级 120% */
    layout?: {
      /** geo.layoutCenter 覆盖，如 ['50%', '55%']；不传保持默认居中 */
      center?: [string, string];
      /**
       * geo.layoutSize 覆盖（百分比，数字按 % 处理）；不传保持默认。
       * 数字/字符串时中国层级（province）与省份下钻层级（city）共用同一覆盖；
       * 对象形态按层级分别配置，未配置的层级回退 mapConfig 默认值
       */
      size?: number | string | { province?: number | string; city?: number | string };
    };
    /** 视图范围（静态展示，与 interaction 的交互开关区分开） */
    scope?: {
      /** 仅展示中国地图：不渲染返回按钮，初始直接到中国层级 */
      chinaOnly?: boolean;
      /** 中国地图是否展示南海诸岛附图 */
      southChinaSea?: boolean;
    };
  }

  /**
   * 地图数据集：把原先并列的 mapData / worldData 合并为一个入参。
   * @description 显式声明各层级数据，不再由 provinces 隐式聚合出一个「中国」条目。
   *   chinaOnly 页面只需传 provinces。
   */
  export interface MapDataset {
    /** 世界级单国条目；不传则世界层级无数据 */
    world?: WorldCountryData[];
    /** 省份/基地明细（驱动省份级与城市级地图） */
    provinces: ProvinceData[];
  }

  /**
   * 交互开关集合：把原先六个互相耦合的独立 prop 收敛为一份配置，
   * 避免出现「传了但无效」的组合（如 markers 在 drill 关闭时的歧义）。
   */
  export interface MapInteractionOptions {
    /** 点击区域/打点是否下钻，默认 true */
    drill?: boolean;
    /** 是否渲染基地水波纹散点，默认与 drill 一致 */
    markers?: boolean;
    /** 中国层级打点粒度：province 一省一点（省会/省份中心，默认）；city 按项目城市逐点 */
    markerGranularity?: 'province' | 'city';
    /** 下钻是否要求至少一个城市有有效指标值（0 也算有效），默认 true */
    drillRequiresMetricValue?: boolean;
    /** 悬浮框触发范围：all 区域与打点均触发；dot 仅打点触发（区域不出悬浮框） */
    detailArea?: 'all' | 'dot';
  }

  /**
   * 收入展示/计算入参：接口字符串保留给 tooltip 回显，数值计算按需通过 toRevenueValue 收敛。
   * ECharts 回调值也会从 unknown 进入此边界统一校验。
   */
  type RevenueInput = unknown;

  /**
   * 基地信息接口
   * @description 表示单个基地的详细数据；悬浮卡片数据统一通过 revenueItems（键值对）传入，
   *   不再保留 cateringRevenue/supermarketRevenue/propertyRevenue 等固定字段。
   */
  export interface BaseInfo {
    /** 基地名称（如：芜湖、合肥、上海） */
    baseName: string;
    /** 业务自定义悬浮卡片数据载荷（可选，结构由业务侧定义）；原样透传到 #detail 插槽 */
    detailData?: MapDetailData;
    /** 单位 */
    unit: string;
    /**
     * 驱动 visualMap 的指标值；不传时回退 revenueItems 合计。
     * 与展示内容解耦：改它只影响区域颜色，不改变悬浮卡片。
     */
    metricValue?: number | null;
    /** 自定义散点坐标 [经度, 纬度]，不传时按 baseName 查 cityCoordMap */
    coord?: [number, number];
    /** 该基地散点的样式覆盖（仅作用于本级标记，未填项回退全局配置） */
    scatterStyle?: ScatterStyleOverride;
    /** 该基地收入分项（键值对，可变 N 项）；仅用于展示（view 卡片 / #detail 插槽） */
    revenueItems?: RevenueItem[];
  }

  /**
   * 省份数据接口
   * @description 表示省份及其下属基地的汇总数据；悬浮卡片数据统一通过 revenueItems（键值对）传入，
   *   不再保留 totalCateringRevenue/totalSupermarketRevenue/totalPropertyRevenue 等固定字段。
   */
  export interface ProvinceData {
    /** 省份名称 */
    provinceName: string;
    /** 单位 */
    unit: string;
    /** 该省份下的基地明细列表 */
    baseList: BaseInfo[];
    /** 驱动 visualMap 的指标值；不传时回退 revenueItems 合计 */
    metricValue?: number | null;
    /** 省份中心点自定义坐标，不传时按 provinceName 查 getProvinceCenter */
    coord?: [number, number];
    /** 省级汇总分项（键值对，可变 N 项）；仅用于展示 */
    revenueItems?: RevenueItem[];
  }

  /**
   * 世界级单国条目：worldData 可选 prop，传入后世界级地图直接按本数据渲染而不再聚合 mapData。
   * @description 仅补中国聚合条目时，传一项即可（name = '中国'）。
   *   悬浮卡片数据统一通过 revenueItems（键值对）传入，移除 total 系列旧字段。
   */
  export interface WorldCountryData {
    /** 国家名称，世界 GeoJSON 中可命中的中文/英文/别名均支持（命中 getWorldCountryName 归一） */
    name: string;
    /** 单位 */
    unit: string;
    /** 驱动 visualMap 的指标值；不传时回退 revenueItems 合计 */
    metricValue?: number | null;
    /** 自定义散点中心 [经度, 纬度]；不传时按 name 查 getWorldFeatureCenter */
    coord?: [number, number];
    /** 散点样式覆盖（如给"中国"配强调色） */
    scatterStyle?: ScatterStyleOverride;
    /** 收入分项（键值对，可变 N 项）；仅用于展示 */
    revenueItems?: RevenueItem[];
  }

  /**
   * 地图数据项接口
   * @description 用于 ECharts 地图系列的数据格式。
   *   悬浮卡片数据统一通过 revenueItems（键值对）渲染，不再保留固定 total* 分项字段。
   */
  interface MapDataItem {
    /** 地区名称 */
    name: string;
    /** 数值 */
    value: NullableRevenue;
    /** 展示用实际收入，避免视觉映射兜底值影响 tooltip */
    rawValue?: RevenueInput;
    /** 收入分项（键值对，可变 N 项），tooltip 据此渲染分项行 */
    revenueItems?: RevenueItem[];
    /** 业务自定义悬浮卡片数据载荷（可选，结构由业务侧定义）；原样透传到 #detail 插槽 */
    detailData?: MapDetailData;
    /** 是否有基地标识点 */
    hasMarker?: boolean;
    /** 标签配置 */
    label?: {
      color: string;
    };
    /** 散点自定义中心坐标（覆盖默认 getProvinceCenter/getCityCoord） */
    coord?: [number, number];
    /** 散点样式覆盖（仅作用于本项的对应散点） */
    scatterStyle?: ScatterStyleOverride;
  }

  /**
   * 散点数据项接口
   * @description 用于 ECharts 散点系列的数据格式。
   */
  interface ScatterDataItem {
    /** 基地名称 */
    name: string;
    /** 省份名称 */
    provinceName?: string;
    /** 业务自定义悬浮卡片数据载荷（可选，结构由业务侧定义）；原样透传到 #detail 插槽 */
    detailData?: MapDetailData;
    /** 坐标值 [经度, 纬度, 数值] */
    value: [number, number, NullableRevenue];
    /** 展示用实际收入，避免视觉映射兜底值影响 tooltip */
    rawValue?: RevenueInput;
    /** 收入分项（键值对，可变 N 项） */
    revenueItems?: RevenueItem[];
    /** 散点样式覆盖 */
    scatterStyle?: ScatterStyleOverride;
  }

  /**
   * ECharts tooltip/click 回调数据最小契约。
   * @description 只声明地图展示需要读取的字段，避免把 ECharts 的宽泛 data 直接传入业务逻辑。
   */
  interface MapCallbackData {
    name?: string;
    provinceName?: string;
    /** 业务自定义悬浮卡片数据载荷（可选），原样透传到 #detail 插槽 */
    detailData?: unknown;
    value?: unknown;
    rawValue?: unknown;
    revenueItems?: RevenueItem[];
    scatterStyle?: ScatterStyleOverride;
  }

  /**
   * detailType="custom" 时传给 #detail 插槽的数据形状。
   * @description 悬浮到打点（effectScatter）或区域（map 系列）时的归一化参数，
   *   业务组件据此渲染自定义悬浮卡片内容。
   */
  export interface MapDetailSlotProps {
    /** 展示用名称（世界级别已转中文） */
    name: string;
    /** ECharts 原始 data.name */
    rawName: string;
    /** 当前地图级别 */
    level: MapLevel;
    /** 是否命中基地打点（effectScatter）；false 表示命中的是区域（map 系列） */
    isDot: boolean;
    /** 展示用实际数值（未经视觉映射兜底） */
    rawValue?: unknown;
    /** 视觉映射参与值 */
    value?: unknown;
    /** 收入分项（键值对） */
    revenueItems: RevenueItem[];
    /** 该点/区域的散点样式覆盖 */
    scatterStyle?: ScatterStyleOverride;
    /** 所属省份名称（仅打点且可得时存在） */
    provinceName?: string;
    /** 业务自定义悬浮卡片数据载荷（打点/区域数据原样透传；结构由业务卡片内部解析） */
    detailData?: MapDetailData;
    /** 当前已下钻到的省份（中国地图层级时为空） */
    currentProvince?: string;
  }

  /** ECharts label formatter 只依赖区域名称。 */
  interface MapLabelFormatterParams {
    name?: string;
  }

  type TooltipSingleFormatterParam = DefaultLabelFormatterCallbackParams;

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /**
   * 校验 ECharts 回调 data 是否为地图业务对象。
   * @param data ECharts 传入的未知 data 字段。
   * @returns 仅对象形态允许进入 tooltip/click 业务分支。
   */
  function isMapCallbackData(data: unknown): data is MapCallbackData {
    return isRecord(data);
  }

  /**
   * 统一取得 tooltip 的单项参数。
   * @param params ECharts 顶层 tooltip 参数，item 触发通常为对象，axis 触发可能为数组。
   * @returns 可读取 name/data 的单项参数；无有效项时返回 null。
   */
  function getSingleTooltipParam(
    params: TooltipComponentFormatterCallbackParams,
  ): TooltipSingleFormatterParam | null {
    const singleParam = Array.isArray(params) ? params[0] : params;
    return singleParam ?? null;
  }

  function formatWorldCountryLabel(params: MapLabelFormatterParams): string {
    return getWorldCountryName(params.name || '');
  }

  // ==================== Props 定义 ====================

  /**
   * 组件 props（v8：4 个顶层入参）：
   *  - data：各层级数据（world 可选 / provinces 必传）
   *  - options：全局配置（tooltip 文案、散点样式、区域底色、视图范围 scope、布局）
   *  - interaction：交互开关（下钻 / 打点 / 打点粒度 / 悬浮框触发范围）
   *  - #detail 插槽：存在即走自定义悬浮卡片（无需再传 detailType）
   */
  const props = withDefaults(
    defineProps<{
      data: MapDataset;
      options?: MapChartOptions;
      /**
       * 交互开关（drill / markers / markerGranularity / drillRequiresMetricValue / detailArea）：
       *  - drill：点击区域/打点是否下钻，默认 true
       *  - markers：是否渲染基地水波纹散点，默认与 drill 一致（下钻关闭时仅渲染区域）
       *  - markerGranularity：中国层级打点粒度，province 一省一点（省会），city 按项目城市逐点
       *  - drillRequiresMetricValue：下钻是否要求至少一个城市有有效指标值，默认 true
       *  - detailArea：悬浮框触发范围，all 区域+打点 / dot 仅打点
       */
      interaction?: MapInteractionOptions;
    }>(),
    {
      data: () => ({ provinces: [] }),
      options: () => ({}),
      interaction: () => ({}),
    },
  );

  /** 视图范围：chinaOnly / 南海诸岛附图，收敛在 options.scope */
  const scopeConfig = computed(() => ({
    chinaOnly: props.options?.scope?.chinaOnly ?? false,
    southChinaSea: props.options?.scope?.southChinaSea ?? false,
  }));

  /**
   * 是否走 #detail 自定义悬浮卡片。
   * @description 有 detail 插槽即自定义，否则走内置 view 文案卡片；
   *   `options.tooltip.mode: 'view'` 可强制走内置卡片（同时写了插槽的场景）。
   */
  const useCustomTooltip = computed(
    () => Boolean(slots.detail) && props.options?.tooltip?.mode !== 'view',
  );

  /** interaction 解析后配置：未配置项回退默认值，markers 默认跟随 drill */
  const interactionConfig = computed(() => {
    const o = props.interaction ?? {};
    const drill = o.drill ?? true;
    return {
      drill,
      markers: o.markers ?? drill,
      markerGranularity: o.markerGranularity ?? 'province',
      drillRequiresMetricValue: o.drillRequiresMetricValue ?? true,
      detailArea: o.detailArea ?? 'all',
    };
  });

  const slots = useSlots();
  const appContext = getCurrentInstance()?.appContext;
  let detailContainer: HTMLDivElement | null = null;

  /**
   * 世界地图视角配置（中心 / 默认缩放 / 缩放区间）。
   * @description center 为 undefined 时由 ECharts 按地图 bbox 自动居中，zoom = worldZoom 让整张世界地图完整显示。
   */
  const WORLD_VIEW = {
    center: RUIDA_MAP_BASE_CONFIG.worldCenter,
    zoom: RUIDA_MAP_BASE_CONFIG.worldZoom,
    zoomRange: RUIDA_MAP_BASE_CONFIG.worldZoomRange,
  } as const;

  // ==================== 配置解析（options 覆盖 mapConfig 默认） ====================

  /**
   * 取当前层级生效的配置值。
   * @description 值不是对象时三层共用；对象形态按 currentLevel 取值，
   *   该层级未配置则回退 fallback。
   */
  function resolveLevel<T>(value: PerLevel<T> | undefined, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value === 'object') {
      const levelValue = (value as Record<string, T>)[currentLevel.value];
      return levelValue ?? fallback;
    }
    return value as T;
  }

  /** tooltip 解析后配置：避免在每次回调里重复读取 */
  const tooltipConfig = computed(() => {
    const o = props.options?.tooltip ?? {};
    return {
      unit: o.unit ?? '万元',
      metricLabel: o.metricLabel ?? '数值',
      // 鼠标是否可移入悬浮卡片停留：custom 模式默认可移入，可按业务通过 options.tooltip.enterable 关闭
      enterable: o.enterable ?? useCustomTooltip.value,
      labelColor: o.labelColor ?? '#b7d7ea',
      valueColor: o.valueColor ?? '#3eebff',
      titleColor: o.titleColor ?? '#fff',
      background: o.background ?? RUIDA_MAP_VISUAL_CONFIG.tooltipBackground,
      borderColor: o.borderColor ?? RUIDA_MAP_VISUAL_CONFIG.tooltipBorderColor,
      shadow: o.shadow ?? RUIDA_MAP_VISUAL_CONFIG.tooltipShadow,
    };
  });

  /** 散点全局默认样式：可被单点 scatterStyle 覆盖；颜色/尺寸支持按层级配置 */
  const scatterConfig = computed(() => {
    const o = props.options?.scatter ?? {};
    return {
      color: resolveLevel(o.color, RUIDA_MAP_VISUAL_CONFIG.pulseColor),
      shadowBlur: resolveLevel(o.shadowBlur, RUIDA_MAP_VISUAL_CONFIG.pulseShadowBlur),
      shadowColor: resolveLevel(o.shadowColor, RUIDA_MAP_VISUAL_CONFIG.pulseShadowColor),
      highlightColor: resolveLevel(o.highlightColor, RUIDA_MAP_VISUAL_CONFIG.highlightPulseColor),
      highlightShadowBlur: resolveLevel(
        o.highlightShadowBlur,
        RUIDA_MAP_VISUAL_CONFIG.highlightPulseShadowBlur,
      ),
      highlightShadowColor: resolveLevel(
        o.highlightShadowColor,
        RUIDA_MAP_VISUAL_CONFIG.highlightPulseShadowColor,
      ),
      symbolSizeMin: resolveLevel(o.symbolSizeMin, 10),
      symbolSizeMax: resolveLevel(o.symbolSizeMax, 12),
      rippleBrushType: o.rippleBrushType ?? RUIDA_MAP_RIPPLE_CONFIG.brushType,
      rippleScale: o.rippleScale ?? RUIDA_MAP_RIPPLE_CONFIG.scale,
      ripplePeriod: o.ripplePeriod ?? RUIDA_MAP_RIPPLE_CONFIG.period,
    };
  });

  /** 区域底色与边界色配置；颜色/宽度支持按层级配置 */
  const visualConfig = computed(() => {
    const o = props.options?.visual ?? {};
    return {
      areaColor: resolveLevel(o.areaColor, RUIDA_MAP_VISUAL_CONFIG.areaColor),
      borderColor: resolveLevel(o.borderColor, RUIDA_MAP_VISUAL_CONFIG.borderColor),
      borderWidth: resolveLevel(o.borderWidth, RUIDA_MAP_VISUAL_CONFIG.borderWidth),
      emphasisAreaColor: resolveLevel(
        o.emphasisAreaColor,
        RUIDA_MAP_VISUAL_CONFIG.emphasisAreaColor,
      ),
      emphasisBorderColor: resolveLevel(
        o.emphasisBorderColor,
        RUIDA_MAP_VISUAL_CONFIG.emphasisBorderColor,
      ),
      emphasisBorderWidth: resolveLevel(
        o.emphasisBorderWidth,
        RUIDA_MAP_VISUAL_CONFIG.emphasisBorderWidth,
      ),
      visualColors: o.visualColors ?? RUIDA_MAP_VISUAL_CONFIG.visualColors,
    };
  });

  /** 埋点 mapName 配置 */
  const levelNamesConfig = computed(() => {
    const o = props.options?.levelNames ?? {};
    return {
      world: o.world ?? '世界地图',
      province: o.province ?? '中国地图',
    };
  });

  /** 中国层级省份常驻标签显隐配置：可通过 options.showProvinceLabel 关闭 */
  const provinceLabelVisible = computed(() => props.options?.showProvinceLabel ?? true);

  /** 非 world 层级 geo 布局覆盖（options.layout）：center / size，未配置项回退默认 */
  const geoLayoutOverride = computed(() => {
    const o = props.options?.layout;
    if (!o) return null;
    return {
      center: o.center,
      size: o.size ?? null,
    };
  });

  /**
   * 解析指定层级的 layout.size 覆盖（百分比数值）。
   * @description 数字/字符串时中国层级与省份下钻层级共用同一覆盖（向后兼容旧配置）；
   *   对象形态 { province, city } 按层级分别取值，未配置的层级回退 null（沿用 mapConfig 默认）
   */
  function resolveLayoutSizeOverride(level: 'province' | 'city'): number | null {
    const size = geoLayoutOverride.value?.size;
    if (size == null) return null;
    const levelSize =
      typeof size === 'object' ? (size[level] ?? null) : (size as number | string);
    if (levelSize == null) return null;
    const parsed = typeof levelSize === 'number' ? levelSize : Number.parseFloat(String(levelSize));
    return Number.isFinite(parsed) ? parsed : null;
  }

  // ==================== 指标与分项解析工具 ====================

  /**
   * 推导业务的收入分项数组（键值对）。
   * @description 仅消费 revenueItems；为空时返回空数组。
   *   分项只用于展示（view 卡片 / #detail 插槽），不再参与 visualMap 计算。
   */
  function resolveRevenueItems(
    target: { revenueItems?: RevenueItem[] },
    defaultUnit: string,
  ): RevenueItem[] {
    if (!target.revenueItems || target.revenueItems.length === 0) return [];
    return target.revenueItems.map((item) => ({
      key: item.key,
      value: toRevenueValue(item.value),
      unit: item.unit ?? defaultUnit,
    }));
  }

  /** 汇总分项数组为合计数值，全部为空时返回 null（保持无数据语义） */
  function sumRevenueItems(items: RevenueInput[] | RevenueItem[]): NullableRevenue {
    return (items as Array<RevenueItem | RevenueInput>).reduce<NullableRevenue>((sum, entry) => {
      const value = (entry as RevenueItem).value ?? (entry as RevenueInput);
      return addRevenueValue(sum, value);
    }, null);
  }

  /**
   * 取驱动 visualMap 的指标值。
   * @description 优先 `metricValue`（业务显式声明的可视化指标）；未提供时回退到 revenueItems 合计，
   *   保证既有调用方行为不变。visualMap 只读这个值，与 tooltip 展示内容彻底解耦。
   */
  function resolveMetricValue(target: {
    metricValue?: number | null;
    revenueItems?: RevenueItem[];
  }): NullableRevenue {
    if (target.metricValue !== undefined) return toRevenueValue(target.metricValue);
    return sumRevenueItems(resolveRevenueItems(target, tooltipConfig.value.unit));
  }

  // ==================== 地图资源加载 ====================
  // 省份城市 GeoJSON 已外置到 public/geo/citiesgeojson，按需 fetch（见 utils/geoAssets.ts），
  // 单省文件缺失时回退全国汇总 cities.json。

  // ==================== 数据处理函数 ====================

  /**
   * 标准化收入值
   * @description null/undefined/NaN 保持为空值语义，tooltip 统一显示 --。
   */
  function toRevenueValue(value: RevenueInput): NullableRevenue {
    if (value == null) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  /**
   * 判断收入值是否可参与视觉映射与最大值计算
   */
  function isValidRevenueValue(value: RevenueInput): value is number {
    return value != null && Number.isFinite(value);
  }

  /**
   * 聚合收入值
   * @description 两边都为空时继续保留 null，避免无数据被误展示为 0。
   */
  function addRevenueValue(currentValue: RevenueInput, nextValue: RevenueInput): NullableRevenue {
    const currentRevenue = toRevenueValue(currentValue);
    const nextRevenue = toRevenueValue(nextValue);
    if (currentRevenue == null && nextRevenue == null) return null;
    return (currentRevenue || 0) + (nextRevenue || 0);
  }

  /**
   * 格式化收入展示
   * @description null 显示 --，0 是有效业务值，必须显示 0 {unit}。
   *   {unit} 由分项自身 unit 或 options.tooltip.unit 传入；旧用法保留 "万元" 作为默认。
   */
  function formatRevenue(value: RevenueInput, unit = '万元'): string {
    const revenue = toRevenueValue(value);
    return revenue == null ? '--' : `${formatDisplayNumber(value as string | number)} ${unit}`;
  }

  /**
   * 生成地图 tooltip 内容（支持任意 N 项键值对分项，关闭合计行）。
   * @param displayName tooltip 顶部标题（区域名称）
   * @param items 已解析后的收入分项；为空时调用方应提前返回空 tooltip
   * @description 「经营数据 / 销量分布」两种视图均关闭合计收入行，
   *   tooltip 仅渲染各分项键值对，不再展示 totalLabel/showTotal 相关合计行。
   */
  function formatTooltipContent(displayName: string, items: RevenueItem[]): string {
    const cfg = tooltipConfig.value;
    const rowHtml = (label: string, value: RevenueInput, unit: string): string => `
            <div>
              <span style="color: ${cfg.labelColor};">${label}:</span>
              <span style="float: right; color: ${cfg.valueColor}; font-family: var(--font-family-medium), sans-serif;">${formatRevenue(value, unit)}</span>
            </div>`;

    const itemRows = items.map((item) => rowHtml(item.key, item.value, item.unit ?? cfg.unit));

    return `
            <div style="font-family: var(--font-family-medium), sans-serif; margin-bottom: 8px; font-size: 14px; color: ${cfg.titleColor};">${displayName}</div>
            <div style="display: flex; flex-direction: column; gap: 4px; min-width: 158px; line-height: 1.7;">
              ${itemRows.join('\n            ')}
            </div>
          `;
  }

  /**
   * 获取 0 收入但有标识点区域的视觉映射值
   * @description 该值仅参与颜色映射，tooltip 仍展示 rawValue。
   */
  function getZeroRevenueMarkerVisualValue(maxRevenue: number): number {
    const visualStepCount = Math.max(RUIDA_MAP_VISUAL_CONFIG.visualColors.length - 1, 1);
    const baseMax = Math.max(maxRevenue, 1);
    return baseMax * (ZERO_REVENUE_MARKER_VISUAL_RANK / visualStepCount);
  }

  /**
   * 获取世界地图数据
   * @description 直接取 data.world（键值对形式），不做任何隐式聚合；
   *   未提供 world 时世界层级为空数据（chinaOnly 页面本来就不进世界层级）。
   *   tooltip / 散点均通过 revenueItems + 各项 coord/scatterStyle 透传到图表。
   * @returns 返回世界地图数据数组
   */
  function getWorldData(): MapDataItem[] {
    return (props.data.world ?? []).map((country) => {
      const items = resolveRevenueItems(country, country.unit);
      const total = sumRevenueItems(items);
      return {
        name: country.name,
        value: total,
        rawValue: total,
        revenueItems: items,
        coord: country.coord,
        scatterStyle: country.scatterStyle,
      };
    });
  }

  /**
   * 获取省份数据
   * @description 将 props 中的省份数据转换为 ECharts 地图所需的格式。
   *   采用 province.revenueItems（键值对）计算合计，驱动视觉映射；coord/scatterStyle 透传到散点逻辑。
   * @returns 返回省份名称和对应合计收入的数组
   */
  function getProvinceData(): MapDataItem[] {
    const provinceDataItems = props.data.provinces.map((province) => {
      const items = resolveRevenueItems(province, province.unit);
      return { province, items, total: resolveMetricValue(province) };
    });
    const provinceRevenueValues = provinceDataItems
      .map((entry) => entry.total)
      .filter(isValidRevenueValue);
    const maxRevenue = Math.max(...provinceRevenueValues, 0);
    const zeroRevenueVisualValue = getZeroRevenueMarkerVisualValue(maxRevenue);

    return provinceDataItems.map(({ province, items, total }) => {
      const name = normalizeProvinceName(province.provinceName);
      const hasBaseMarker = province.baseList && province.baseList.length > 0;
      const value = hasBaseMarker && total === 0 ? zeroRevenueVisualValue : total;
      return {
        name,
        rawValue: total,
        value,
        revenueItems: items,
        hasMarker: hasBaseMarker,
        coord: province.coord,
        // 有数据时设置白色字体
        label: isValidRevenueValue(value) && value > 0 ? { color: '#fff' } : undefined,
      };
    });
  }

  /**
   * 获取城市数据
   * @description 获取指定省份下所有城市（基地）的数据，支持多基地同名汇总。
   *   优先 base.revenueItems；为空时回退 catering+supermarket+property 三项旧字段。
   *   base.coord 透传，供散点逻辑覆盖默认 cityCoordinates。
   * @param provinceName - 省份名称（已标准化）
   * @returns 返回该省份下所有城市（基地）的名称和合计收入数据
   */
  function getCityData(provinceName: string): MapDataItem[] {
    const province = props.data.provinces.find(
      (p) => normalizeProvinceName(p.provinceName) === provinceName,
    );

    if (!province) return [];

    const cityDataMap = new Map<
      string,
      {
        items: RevenueItem[];
        total: NullableRevenue;
        coord?: [number, number];
        detailData?: MapDetailData;
      }
    >();

    province.baseList.forEach((city) => {
      const name = normalizeCityName(city.baseName);
      const prev =
        cityDataMap.get(name) ??
        { items: [], total: null, coord: city.coord, detailData: city.detailData };
      // 同名城市多基地时，首个带自定义坐标的基地坐标生效
      if (!prev.coord && city.coord) prev.coord = city.coord;
      // 业务悬浮卡片数据取首个非空值（结构由业务侧定义，组件不感知）
      if (prev.detailData == null && city.detailData != null) prev.detailData = city.detailData;
      // 先按 base 单独解析分项，再做累加（每累加一项更新对应 key 的 value）
      const currentItems = resolveRevenueItems(city, city.unit ?? province.unit);

      const mergedItems = new Map<string, RevenueItem>();
      [...prev.items, ...currentItems].forEach((item) => {
        const p = mergedItems.get(item.key);
        mergedItems.set(item.key, {
          key: item.key,
          value: addRevenueValue(p?.value ?? null, item.value),
          unit: item.unit ?? province.unit,
        });
      });

      // 指标值优先取 base.metricValue，同名城市多基地时累加；未提供则回退分项合计
      const cityMetric =
        city.metricValue !== undefined
          ? addRevenueValue(prev.total, city.metricValue)
          : sumRevenueItems(Array.from(mergedItems.values()));
      cityDataMap.set(name, {
        items: Array.from(mergedItems.values()),
        total: cityMetric,
        coord: prev.coord,
        detailData: prev.detailData,
      });
    });

    // 重新计算 max（城市维度），保证 0 收入标识点的 visualMap 映射档位合理
    const allValues = Array.from(cityDataMap.values())
      .map((d) => d.total)
      .filter(isValidRevenueValue);
    const maxRevenue = Math.max(...allValues, 0);
    const zeroRevenueVisualValue = getZeroRevenueMarkerVisualValue(maxRevenue);

    return Array.from(cityDataMap.entries()).map(([name, cityData]) => {
      const value = cityData.total === 0 ? zeroRevenueVisualValue : cityData.total;
      const items = cityData.items;
      return {
        name,
        rawValue: cityData.total,
        value,
        revenueItems: items,
        detailData: cityData.detailData,
        hasMarker: true,
        // 同名城市多基地时取首个带自定义坐标的基地坐标，作为该城市打点位置
        coord: cityData.coord,
        // 有数据时设置白色字体
        label: isValidRevenueValue(value) && value > 0 ? { color: '#fff' } : undefined,
      };
    });
  }

  /**
   * 根据基地名称查找所属省份
   * @description 用于点击基地标识时确定所属省份
   * @param baseName - 基地名称
   * @returns 省份名称，未找到则返回 undefined
   */
  function findProvinceByBaseName(baseName: string): string | undefined {
    for (const province of props.data.provinces) {
      const isMatch = province.baseList.some(
        (base) => base.baseName === baseName || `${base.baseName}市` === baseName,
      );
      if (isMatch) {
        return normalizeProvinceName(province.provinceName);
      }
    }
    return undefined;
  }

  /**
   * 从 cities.json 加载省份 GeoJSON 数据
   * @description 当单独的省份文件不存在时，从汇总文件中提取数据
   * @param adcode - 省份行政区划代码
   * @returns GeoJSON 数据对象，加载失败返回 null
   */
  async function loadProvinceGeoJsonFromCitiesJson(
    adcode: string,
  ): Promise<GeoJsonMapInput | null> {
    try {
      const citiesGeoJson = await loadCitiesGeoJson();
      if (!isGeoJsonMap(citiesGeoJson)) {
        return null;
      }

      // 筛选出属于该省份的所有城市
      const provinceFeatures = citiesGeoJson.features.filter((feature) => {
        const properties = feature.properties as { parent?: { adcode?: number } } | undefined;
        return properties?.parent?.adcode === Number(adcode);
      });

      if (provinceFeatures.length === 0) return null;

      const provinceGeoJson = {
        type: 'FeatureCollection',
        features: provinceFeatures,
      };
      return isGeoJsonMap(provinceGeoJson) ? provinceGeoJson : null;
    } catch (error) {
      console.error('加载 cities.json 失败：', error);
      return null;
    }
  }

  /**
   * 生成图表配置选项
   * @description 根据地图名称、数据和系列名称生成完整的 ECharts 配置
   * @param mapName - 地图名称（如：china、安徽省）
   * @param data - 地图数据数组
   * @param seriesName - 系列名称（省份分布 / 基地分布）
   * @returns ECharts 配置对象
   */
  function getChartOption(mapName: string, data: MapDataItem[], seriesName: string): EChartsOption {
    // 计算最大值用于视觉映射
    const maxValue = Math.max(...data.map((item) => item.value).filter(isValidRevenueValue), 1);
    const isWorldMap = currentLevel.value === 'world';

    // 中国地图的南海诸岛附图（ECharts fix/nanhai 仅对注册名 china 注入该区域）；
    // showSouthChinaSea=false 时置为透明隐藏，保持原视觉不变。
    const southChinaSeaRegions =
      mapName === RUIDA_MAP_NAMES.china
        ? [
            {
              name: '南海诸岛',
              ...(!scopeConfig.value.southChinaSea
                ? {
                    itemStyle: {
                      areaColor: 'transparent',
                      borderColor: 'transparent',
                      borderWidth: 0,
                      opacity: 0,
                    },
                  }
                : {}),
              label: { show: false },
              emphasis: { disabled: true, label: { show: false } },
              select: { disabled: true, label: { show: false } },
              tooltip: { show: false },
            },
          ]
        : [];

    // ECharts series data 不接受 null；rawValue 继续保留 null 给 tooltip 展示 --。
    // 地图系列 value 使用标量，仅 visualMap.seriesIndex=0 的区域映射生效；
    // 基地散点(effectScatter)使用固定脉冲色（pulseColor/highlightPulseColor），不随视觉映射改变，与世界级一致。
    const mapSeriesData = data.map(
      (item) =>
        ({
          ...(item as object),
          value: item.value ?? undefined,
        }) as { name: string; value?: number | number[] } & Record<string, unknown>,
    );
    mapSeriesData.push(...southChinaSeaRegions);

    return {
      // ==================== 提示框配置 ====================
      tooltip: {
        trigger: 'item',
        // custom 模式下提示框内容是可交互业务组件（含「更多」等按钮），
        // enterable 让鼠标可以移入提示框内部，不被判定为移出而立即隐藏；
        // 业务可通过 options.tooltip.enterable: false 关闭「鼠标可停留」能力
        enterable: tooltipConfig.value.enterable,
        // enterable 悬浮卡片必须紧跟鼠标：position 回调把卡片锚定在光标旁但始终不遮挡光标，
        // 地图上的 mousemove 持续触发，悬浮框跟手、跨区域切换丝滑；
        // 同时让卡片边沿覆盖光标所在的水平/纵向线（越出 OVERLAP），从省份/城市
        // 沿直线平移 GAP 像素即可滑入卡片，无需对准角点，也不会因空隙提前隐藏；
        // transitionDuration 归零避免卡片跟手动画造成位置滞后
        transitionDuration: useCustomTooltip.value ? 0 : undefined,
        position:
          useCustomTooltip.value
            ? (point, _params, _dom, _rect, size) => {
                const GAP = 8;
                const OVERLAP = 10;
                const [mouseX, mouseY] = point;
                const [contentW, contentH] = size.contentSize;
                const [viewW, viewH] = size.viewSize;

                // 水平方向：默认贴光标右侧，右侧放不下翻到左侧（保持 GAP 间距）
                const flipX = mouseX + GAP + contentW > viewW;
                const baseX = Math.max(0, flipX ? mouseX - GAP - contentW : mouseX + GAP);

                // 垂直方向：默认顶边高出光标水平线 OVERLAP，沿水平方向平移即可滑入；
                // 下方放不下时整卡移到光标上方，并让卡片横向覆盖光标纵线，向上平移即可滑入
                const fitBelow = mouseY - OVERLAP + contentH <= viewH;
                if (fitBelow) {
                  return [baseX, Math.max(0, mouseY - OVERLAP)];
                }
                const flipTopX =
                  mouseX - OVERLAP + contentW > viewW
                    ? mouseX - contentW + OVERLAP
                    : mouseX - OVERLAP;
                return [Math.max(0, flipTopX), Math.max(0, mouseY - GAP - contentH)];
              }
            : undefined,
        backgroundColor:
          useCustomTooltip.value ? 'transparent' : tooltipConfig.value.background,
        borderColor:
          useCustomTooltip.value ? 'transparent' : tooltipConfig.value.borderColor,
        borderWidth: useCustomTooltip.value ? 0 : 1,
        padding: useCustomTooltip.value ? 0 : [10, 12],
        // 限制 tooltip 层级：ECharts 默认 z-index 极高，会盖住页面上的时间筛选下拉面板；
        // 这里压到卡片内浮层之上、全局下拉（日期面板 3000）之下
        extraCssText:
          useCustomTooltip.value
            ? `${tooltipConfig.value.enterable ? 'pointer-events: auto' : 'pointer-events: none'}; z-index: 100;`
            : `border-radius: 6px; box-shadow: ${tooltipConfig.value.shadow}; z-index: 100;`,
        textStyle: {
          color: '#fff',
          fontFamily: 'MiSans-Regular, var(--font-family-regular), Microsoft YaHei, sans-serif',
          fontSize: 13,
        },
        formatter: (params: TooltipComponentFormatterCallbackParams) => {
          const singleParam = getSingleTooltipParam(params);
          const itemData =
            singleParam && isMapCallbackData(singleParam.data) ? singleParam.data : null;
          // 接口中没有当前省份/基地/国家的数据时不显示提示框
          if (!itemData) {
            return '';
          }

          // 打点（基地水波纹）vs 区域（省份/国家 map 系列），用于 detailArea 过滤与插槽参数
          const isDot = singleParam?.seriesType === 'effectScatter';
          if (interactionConfig.value.detailArea === 'dot' && !isDot) return '';

          const rawName = itemData.name || singleParam?.name || '';
          let name = rawName;

          // 世界地图级别时，将国家英文名转换为中文名，口径与商社总览一致
          if (currentLevel.value === 'world') {
            name = getWorldCountryName(name);
          }

          const displayName = name;

          // 展示分项：统一取 revenueItems（键值对）
          const items: RevenueItem[] = Array.isArray(
            (itemData as { revenueItems?: RevenueItem[] }).revenueItems,
          )
            ? ((itemData as { revenueItems?: RevenueItem[] }).revenueItems as RevenueItem[])
            : resolveRevenueItems(
                itemData as Parameters<typeof resolveRevenueItems>[0],
                tooltipConfig.value.unit,
              );
          // 可展示内容：有效分项 / 业务载荷 / （view 模式）只配了指标值的兜底行
          const hasDisplayItems = items.some((item) => isValidRevenueValue(item.value));
          const hasDetailPayload = itemData.detailData != null;
          // 兜底仅在「完全没配 revenueItems」时生效；配了但值全空仍按无数据处理
          const useMetricFallback =
            !useCustomTooltip.value &&
            items.length === 0 &&
            isValidRevenueValue(toRevenueValue(itemData.rawValue));

          // 无任何可展示内容 → 视为无数据，区域与打点都不弹悬浮框
          if (!hasDisplayItems && !hasDetailPayload && !useMetricFallback) {
            return '';
          }

          if (useCustomTooltip.value) {
            const slotProps: MapDetailSlotProps = {
              name: displayName,
              rawName,
              level: currentLevel.value,
              isDot,
              rawValue: itemData.rawValue,
              value: itemData.value,
              revenueItems: items,
              scatterStyle: itemData.scatterStyle,
              provinceName: itemData.provinceName,
              detailData: itemData.detailData,
              currentProvince: currentProvince.value,
            };

            const vnodes = slots.detail!(slotProps);
            vnodes.forEach((vnode) => {
              if (appContext) vnode.appContext = appContext;
            });

            if (!detailContainer) {
              detailContainer = document.createElement('div');
            }
            render(createVNode('div', {}, vnodes), detailContainer);
            return detailContainer;
          }

          // view 卡片：没有分项时回退展示指标值，避免只配 metricValue 的调用方出现空悬浮框
          const viewItems =
            items.length > 0
              ? items
              : [
                  {
                    key: tooltipConfig.value.metricLabel ?? '数值',
                    value: itemData.rawValue ?? itemData.value,
                    unit: tooltipConfig.value.unit,
                  } as RevenueItem,
                ];
          return formatTooltipContent(displayName, viewItems);
        },
      },

      // ==================== 视觉映射配置（隐藏筛选条） ====================
      // 只作用于地图区域系列（seriesIndex=0），合计收入值越高颜色越深。
      // 基地散点(effectScatter)系列保持世界级一致的脉冲固定色，不跟随视觉映射渐变。
      visualMap: {
        show: false,
        seriesIndex: 0,
        min: 0,
        max: maxValue,
        inRange: {
          color: [...visualConfig.value.visualColors],
        },
      },

      // ==================== 地理坐标系配置 ====================
      geo: {
        map: mapName,
        // 世界级别给 geo 注入属性名 → 中文翻译，覆盖 normal/emphasis/select 三态 label
        nameMap: isWorldMap ? buildWorldNameMap() : undefined,
        roam: 'move', // 世界、省份、城市层级统一支持拖拽移动，不开放滚轮缩放。
        layoutCenter: isWorldMap
          ? ['50%', '50%']
          : (geoLayoutOverride.value?.center ?? ['50%', '50%']),
        layoutSize: `${currentScale.value}%`,
        center: isWorldMap ? WORLD_VIEW.center : undefined,
        zoom: isWorldMap ? currentWorldZoom.value : undefined,
        label: {
          show: currentLevel.value !== 'world' && provinceLabelVisible.value, // 世界地图不显示常驻标签；中国层级可通过 options.showProvinceLabel 关闭；hover 时仍按 nameMap 显示中文名
          color: '#004567', // 默认字体颜色
          fontSize: 12,
          // 世界级别显式传 formatter，和 nameMap 双保险一致翻译
          formatter: isWorldMap ? formatWorldCountryLabel : undefined,
        },
        // 为有数据的区域设置白色字体；世界级别追加全要素翻译 formatter，作为 nameMap 的确定性兜底
        regions: isWorldMap
          ? buildWorldRegions().map((region) => ({
              name: region.name,
              label: {
                ...region.label,
                color:
                  data.some(
                    (item: MapDataItem) =>
                      item.name === region.name &&
                      isValidRevenueValue(item.value) &&
                      (item.value as number) > 0,
                  ) ||
                  data.some(
                    (item: MapDataItem) =>
                      getWorldCountryName(item.name) === region.label.formatter &&
                      isValidRevenueValue(item.value) &&
                      (item.value as number) > 0,
                  )
                    ? '#fff'
                    : undefined,
              },
            }))
          : [
              ...data
                .filter((item: MapDataItem) => isValidRevenueValue(item.value) && item.value > 0)
                .map((item: MapDataItem) => ({
                  name: item.name,
                  label: {
                    color: '#fff',
                  },
                })),
              ...southChinaSeaRegions,
            ],
        emphasis: {
          label: {
            show: true,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            // 世界级别显式传 formatter，和 nameMap 双保险一致翻译（ECharts 不同版本对 emphasis.label 对 nameMap 的尊重度不一致）
            formatter: isWorldMap ? formatWorldCountryLabel : undefined,
          },
          itemStyle: {
            areaColor: visualConfig.value.emphasisAreaColor,
            borderColor: visualConfig.value.emphasisBorderColor,
            borderWidth: visualConfig.value.emphasisBorderWidth,
          },
        },
        // geoIndex=0 下区域实际渲染样式由 geo 的 select 状态决定（map series 上的 select 不生效），
        // 显式禁用，避免 ECharts 默认的金黄色 rgba(255,215,0,0.8) 点击态露出。
        select: { disabled: true },
        selectedMode: false,
        itemStyle: {
          borderColor: visualConfig.value.borderColor,
          borderWidth: visualConfig.value.borderWidth,
          areaColor: visualConfig.value.areaColor,
        },
      },

      // ==================== 系列配置 ====================
      series: (() => {
        // 不打点（interaction.markers=false）时仅返回地图区域系列，不渲染基地散点
        if (!interactionConfig.value.markers) {
          return [
            {
              name: seriesName,
              type: 'map',
              map: mapName,
              nameMap: isWorldMap ? buildWorldNameMap() : undefined,
              geoIndex: 0,
              data: mapSeriesData,
              selectedMode: false,
              emphasis: {
                label: isWorldMap
                  ? {
                      show: true,
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      formatter: formatWorldCountryLabel,
                    }
                  : undefined,
                itemStyle: {
                  areaColor: visualConfig.value.emphasisAreaColor,
                  borderColor: visualConfig.value.emphasisBorderColor,
                  borderWidth: visualConfig.value.emphasisBorderWidth,
                },
              },
            },
          ] as SeriesOption[];
        }

        // 生成基地散点数据（省份级别和城市级别都使用）
        const baseData = generateBaseScatterData(data);

        const series: SeriesOption[] = [
          // 地图系列
          {
            name: seriesName,
            type: 'map',
            map: mapName,
            // 世界级别同 geo 对齐：注入属性名 → 中文翻译，覆盖系列层面的 emphasis/select label
            nameMap: isWorldMap ? buildWorldNameMap() : undefined,
            geoIndex: 0, // 与 geo 共用同一地图坐标系，确保区域、散点和拖拽同步。
            data: mapSeriesData,
            // 下钻完全依赖 click 事件（handleMapClick），不依赖 ECharts 选中态；
            // 关闭 selectedMode 避免点击后进入 select 状态，移开鼠标仍残留默认金黄色高亮。
            selectedMode: false,
            emphasis: {
              label: isWorldMap
                ? {
                    show: true,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    formatter: formatWorldCountryLabel,
                  }
                : undefined,
              itemStyle: {
                areaColor: visualConfig.value.emphasisAreaColor,
                borderColor: visualConfig.value.emphasisBorderColor,
                borderWidth: visualConfig.value.emphasisBorderWidth,
              },
            },
          },
          // 水波纹动效散点：视觉严格对齐 SocietyWorldMapPanel effectScatter
          {
            name: '水波纹',
            type: 'effectScatter' as const,
            coordinateSystem: 'geo' as const,
            geoIndex: 0,
            zlevel: 3,
            z: 19,
            showEffectOn: 'render' as const,
            rippleEffect: {
              brushType: scatterConfig.value.rippleBrushType,
              scale: scatterConfig.value.rippleScale,
              period: scatterConfig.value.ripplePeriod,
            },
            data: baseData.map((item) => {
              const isHighlight = currentLevel.value === 'world' || item.name.includes('中国');
              const cfg = scatterConfig.value;
              const override = item.scatterStyle;

              // 强调（中国/总部）vs 普通点的全局默认色；
              // 每项 scatterStyle 仅覆盖对应那个颜色，避免误改另一种点。
              const baseColor = isHighlight ? cfg.highlightColor : cfg.color;
              const baseShadowBlur = isHighlight ? cfg.highlightShadowBlur : cfg.shadowBlur;
              const baseShadowColor = isHighlight ? cfg.highlightShadowColor : cfg.shadowColor;
              const shadowBlur = isHighlight
                ? (override?.highlightShadowBlur ?? baseShadowBlur)
                : (override?.shadowBlur ?? baseShadowBlur);
              const shadowColor = isHighlight
                ? (override?.highlightShadowColor ?? baseShadowColor)
                : (override?.shadowColor ?? baseShadowColor);
              const color = isHighlight
                ? (override?.highlightColor ?? baseColor)
                : (override?.color ?? baseColor);

              // symbolSize 默认按 metric 公式计算，逐点可被 scatterStyle 上下限覆盖
              const minSize = override?.symbolSizeMin ?? cfg.symbolSizeMin;
              const maxSize = override?.symbolSizeMax ?? cfg.symbolSizeMax;
              const metricValue = Array.isArray(item.value) ? Number(item.value[2]) || 0 : 0;
              const symbolSize = Math.max(minSize, Math.min(maxSize, Math.sqrt(metricValue) / 30));

              return {
                ...item,
                // 散点 value 第三位必须是数值；真实空值仍由 rawValue 传给 tooltip。
                value: [item.value[0], item.value[1], item.value[2] ?? 0],
                itemStyle: {
                  color,
                  shadowBlur,
                  shadowColor,
                },
                symbolSize,
              };
            }),
          },
        ];
        return series;
      })(),
    };
  }

  /**
   * 生成基地散点数据
   * @description 根据当前级别生成基地标识的坐标数据。
   *   自定义坐标优先级：worldData 国家条目.coord → 地图项 coord → 默认 getWorldFeatureCenter；
   *   省份级：一省一点，province.coord → 默认省份中心（省会所在位置）；
   *   markerGranularity='city' 时改为按项目城市逐点（base.coord → getCityCoord → 省份中心兜底）；
   *   城市级：一城最多一点，base.coord/地图项 coord → 默认 getCityCoord（城市地理位置中心）。
   *   scatterStyle 透传到 effectScatter itemStyle，由 getChartOption 合并全局 scatterConfig。
   *   层级统一由 currentLevel 判断，不依赖系列名称。
   * @param data - 地图数据
   * @returns 散点数据数组
   */
  function generateBaseScatterData(data: MapDataItem[]): ScatterDataItem[] {
    if (currentLevel.value === 'world') {
      return data.map((item) => {
        const center =
          item.coord && item.coord.length === 2
            ? item.coord
            : getWorldFeatureCenter(item.name, RUIDA_MAP_BASE_CONFIG.defaultCenter);
        return {
          name: item.name,
          value: [...center, item.value] as [number, number, number | null],
          rawValue: item.rawValue,
          revenueItems: item.revenueItems,
          scatterStyle: item.scatterStyle,
        };
      });
    }

    // 中国地图层级：按 province / city 两种粒度打点
    if (currentLevel.value === 'province') {
      // 中国层级按城市粒度打点：每个项目城市一个点，落在城市具体位置
      //（base.coord 优先，其次 getCityCoord 城市坐标表，最后回退省份中心）；
      // 点数据直接使用该项目的分项数据，悬浮打点展示对应项目的悬浮卡片，点击下钻到所属省份
      if (interactionConfig.value.markerGranularity === 'city') {
        return props.data.provinces.flatMap((province) => {
          const provinceName = normalizeProvinceName(province.provinceName);
          return (province.baseList ?? []).map((base): ScatterDataItem => {
            const cityName = normalizeCityName(base.baseName);
            const center =
              (base.coord && base.coord.length === 2 ? base.coord : null) ??
              getCityCoord(base.baseName) ??
              getProvinceCenter(provinceName);
            const items = resolveRevenueItems(base, base.unit);
            const rawValue = sumRevenueItems(items);
            return {
              name: cityName,
              provinceName,
              detailData: base.detailData,
              rawValue,
              revenueItems: items,
              value: [...center, rawValue] as [number, number, number | null],
            };
          });
        });
      }
      // 省份级别：一个省份只打一个点，默认落在省会/省份中心位置（province.coord 可覆盖）；
      // 点数据直接使用省份汇总分项，悬浮打点与悬浮省份呈现同一张省份悬浮卡片
      return props.data.provinces
        .filter((province) => province.baseList && province.baseList.length > 0)
        .map((province) => {
          const provinceName = normalizeProvinceName(province.provinceName);
          const center = province.coord ?? getProvinceCenter(provinceName);
          const items = resolveRevenueItems(province, province.unit);
          const rawValue = sumRevenueItems(items);
          return {
            name: provinceName,
            provinceName,
            rawValue,
            revenueItems: items,
            value: [...center, rawValue] as [number, number, number | null],
          };
        });
    } else {
      // 城市级别：根据城市坐标显示标识点（地图项 coord 优先，否则 getCityCoord 查表）
      return data
        .filter((item) => item.hasMarker)
        .map((item): ScatterDataItem | null => {
          let coord: [number, number] | null =
            item.coord && item.coord.length === 2 ? item.coord : null;
          if (!coord) {
            const cityName = item.name.replace('市', '');
            coord = getCityCoord(cityName) ?? null;
          }

          if (!coord) {
            const cityName = item.name.replace('市', '');
            console.warn(`城市 ${cityName} 坐标未找到`);
            return null;
          }

          const resolvedCoord: [number, number] = coord;
          return {
            name: item.name,
            rawValue: item.rawValue,
            detailData: item.detailData,
            revenueItems: item.revenueItems,
            value: [...resolvedCoord, item.value] as [number, number, number | null],
            scatterStyle: item.scatterStyle,
          };
        })
        .filter((item): item is ScatterDataItem => item !== null);
    }
  }

  function resetMapViewForLevel(level: MapLevel): void {
    // 非 world 层级支持 options.layout.size 覆盖默认地图尺寸（可按 province/city 层级分别配置）
    const overrideSize = level !== 'world' ? resolveLayoutSizeOverride(level) : null;
    currentScale.value =
      overrideSize != null ? overrideSize : RUIDA_MAP_BASE_CONFIG.layoutSize[level];
    if (level === 'world') {
      currentWorldZoom.value = WORLD_VIEW.zoom;
    }
  }

  /**
   * 更新图表
   * @description 根据当前级别（世界/省份/城市）更新图表数据和配置
   */
  function updateChart(): void {
    if (!chartInstance) return;
    // 世界/省级地图 GeoJSON 依赖异步 fetch 注册，未就绪时跳过（initChart 完成注册后会首次渲染）
    if (currentLevel.value !== 'city' && !areBaseMapsRegistered) return;

    if (currentLevel.value === 'world') {
      // 世界级别：显示世界地图
      const worldData = getWorldData();
      chartInstance.setOption(getChartOption(RUIDA_MAP_NAMES.world, worldData, '全球分布'), true);
    } else if (currentLevel.value === 'province') {
      // 省份级别：显示全国地图
      const provinceData = getProvinceData();
      chartInstance.setOption(
        getChartOption(RUIDA_MAP_NAMES.china, provinceData, '省份分布'),
        true,
      );
    } else {
      // 城市级别：显示省份地图
      const cityData = getCityData(currentProvince.value);
      chartInstance.setOption(getChartOption(currentProvince.value, cityData, '市销量分布'), true);
    }
  }

  /**
   * 安全的 resize 方法
   * @description 确保 DOM 渲染完成后再调整图表大小，避免布局问题
   */
  function safeResize(): void {
    if (!chartInstance) return;

    nextTick().then(() => {
      requestAnimationFrame(() => {
        resizeChart();
      });
    });
  }

  const resizeChart = useDebounceFn(() => {
    if (!chartInstance || !chartRef.value) return;

    const { clientWidth, clientHeight } = chartRef.value;
    if (!clientWidth || !clientHeight) return;

    if (clientWidth === lastChartWidth && clientHeight === lastChartHeight) return;

    lastChartWidth = clientWidth;
    lastChartHeight = clientHeight;
    chartInstance.resize({
      width: clientWidth,
      height: clientHeight,
      animation: {
        duration: 0,
      },
      silent: true,
    });
  }, RUIDA_MAP_BASE_CONFIG.resizeDelay);

  // ==================== 生命周期钩子 ====================

  /**
   * 监听数据变化
   */
  watch(
    () => props.data.provinces,
    () => {
      if (chartInstance) {
        // chinaOnly 模式：数据源变化（如 Tab 切换/接口刷新）时回到中国层级，
        // 避免沿用旧数据下的省份/城市下钻视图
        if (scopeConfig.value.chinaOnly && currentLevel.value !== 'province') {
          currentLevel.value = 'province';
          currentProvince.value = '';
          resetMapViewForLevel('province');
        }
        updateChart();
        // 数据更新后触发 resize，确保 DOM 重新渲染后图表能正确适应容器
        safeResize();
      }
    },
  );

  watch(
    () => [props.data.world, interactionConfig.value.drill, scopeConfig.value.chinaOnly],
    () => {
      if (chartInstance) {
        currentLevel.value = scopeConfig.value.chinaOnly ? 'province' : 'world';
        currentProvince.value = '';
        resetMapViewForLevel(currentLevel.value);
        updateChart();
        safeResize();
      }
    },
    { deep: true },
  );

  watch(
    () => scopeConfig.value.southChinaSea,
    () => {
      if (chartInstance) updateChart();
    },
  );

  /**
   * 初始化图表
   * @description 创建 ECharts 实例并绑定事件
   */
  async function initChart(): Promise<void> {
    await nextTick();
    if (!chartRef.value) return;
    if (chartInstance) return;

    // 仅中国地图模式：跳过世界层级，直接以中国层级初始化
    currentLevel.value = scopeConfig.value.chinaOnly ? 'province' : 'world';
    resetMapViewForLevel(currentLevel.value);

    currentWorldZoom.value = WORLD_VIEW.zoom;

    // 创建 ECharts 实例
    const instance = echarts.init(chartRef.value as HTMLElement, undefined, {
      devicePixelRatio: RUIDA_MAP_BASE_CONFIG.devicePixelRatio,
      // 脏矩形优化会让刚进入可视区域的区域多边形沿用旧的命中测试路径，导致从不可交互区域
      // 直接移入国家内部时 hover 高亮不触发（需先经过边界重绘才恢复正常），故关闭脏矩形。
      useDirtyRect: false,
    });
    chartInstance = instance;

    // 按需 fetch 世界/中国 GeoJSON 并注册，注册完成后再首次渲染
    const registered = await ensureBaseMapsRegistered();
    if (chartInstance !== instance) return;
    if (registered) {
      updateChart();
      // 使用安全的 resize 方法，确保 DOM 布局稳定后再调整大小
      safeResize();
    }

    // 绑定点击事件，切换到城市地图
    instance.on('click', handleMapClick);
  }

  /**
   * 处理地图点击事件
   * @description 根据当前级别处理点击事件：世界级别点击中国进入省份级别，省份级别点击省份进入城市级别
   * @param params - 点击事件参数
   */
  function handleMapClick(params: ECElementEvent): void {
    if (!interactionConfig.value.drill) return;
    const itemData = isMapCallbackData(params.data) ? params.data : null;

    // 世界级别：点击中国进入省份级别
    if (currentLevel.value === 'world') {
      if (itemData?.name === '中国') {
        currentLevel.value = 'province';
        resetMapViewForLevel('province');
        updateChart();
        // 添加地图下钻埋点
        mapClick({
          mapName: levelNamesConfig.value.world,
          clickArea: '中国',
          drillDownLevel: 'province',
        });
      }
      return;
    }

    // 省份级别：点击省份（区域或打点）进入城市级别
    if (currentLevel.value === 'province') {
      // 获取点击的省份名称
      let clickedProvince = itemData?.provinceName;
      if (!clickedProvince && typeof itemData?.name === 'string') {
        const baseName = itemData.name.replace(/市$/, '');
        clickedProvince = findProvinceByBaseName(baseName) || itemData.name;
      }

      if (!clickedProvince) return;
      clickedProvince = normalizeProvinceName(clickedProvince);

      // 省级汇总有值不代表存在下钻明细：interaction.drillRequiresMetricValue=true（默认）时要求
      // 至少一个基地有有效指标（0 也算有效数据）；false 时只要有城市列表即允许下钻。
      const province = props.data.provinces.find(
        (item) => normalizeProvinceName(item.provinceName) === clickedProvince,
      );
      const hasDrillDownData = province?.baseList?.some(
        (base) =>
          base.baseName?.trim() &&
          (!interactionConfig.value.drillRequiresMetricValue ||
            base.revenueItems?.some((item) => toRevenueValue(item.value) !== null)),
      );
      if (!hasDrillDownData) return;

      // 获取省份行政区划代码并加载城市地图
      const adcode = provinceAdcodeMap[clickedProvince];
      if (adcode) {
        loadCityMap(clickedProvince, adcode);
        // 添加地图下钻埋点
        mapClick({
          mapName: levelNamesConfig.value.province,
          clickArea: clickedProvince,
          drillDownLevel: 'city',
        });
      }
    }
  }

  /**
   * 加载城市地图
   * @description 动态加载省份的城市 GeoJSON 数据并注册地图
   * @param provinceName - 省份名称
   * @param adcode - 省份行政区划代码
   */
  async function loadCityMap(provinceName: string, adcode: string): Promise<void> {
    try {
      // 优先加载单独的省份文件，缺失时回退全国汇总
      const cityJson = await loadProvinceCityGeoJson(adcode);
      const fallbackGeoJson = cityJson ? cityJson : await loadProvinceGeoJsonFromCitiesJson(adcode);

      if (!fallbackGeoJson) {
        throw new Error(`地图文件 citiesgeojson/${adcode}.json 不存在，且无 cities.json 回退数据`);
      }
      if (!registerGeoJsonMap(provinceName, fallbackGeoJson)) {
        throw new Error(`地图文件 citiesgeojson/${adcode}.json 格式无效`);
      }

      // 更新状态并刷新图表
      currentProvince.value = provinceName;
      currentLevel.value = 'city';
      resetMapViewForLevel('city');
      updateChart();
    } catch (error) {
      console.error(`加载 ${provinceName} 地图数据失败:`, error);
    }
  }

  /**
   * 返回上一级地图
   * @description 从城市级别返回到省份级别，从省份级别返回到世界地图
   */
  function backToProvince(): void {
    if (currentLevel.value === 'city') {
      currentLevel.value = 'province';
    } else if (currentLevel.value === 'province') {
      currentLevel.value = 'world';
    }
    resetMapViewForLevel(currentLevel.value);
    currentProvince.value = '';
    updateChart();
  }

  /**
   * 放大地图
   * @description 增加地图缩放比例
   */
  function handleZoomIn(): void {
    if (!chartInstance) return;

    if (currentLevel.value === 'world') {
      const { max, step } = WORLD_VIEW.zoomRange;
      currentWorldZoom.value = Math.min(Number((currentWorldZoom.value + step).toFixed(2)), max);
      chartInstance.setOption({
        geo: {
          center: WORLD_VIEW.center,
          zoom: currentWorldZoom.value,
        },
      });
      return;
    }

    const { max, step } = RUIDA_MAP_BASE_CONFIG.layoutSizeRange;
    currentScale.value = Math.min(currentScale.value + step, max);
    chartInstance.setOption({
      geo: {
        layoutSize: `${currentScale.value}%`,
      },
    });
  }

  /**
   * 缩小地图
   * @description 减少地图缩放比例
   */
  function handleZoomOut(): void {
    if (!chartInstance) return;

    if (currentLevel.value === 'world') {
      const { min, step } = WORLD_VIEW.zoomRange;
      currentWorldZoom.value = Math.max(Number((currentWorldZoom.value - step).toFixed(2)), min);
      chartInstance.setOption({
        geo: {
          center: WORLD_VIEW.center,
          zoom: currentWorldZoom.value,
        },
      });
      return;
    }

    const { min, step } = RUIDA_MAP_BASE_CONFIG.layoutSizeRange;
    currentScale.value = Math.max(currentScale.value - step, min);
    chartInstance.setOption({
      geo: {
        layoutSize: `${currentScale.value}%`,
      },
    });
  }

  /**
   * 对外暴露的 resize 方法
   * @description 供父组件调用，手动触发图表 resize
   */
  function triggerResize(): void {
    safeResize();
  }

  // 暴露方法给父组件
  defineExpose({
    resize: triggerResize,
  });

  // 组件挂载时初始化
  onMounted(async () => {
    await initChart();

    if (chartRef.value && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        resizeChart();
      });
      resizeObserver.observe(chartRef.value);
    }
  });

  // 组件卸载时清理
  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    chartInstance?.off('click', handleMapClick);
    chartInstance?.dispose();
    chartInstance = null;
  });
</script>

<style scoped lang="scss">
  .map-chart {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .back-btn {
    display: flex;
    position: absolute;
    z-index: 50;
    top: 20px;
    left: 20px;
    align-items: center;
    padding: 8px 16px;
    transition: all 0.2s ease;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: rgb(255 255 255 / 95%);
    box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
    color: #334155;
    font-size: 14px;
    cursor: pointer;
    gap: 8px;

    &:hover {
      border-color: #cbd5e1;
      background: #f8fafc;
    }

    .back-icon {
      font-family: var(--font-family-medium), sans-serif;
      font-size: 16px;
    }
  }

  .chart-container {
    width: 100%;
    height: 100%;
  }

  .zoom-controls {
    display: flex;
    position: absolute;
    z-index: 50;
    right: 20px;
    bottom: 20px;
    flex-direction: column;
    gap: 4px;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: all 0.2s ease;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: rgb(255 255 255 / 95%);
    box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
    color: #334155;
    font-family: var(--font-family-medium), sans-serif;
    font-size: 18px;
    cursor: pointer;

    &:hover {
      border-color: #cbd5e1;
      background: #f8fafc;
    }

    &:active {
      transform: scale(0.95);
    }

    &.zoom-in {
      border-radius: 4px 4px 0 0;
    }

    &.zoom-out {
      border-radius: 0 0 4px 4px;
    }
  }
</style>
