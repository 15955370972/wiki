import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';

export interface UseCockpitScaleOptions {
  scaleContainerSelector?: string;
  fallbackSelector?: string;
  cssVariableName?: string;
  designWidth?: number;
}

export interface UseCockpitScaleReturn {
  scale: Ref<number>;
  scaleStyle: ComputedRef<Record<string, string>>;
  updateScale: () => void;
  getCurrentScale: () => number;
}

const DEFAULT_SCALE_CONTAINER_SELECTOR = '.width-scale-container__screen';
const DEFAULT_CSS_VARIABLE_NAME = '--cockpit-scale';

export function getScaleFromTransform(transform: string) {
  if (!transform || transform === 'none') return 1;

  const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch?.[1]) {
    const values = matrix3dMatch[1].split(',').map((value) => Number(value.trim()));
    return Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1;
  }

  const matrixMatch = transform.match(/^matrix\((.+)\)$/);
  if (!matrixMatch?.[1]) return 1;

  const values = matrixMatch[1].split(',').map((value) => Number(value.trim()));
  return Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1;
}

function isVisibleScaleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return element.offsetWidth > 0 && rect.width > 0 && rect.height > 0;
}

function findVisibleScaleElement(selector: string) {
  if (typeof document === 'undefined') return undefined;

  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisibleScaleElement);
}

function getElementScale(scaleElement: HTMLElement) {
  const transformScale = getScaleFromTransform(window.getComputedStyle(scaleElement).transform);
  if (transformScale !== 1) return transformScale;

  const rawWidth = scaleElement.offsetWidth;
  return rawWidth > 0 ? scaleElement.getBoundingClientRect().width / rawWidth : 1;
}

function getDesignWidthScale(scaleElement: HTMLElement | undefined, designWidth: number) {
  if (!Number.isFinite(designWidth) || designWidth <= 0) return 1;

  const baseWidth = scaleElement?.getBoundingClientRect().width || window.innerWidth;
  return baseWidth > 0 ? baseWidth / designWidth : 1;
}

export function useCockpitScale(options: UseCockpitScaleOptions = {}): UseCockpitScaleReturn {
  const scale = ref(1);
  let updateRaf = 0;

  const scaleStyle = computed<Record<string, string>>(() => ({
    [options.cssVariableName || DEFAULT_CSS_VARIABLE_NAME]: String(scale.value),
  }));

  function getScaleElement() {
    const scaleContainerSelector =
      options.scaleContainerSelector || DEFAULT_SCALE_CONTAINER_SELECTOR;
    const fallbackSelector = options.fallbackSelector || DEFAULT_SCALE_CONTAINER_SELECTOR;

    return (
      findVisibleScaleElement(scaleContainerSelector) || findVisibleScaleElement(fallbackSelector)
    );
  }

  function getCurrentScale() {
    const scaleElement = getScaleElement();
    if (typeof window === 'undefined') return 1;

    if (options.designWidth) {
      return getDesignWidthScale(scaleElement, options.designWidth);
    }

    if (!scaleElement) return 1;

    return getElementScale(scaleElement);
  }

  function syncScale() {
    scale.value = getCurrentScale();
  }

  function updateScale() {
    if (typeof window === 'undefined') {
      syncScale();
      return;
    }

    cancelAnimationFrame(updateRaf);
    syncScale();
    updateRaf = requestAnimationFrame(syncScale);
  }

  onMounted(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    window.visualViewport?.addEventListener('resize', updateScale);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', updateScale);
    window.visualViewport?.removeEventListener('resize', updateScale);
    cancelAnimationFrame(updateRaf);
  });

  return {
    scale,
    scaleStyle,
    updateScale,
    getCurrentScale,
  };
}
