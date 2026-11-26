/*
 * @Description: 瑞达总览地图基础配置：视觉映射、区域底色、高亮色、脉冲规格严格对齐 SocietyWorldMapPanel
 * @Author: chenpei <chenpei15.supplier@mychery.com>
 * @Date: 2026-07-03 16:18:33
 * @LastEditors: chenpei <chenpei15.supplier@mychery.com>
 * @LastEditTime: 2026-07-08 16:56:34
 */
export const RUIDA_MAP_NAMES = {
  world: 'zhikeWorld',
  // 使用 china 注册名，启用 ECharts 内置的南海诸岛附图（fix/nanhai 仅对注册名 china 生效）。
  china: 'china',
} as const;

export const RUIDA_MAP_BASE_CONFIG = {
  devicePixelRatio: 1,
  resizeDelay: 120,
  defaultCenter: [104.1954, 35.8617] as [number, number],
  /**
   * 世界地图「整图居中」视角：center 为 undefined 时由 ECharts 按地图 bbox 自动居中。
   * worldZoom 取 1.55：在该画布尺寸下整张世界地图完整落在画布内并保留约 19px 边距，
   * 若取 1.7 则地图左右各溢出约 33px、右侧 10px+ 的交互区域被裁出画布（无法 hover）。
   */
  worldCenter: undefined as [number, number] | undefined,
  worldZoom: 1.55,
  worldZoomRange: {
    min: 1.1,
    max: 2.8,
    step: 0.2,
  },
  layoutSize: {
    world: 100,
    province: 120,
    city: 112,
  },
  layoutSizeRange: {
    min: 50,
    max: 200,
    step: 10,
  },
} as const;

export const RUIDA_MAP_VISUAL_CONFIG = {
  // 颜色映射：6 档平滑渐变。末尾两色用户指定硬约束：index 4 = #4f8fc7、index 5 = #0f4c81 保持不变；
  // 前 5 档（index 0..4）按原 4 档 (#c2d7ec, #91bde2, #4f8fc7) 的相邻中点插入 2 个过渡色，得到：
  //   0: #c2d7ec (原第 0 档)
  //   1: #a9c9e7 (0→1 中点 = lerp(#c2d7ec, #91bde2, 0.5)  新增
  //   2: #91bde2 (原第 1 档)
  //   3: #70a6d5 (1→2 中点 = lerp(#91bde2, #4f8fc7, 0.5)  新增
  //   4: #4f8fc7 (原第 2 档，用户指定保持不变；也是 promote 倒数第二档颜色，见 catering MapChart.vue promoteColorIndex = visualColors.length - 2)
  //   5: #0f4c81 (原第 3 档，用户指定保持不变；最深色，对应 >=8 餐厅的高端档)
  // 相邻档（index 0..4 之间）的 R/G/B 单通道差分绝对值均 ≤ 35，视觉过渡平滑不跳档。
  visualColors: ['#c2d7ec', '#a9c9e7', '#91bde2', '#70a6d5', '#4f8fc7', '#0f4c81'],
  // 无数据或基础区域填充色（Geo 底图默认背景色）
  areaColor: '#d9e8f5',
  // 国家/省/市边界色
  borderColor: 'rgba(255, 255, 255, 0.78)',
  // 边界宽度（SocietyWorldMapPanel 统一 1）
  borderWidth: 1,
  // 鼠标 hover 背景色：与商社 emphasisAreaColor 一致
  emphasisAreaColor: '#0f4c81',
  // 鼠标 hover 边界色
  emphasisBorderColor: '#ffffff',
  // 鼠标 hover 边界宽度
  emphasisBorderWidth: 1,
  tooltipBorderColor: 'rgba(35, 199, 255, 0.4)',
  tooltipBackground: 'rgba(3, 55, 82, 0.9)',
  tooltipShadow: '0 0 16px rgba(0, 180, 255, 0.35)',
  // 脉冲点视觉严格对齐 SocietyWorldMapPanel effectScatter：#26d5ff + rgba(38,213,255,0.72)
  pulseColor: '#26d5ff',
  pulseShadowBlur: 8,
  pulseShadowColor: 'rgba(38, 213, 255, 0.72)',
  // 中国/总部脉冲点：#00efff + rgba(0,239,255,0.88)，对齐商社总部 isHeadquarters 口径
  highlightPulseColor: '#00efff',
  highlightPulseShadowBlur: 14,
  highlightPulseShadowColor: 'rgba(0, 239, 255, 0.88)',
} as const;

// 水波纹参数严格对齐 SocietyWorldMapPanel：stroke 描边 + scale 2.6 + period 4.4
export const RUIDA_MAP_RIPPLE_CONFIG = {
  brushType: 'stroke' as const,
  scale: 2.6,
  period: 4.4,
} as const;
