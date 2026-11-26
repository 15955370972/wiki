import { isSmartTechnologyMfeEnabled } from './config';
import { getMicroBusinessApps } from './registry';
import type { MicroBusinessAppDefinition } from './registry.types';

/**
 * 子应用入口是 `<script type="module">`，Wujie 的 `preloadApp` 对 module 脚本只会
 * `Promise.resolve("")`（见 wujie/esm/entry.js 的 `getExternalScripts`），必须由 iframe
 * 原生加载，所以 `exec: false` 的预加载拿不到入口 JS，真正的大头仍留在进入子应用时下载。
 * 这里改为在主应用空闲时用 `modulepreload` 预取入口模块图，把浏览器 HTTP 缓存焐热，
 * iframe 之后请求同一批 URL 即可直接命中，且不执行子应用代码、不触发业务接口。
 */

interface PreloadTarget {
  href: string;
  crossorigin: boolean;
}

let requested = false;
const injectedHrefs = new Set<string>();

function isPreloadEnabled() {
  return import.meta.env.VITE_MFE_PRELOAD_ENABLED !== 'false';
}

function requestIdle(fn: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => fn(), { timeout: 1500 });
  } else {
    window.setTimeout(() => fn(), 1500);
  }
}

function isCrossOrigin(href: string) {
  return new URL(href, window.location.href).origin !== window.location.origin;
}

function resolveAssetHref(rawHref: string, appUrl: string) {
  try {
    return new URL(rawHref, new URL(appUrl, window.location.href)).href;
  } catch {
    return '';
  }
}

/**
 * 只解析入口 HTML，不执行任何脚本：DOMParser 产出的文档是惰性的，不会加载子资源。
 */
function parseEntryAssets(html: string, appUrl: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const toTarget = (element: Element, attribute: 'src' | 'href') => {
    const href = resolveAssetHref(element.getAttribute(attribute) || '', appUrl);
    if (!href) return undefined;
    return { href, crossorigin: element.hasAttribute('crossorigin') || isCrossOrigin(href) };
  };

  return {
    // module 脚本按规范总是走 CORS，crossorigin 统一置位以命中同一份缓存。
    modules: Array.from(document.querySelectorAll('script[type="module"][src]'))
      .map((element) => toTarget(element, 'src'))
      .filter((target): target is PreloadTarget => Boolean(target))
      .map((target) => ({ ...target, crossorigin: true })),
    styles: Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .map((element) => toTarget(element, 'href'))
      .filter((target): target is PreloadTarget => Boolean(target)),
  };
}

/**
 * `modulepreload` 会递归预取静态 import，因此一条入口链接即可覆盖整张同步模块图；
 * 样式只用 `preload as="style"`，避免把子应用 CSS 应用到主应用文档上。
 */
function appendPreloadLink(target: PreloadTarget, rel: 'modulepreload' | 'preload', as?: string) {
  if (injectedHrefs.has(target.href)) return;
  injectedHrefs.add(target.href);

  const link = document.createElement('link');
  link.rel = rel;
  link.href = target.href;
  if (as) link.as = as;
  if (target.crossorigin) link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

async function warmAppAssets(app: MicroBusinessAppDefinition) {
  const response = await fetch(app.url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`入口响应 ${response.status}`);

  const { modules, styles } = parseEntryAssets(await response.text(), app.url);
  styles.forEach((target) => appendPreloadLink(target, 'preload', 'style'));
  modules.forEach((target) => appendPreloadLink(target, 'modulepreload'));
}

function getPreloadableApps() {
  return getMicroBusinessApps().filter(
    (app) => app.id !== 'smart-technology' || isSmartTechnologyMfeEnabled(),
  );
}

/**
 * 逐个应用排队预取，避免多个子应用的模块图同时抢占带宽影响主应用自身的懒加载分包。
 */
function warmNextApp(apps: readonly MicroBusinessAppDefinition[], index: number) {
  const app = apps[index];
  if (!app) return;

  requestIdle(() => {
    void warmAppAssets(app)
      .catch((error: unknown) => {
        console.warn('[mfe preload skipped]', { appId: app.id, url: app.url, error });
      })
      .finally(() => warmNextApp(apps, index + 1));
  });
}

export function preloadBusinessApps() {
  if (requested || !isPreloadEnabled()) return;
  requested = true;

  warmNextApp(getPreloadableApps(), 0);
}
