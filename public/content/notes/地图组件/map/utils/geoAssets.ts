/*
 * @Description: 地图 GeoJSON 资源按需加载器
 * GeoJSON 全部外置到 public/geo，按地图级别（world / province / city）fetch 并缓存，
 * 不再打进 JS 产物；失败结果不缓存，允许下次点击重试。
 */

/** 基于 Vite BASE_URL 的地图资源地址（构建期为 /micro-apps/smart-technology/，开发期为 /）。 */
const GEO_ASSET_BASE = `${import.meta.env.BASE_URL}geo/`;

const jsonCache = new Map<string, Promise<unknown>>();

/** 校验 GeoJSON FeatureCollection 结构。 */
function isGeoJsonFeatureCollection(value: unknown): value is {
  type: 'FeatureCollection';
  features: unknown[];
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

async function fetchGeoJson(relativePath: string): Promise<unknown> {
  const response = await fetch(`${GEO_ASSET_BASE}${relativePath}`);
  if (!response.ok) {
    throw new Error(`地图资源 ${relativePath} 加载失败：HTTP ${response.status}`);
  }
  return (await response.json()) as unknown;
}

function fetchCached<T>(relativePath: string): Promise<T> {
  let pending = jsonCache.get(relativePath);
  if (!pending) {
    pending = fetchGeoJson(relativePath).then((value) => {
      if (!isGeoJsonFeatureCollection(value)) {
        throw new Error(`地图资源 ${relativePath} 格式无效`);
      }
      return value;
    });
    pending.catch(() => {
      // 失败不缓存，允许下次重试
      jsonCache.delete(relativePath);
    });
    jsonCache.set(relativePath, pending);
  }
  return pending as Promise<T>;
}

/** 世界地图 GeoJSON（首屏世界级渲染需要）。 */
export function loadWorldGeoJson(): Promise<unknown> {
  return fetchCached('world.json');
}

/** 中国省级 GeoJSON（下钻省份级别时需要）。 */
export function loadChinaGeoJson(): Promise<unknown> {
  return fetchCached('china.json');
}

/** 单省城市级 GeoJSON；不存在时返回 null，由调用方决定是否回退。 */
export async function loadProvinceCityGeoJson(adcode: string): Promise<unknown | null> {
  try {
    return await fetchCached(`citiesgeojson/${adcode}.json`);
  } catch {
    return null;
  }
}

/** 全国城市汇总 GeoJSON（单省文件缺失时的回退数据源）。 */
export function loadCitiesGeoJson(): Promise<unknown | null> {
  return fetchCached('cities.json');
}
