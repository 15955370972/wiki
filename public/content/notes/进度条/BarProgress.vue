<!-- E:\sjq-pc\src\views\kongguJww\smartTechnology\components\jwwOverview -->
<template>
  <div class="bar-progress" @mouseenter="onEnter" @mouseleave="onLeave">
    <div style="position: relative; width: 80%; height: 24px">
      <div :class="['progress-bar', isGreen ? 'green' : 'red']" :style="{ width: displayWidth }">
        <span :class="progress < 30 ? 'text-black' : 'text-white'">{{ progress }}%</span>
      </div>
      <div class="bg-bar"></div>
      <span class="star">★</span>
    </div>
  </div>

  <!-- hover 弹框 teleport 到 smart-technology-entry -->
  <teleport to="#smart-technology-entry">
    <div
      v-if="popup"
      ref="popoverRef"
      :class="['bar-popover-fixed', `placement-${popup.placement}`]"
      :style="{ left: popup.x + 'px', top: popup.y + 'px' }"
    >
      <div class="pop-title">
        <span class="pop-title-left">{{ title }}</span>
        <div class="owner">
          <span>负责人</span><span>{{ manager }}</span>
        </div>
      </div>
      <ul class="pop-list">
        <li v-for="(item, index) in stats" :key="index"
          ><span>{{ item.label }}</span
          ><span>{{ item.text }}</span></li
        >
      </ul>
    </div>
  </teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, toRefs } from 'vue';
  import { getCurrentScale, toScaledLocalPoint } from '../utils/useScaledTeleport';
  import type { Level3Item } from './drillDownData';

  const props = defineProps<{
    data: Level3Item;
  }>();

  const { progress, title, manager, stats } = toRefs(props.data);

  const displayWidth = computed(() => `${progress.value}%`);
  const isGreen = computed(() => progress.value >= 100);

  /** 弹框与进度条之间的间距（视口像素） */
  const POPUP_GAP = 4;

  const popoverRef = ref<HTMLElement | null>(null);
  const popup = ref<{ x: number; y: number; placement: 'bottom' | 'top' } | null>(null);

  /** 鼠标进入进度条时，计算弹框位置并显示 */
  const onEnter = async (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    // 先按默认下方放置，居中显示
    const centerX = rect.left + rect.width / 2;
    const belowPoint = toScaledLocalPoint(centerX, rect.bottom + POPUP_GAP);
    popup.value = { x: belowPoint.x, y: belowPoint.y, placement: 'bottom' };

    // 等待弹框渲染后测量高度，判断下方是否放得下，放不下则翻转到上方
    await nextTick();
    const popEl = popoverRef.value;
    if (!popEl) return;

    const scale = getCurrentScale();
    const popHeight = popEl.offsetHeight * scale;
    const viewportH = window.innerHeight;

    if (rect.bottom + POPUP_GAP + popHeight > viewportH) {
      const abovePoint = toScaledLocalPoint(centerX, rect.top - POPUP_GAP - popHeight);
      popup.value = { x: abovePoint.x, y: abovePoint.y, placement: 'top' };
    }
  };

  /** 鼠标离开进度条时隐藏弹框 */
  const onLeave = () => {
    popup.value = null;
  };
</script>

<style scoped lang="scss">
  .bar-progress {
    position: relative;
    height: 24px;
    margin-top: 16px;
    margin-left: 16px;
    overflow: hidden;

    .bg-bar {
      position: absolute;
      z-index: 1;
      right: 0;
      left: 0;
      height: 24px;
      background: #e4eefa;
    }

    .progress-bar {
      position: absolute;
      z-index: 2;
      right: 0;
      left: 0;
      line-height: 24px;

      span {
        display: inline-block;
        font-family: MiSans-Medium;
        font-size: 16px;
        text-indent: 8px;

        &.text-black {
          color: #004567;
        }

        &.text-white {
          color: #fff;
        }
      }

      &.green {
        background: #2ac465;
      }

      &.red {
        background: #ff3325;
      }
    }

    .star {
      position: absolute;
      z-index: 3;
      top: 50%;
      right: -7px;
      margin-top: -12px;
      color: #ffa939;
      font-size: 20px;
    }
  }

  .bar-popover-fixed {
    position: fixed;
    z-index: 9999;
    width: 240px;
    padding: 8px 16px 0;
    transform: translateX(-50%);
    border: 1px solid #cedff0;
    background: #fff;
    // pointer-events: none;

    &::before {
      content: '';
      position: absolute;
      z-index: 2;
      left: 30px;
      border-width: 0 5px 12px;
      border-style: solid;
      border-color: transparent transparent #fff;
    }

    &::after {
      content: '';
      position: absolute;
      z-index: 1;
      left: 30px;
      border-width: 0 5px 12px;
      border-style: solid;
      border-color: transparent transparent #cedff0;
    }

    // 弹框在进度条下方：箭头朝上
    &.placement-bottom {
      &::before {
        top: -12px;
      }

      &::after {
        top: -13px;
      }
    }

    // 弹框在进度条上方：箭头朝下
    &.placement-top {
      &::before {
        bottom: -12px;
        border-width: 12px 5px 0;
        border-color: #fff transparent transparent;
      }

      &::after {
        bottom: -13px;
        border-width: 12px 5px 0;
        border-color: #cedff0 transparent transparent;
      }
    }

    .pop-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 8px;
      border-bottom: solid 1px #dbe5f1;

      .pop-title-left {
        position: relative;
        overflow: hidden;
        color: #17375e;
        font-family: MiSans-Medium;
        font-size: 18px;
        line-height: 24px;
        text-indent: 10px;
        text-overflow: ellipsis;
        white-space: nowrap;

        &::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          width: 2px;
          height: 12px;
          margin-top: -6px;
          border-radius: 15px;
          background: #4f81bd;
        }
      }
    }

    .owner {
      display: flex;
      align-items: center;
      width: 120px;
      margin: 8px 0;
      margin-left: auto;
      padding: 3px 8px;
      border: 1px solid #cedff0;
      border-radius: 2px;
      background: #f4f7fc;
      color: #4f81bd;
      font-family: MiSans-Regular;
      font-size: 12px;

      span {
        margin: 0 7px 0 0;
      }

      &::before {
        content: '';
        width: 5px;
        height: 5px;
        margin-right: 4px;
        border-radius: 50%;
        background: #4f81bd;
      }
    }

    .pop-list {
      li {
        display: flex;
        justify-content: space-between;
        margin: 8px 0;
        color: #4f81bd;
        font-family: MiSans;
        font-size: 16px;
        font-weight: normal;

        span:nth-child(2) {
          color: #17375e;
          font-weight: 600;
        }
      }
    }
  }
</style>
