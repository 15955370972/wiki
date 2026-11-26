import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';

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

const DEFAULT_SELECTOR = '.width-scale-container__screen';

export function getScaleFromTransform(transform: string) {
  if (!transform || transform === 'none') return 1;
  const match = transform.match(/^matrix(?:3d)?\((.+)\)$/);
  if (!match?.[1]) return 1;
  const value = Number(match[1].split(',')[0]?.trim());
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function findVisibleElement(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    return element.offsetWidth > 0 && rect.width > 0 && rect.height > 0;
  });
}

export function useCockpitScale(options: UseCockpitScaleOptions = {}): UseCockpitScaleReturn {
  const scale = ref(1);
  let updateRaf = 0;
  const scaleStyle = computed(() => ({
    [options.cssVariableName || '--cockpit-scale']: String(scale.value),
  }));

  function getCurrentScale() {
    if (typeof window === 'undefined') return 1;
    const selector = options.scaleContainerSelector || DEFAULT_SELECTOR;
    const element =
      findVisibleElement(selector) ||
      findVisibleElement(options.fallbackSelector || DEFAULT_SELECTOR);
    if (options.designWidth) {
      const width = element?.getBoundingClientRect().width || window.innerWidth;
      return width > 0 ? width / options.designWidth : 1;
    }
    if (!element) return 1;
    const transformScale = getScaleFromTransform(window.getComputedStyle(element).transform);
    return transformScale !== 1
      ? transformScale
      : element.getBoundingClientRect().width / Math.max(1, element.offsetWidth);
  }

  function updateScale() {
    cancelAnimationFrame(updateRaf);
    scale.value = getCurrentScale();
    updateRaf = requestAnimationFrame(() => {
      scale.value = getCurrentScale();
    });
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

  return { scale, scaleStyle, updateScale, getCurrentScale };
}
