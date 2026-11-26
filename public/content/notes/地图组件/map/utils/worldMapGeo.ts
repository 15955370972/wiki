/*
 * @Description: 瑞达总览世界地图 GeoJSON 名称映射与区域中心计算工具
 * @Author: chenpei <chenpei15.supplier@mychery.com>
 * @Date: 2026-07-14 14:11:10
 * @LastEditors: chenpei <chenpei15.supplier@mychery.com>
 * @LastEditTime: 2026-07-15 13:41:18
 */
import { geoNameMap } from './geoNames';
import { getWorldCountryDisplayName, normalizeWorldRegionName } from './worldMapCountryNames';

/** 世界 GeoJSON 的最小要素结构，仅描述本工具需要读取的字段。 */
interface WorldGeoFeature {
  properties?: { name?: string };
  geometry?: { type?: string; coordinates?: unknown };
}

/** ECharts 世界地图 regions 的标签配置。 */
export interface WorldMapRegion {
  name: string;
  label: { formatter: string };
}

/**
 * 世界 GeoJSON 要素列表，集中隔离历史 any GeoJSON 资源的边界。
 * world.json 已外置到 public/geo，由 geoAssets.loadWorldGeoJson() fetch，
 * MapChart 在注册基础地图成功后调用 setWorldFeatures 注入。
 */
let worldFeatures: WorldGeoFeature[] = [];

/**
 * 注入运行时加载的世界 GeoJSON 要素。
 * @param value fetch 到的未受信任 JSON（应为 FeatureCollection）。
 */
export function setWorldFeatures(value: unknown): void {
  worldFeatures =
    ((value as { features?: WorldGeoFeature[] } | null)?.features || []) as WorldGeoFeature[];
}

/**
 * 将世界地图原始国家名转换为页面展示名。
 * @param name GeoJSON 或 ECharts 提供的区域名称。
 * @returns 优先返回商社统一名称映射，其次返回 geoNameMap 或原名称。
 */
export function getWorldCountryName(name: string): string {
  if (!name) return name;
  const displayName = getWorldCountryDisplayName(name, '');
  return displayName || geoNameMap[name] || name;
}

/**
 * 在世界 GeoJSON 中查找与输入名称对应的要素。
 * @param featureName 中文、英文或常用别名的国家/区域名称。
 * @returns 匹配到的 GeoJSON 要素；未命中时返回 undefined。
 */
export function findWorldFeature(featureName: string): WorldGeoFeature | undefined {
  if (!featureName) return undefined;

  const exactMatch = worldFeatures.find((item) => item.properties?.name === featureName);
  if (exactMatch) return exactMatch;

  const normalizedName = normalizeWorldRegionName(featureName);
  const normalizedMatch = worldFeatures.find((item) => item.properties?.name === normalizedName);
  if (normalizedMatch) return normalizedMatch;

  for (const [geoKey, geoValue] of Object.entries(geoNameMap)) {
    if (geoKey === featureName || geoValue === featureName) {
      const byKey = worldFeatures.find((item) => item.properties?.name === geoKey);
      if (byKey) return byKey;
      const byValue = worldFeatures.find((item) => item.properties?.name === geoValue);
      if (byValue) return byValue;
    }
  }

  const displayName = getWorldCountryDisplayName(featureName, '');
  if (displayName && displayName !== featureName) {
    return worldFeatures.find((item) => item.properties?.name === displayName);
  }

  return undefined;
}

/**
 * 从目标区域主多边形计算地图中心点。
 * @param featureName 中文、英文或常用别名的国家/区域名称。
 * @param defaultCenter 未匹配到有效 GeoJSON 坐标时使用的地图默认中心点。
 * @returns 目标区域的包围盒中心点，或原样返回默认中心点。
 */
export function getWorldFeatureCenter(
  featureName: string,
  defaultCenter: [number, number],
): [number, number] {
  const points = getMainWorldPolygonPoints(findWorldFeature(featureName));
  if (!points.length) return defaultCenter;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });

  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/**
 * 构建 GeoJSON 原始名称到展示名称的 ECharts nameMap。
 * @returns 覆盖世界地图全部要素的确定性名称映射。
 */
export function buildWorldNameMap(): Record<string, string> {
  return worldFeatures.reduce<Record<string, string>>((nameMap, feature) => {
    const rawName = feature.properties?.name;
    if (rawName) nameMap[rawName] = getWorldCountryName(rawName);
    return nameMap;
  }, {});
}

/**
 * 构建世界地图各要素的显式标签配置。
 * @returns 与 nameMap 同口径的 regions；用于兼容不遵守 nameMap 的 ECharts emphasis 标签。
 */
export function buildWorldRegions(): WorldMapRegion[] {
  return worldFeatures.flatMap((feature) => {
    const rawName = feature.properties?.name;
    return rawName ? [{ name: rawName, label: { formatter: getWorldCountryName(rawName) } }] : [];
  });
}

/**
 * 读取 GeoJSON 要素面积最大的主多边形坐标。
 * @param feature 世界 GeoJSON 要素。
 * @returns 主多边形坐标；无法读取时返回空数组。
 */
function getMainWorldPolygonPoints(feature: WorldGeoFeature | undefined): [number, number][] {
  const geometry = feature?.geometry;
  if (!geometry?.coordinates) return [];

  if (geometry.type === 'Polygon') return collectCoordinatePairs(geometry.coordinates);

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const mainPolygon = geometry.coordinates
      .map((polygon: unknown) => {
        const points = collectCoordinatePairs(Array.isArray(polygon) ? polygon[0] : undefined);
        return { points, area: getPolygonArea(points) };
      })
      .sort((a, b) => b.area - a.area)[0];
    return mainPolygon?.points ?? [];
  }

  return collectCoordinatePairs(geometry.coordinates);
}

/**
 * 计算二维多边形面积，供 MultiPolygon 选择主多边形使用。
 * @param points 多边形边界坐标。
 * @returns 鞋带公式得到的绝对面积。
 */
function getPolygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;

  return (
    Math.abs(
      points.reduce((area, [x1, y1], index) => {
        const [x2, y2] = points[(index + 1) % points.length];
        return area + x1 * y2 - x2 * y1;
      }, 0),
    ) / 2
  );
}

/**
 * 将嵌套 GeoJSON 坐标递归收集为经纬度数组。
 * @param value GeoJSON coordinates 的任意嵌套层级。
 * @param points 递归过程中复用的结果容器。
 * @returns 收集到的有效二维坐标。
 */
function collectCoordinatePairs(
  value: unknown,
  points: [number, number][] = [],
): [number, number][] {
  if (!Array.isArray(value)) return points;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    points.push([value[0], value[1]]);
    return points;
  }
  value.forEach((item) => collectCoordinatePairs(item, points));
  return points;
}
