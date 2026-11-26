/*
 * @Description: 地图区域名称归一工具
 * 组件内部与业务侧共用同一套规则，避免各调用方各写一份 stripCitySuffix 导致坐标查表口径不一致。
 */

/** 去掉省份名后缀（省 / 自治区 / 市），与 ECharts 中国地图区域名对齐 */
export function normalizeProvinceName(provinceName: string): string {
  return provinceName.replace('省', '').replace('自治区', '').replace('市', '');
}

/** 城市名归一为「XX市」：先去掉「基地」「市」后缀再补回「市」，与城市地图区域名对齐 */
export function normalizeCityName(cityName: string): string {
  const normalizedName = cityName.replace(/基地$/, '').replace(/市$/, '');
  return `${normalizedName}市`;
}

/** 仅去掉城市名后缀（市 / 基地），用于按 cityCoordMap 查坐标 */
export function stripCitySuffix(cityName: string | null | undefined): string {
  return (cityName ?? '').replace(/基地$/, '').replace(/市$/, '');
}
