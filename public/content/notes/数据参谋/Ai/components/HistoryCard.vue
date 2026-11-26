<!--
  HistoryCard（历史记录右侧抽屉）
  ================================================
  布局：绝对定位贴父容器右侧，宽 450px，高度充满容器（父容器需 position: relative）
  - 挂在 .ai-modal-content 内部，覆盖弹框本身，并自动继承 .ai-modal 的 --ai-modal-scale 缩放
  - 表头（固定）：左侧「历史记录」18px #004567，右侧 back 图标 14px，点击关闭
  - 主体（滚动）：分组列表，组标题 16px #4f81bd，组内问题 18px #004567
  交互：
  - v-model:visible 受控显隐，打开从右向左滑入，关闭从左向右滑出
  - emit('close') 关闭抽屉
  - emit('select', item, group) 点击某条历史记录
-->
<template>
  <transition name="history-slide">
    <div class="history-card" v-show="visible">
      <div class="history-header">
        <span class="history-header-title">历史记录</span>
        <img src="../images/back.png" class="history-header-close" alt="close" @click="onClose" />
      </div>
      <div class="history-body">
        <template v-if="hasData">
          <div class="history-group" v-for="(group, gi) in list" :key="group.label ?? gi">
            <div class="history-group-label" v-if="group.children?.length > 0">{{ group.label }}</div>
            <div
              class="history-item"
              v-for="(item, ii) in group.children || []"
              :key="`${gi}-${ii}`"
              :title="item.message"
              @click="onSelect(item.taskId, item.category)"
            >
              {{ item.message }}
            </div>
          </div>
        </template>
        <div v-else class="history-empty">
          <img class="history-empty-img" :src="emptyImage" alt="暂无数据" />
          <span class="history-empty-text">暂无数据</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import emptyImage from '@/assets/ui/cockpit/empty-no-data.png';
import { getHistoryTaskList } from '@/api/ai';

  interface HistoryGroup {
    /** 分组小标题，如「今天」「7天内」「30天内」 */
    label: string;
    /** 该分组下的历史问题 */
    children: Record<string, any>[];
  }

  const props = withDefaults(
    defineProps<{
      /** 抽屉显隐（受控） */
      visible?: boolean;
      /** 盘面 */
      plate?: string;
    }>(),
    {
      visible: false,
      plate: '',
    },
  );

  const emit = defineEmits<{
    (e: 'update:visible', visible: boolean): void;
    (e: 'close'): void;
    (e: 'select', taskId: string, category: string): void;
  }>();

  const list = ref<HistoryGroup[]>([]);

  const hasData = computed(() =>
    list.value.some((g) => (g.children?.length ?? 0) > 0),
  );

  function setList(category: string) {
    getHistoryTaskList({ category, plate: props.plate }).then((res) => {
      list.value = res.data || [];
    });
  }
  defineExpose({
    setList,
  });

  function onClose() {
    emit('update:visible', false);
    emit('close');
  }

  function onSelect(taskId: string, category: string) {
    emit('select', taskId, category);
  }
</script>

<style scoped lang="scss">
  .history-card {
    display: flex;
    position: absolute;
    z-index: 160;
    top: 0;
    right: 0;
    box-sizing: border-box;
    flex-direction: column;
    width: 450px;
    max-width: 100%;
    height: 100%;
    border-left: 1px solid #dceaf8;
    background: #fff;

    // 抽屉内是滚动/点击区，不参与弹框拖动手势
    touch-action: auto;
  }

  // 打开：从右向左滑入；关闭：从左向右滑出
  .history-slide-enter-active,
  .history-slide-leave-active {
    transition: transform 0.3s ease;
  }

  .history-slide-enter-from,
  .history-slide-leave-to {
    transform: translateX(100%);
  }

  .history-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 20px;
  }

  .history-header-title {
    color: #004567;
    font-family: var(--font-family-demibold);
    font-size: 18px;
    line-height: 1.3;
  }

  .history-header-close {
    width: 14px;
    height: 14px;
    transition: opacity 0.15s ease;
    cursor: pointer;

    &:hover {
      opacity: 0.7;
    }
  }

  .history-body {
    flex: 1;
    min-height: 0;
    padding: 0 20px 16px;
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .history-group {
    & + & {
      margin-top: 20px;
    }
  }

  .history-group-label {
    margin-bottom: 8px;
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 16px;
    line-height: 1.3;
  }

  .history-item {
    padding: 6px 0;
    color: #004567;
    font-family: var(--font-family-regular);
    font-size: 18px;
    line-height: 1.4;
    cursor: pointer;
    overflow-wrap: break-word;
    word-break: break-all;

    &:hover {
      opacity: 0.7;
    }
  }

  .history-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 80px;
  }

  .history-empty-img {
    width: 120px;
    height: 120px;
    object-fit: contain;
  }

  .history-empty-text {
    margin-top: 8px;
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 14px;
    line-height: 20px;
  }
</style>
