<template>
  <div class="bottom-chart">
    <div class="category-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ 'is-active': category === tab.key }"
        @click="setCategory(tab.key)"
      >
        <img
          :src="category === tab.key ? tab.imageCurrent : tab.imageDefault"
          class="tab-icon-img"
          alt=""
        />
        {{ tab.title }}
      </button>
    </div>
    <div class="input-wrap">
      <textarea
        class="input-area"
        v-model="inputText"
        placeholder="请输入您的问题..."
        @keydown.enter="handleEnter"
      ></textarea>
      <div class="input-actions">
        <button
          class="btn-ai"
          :class="{ 'is-hover': hoverSmart }"
          @mouseenter="hoverSmart = true"
          @mouseleave="hoverSmart = false"
        >
          <img :src="smartIcon" class="ai-icon" alt="" />
          智能问数
        </button>
        <div class="input-actions-right">
          <img v-if="false" :src="speackImg" style="width: 14px; height: 22px" alt="" />
          <img
            :src="history"
            @click="toggleHistory"
            style="width: 20px; height: 20px; cursor: pointer"
            alt=""
          />
          <img
            :src="sendIcon"
            class="btn-send"
            :class="{ 'is-hover': hoverSend && !isSendDisabled, 'is-disabled': isSendDisabled }"
            @mouseenter="hoverSend = true"
            @mouseleave="hoverSend = false"
            @click="sendMessage"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    ComponentInternalInstance,
    computed,
    getCurrentInstance,
    onMounted,
    onUnmounted,
    ref,
  } from 'vue';
  // 5 个 tab 图标：默认 + 激活 双套 svg
  import history from '@/components/Ai/images/history.png';
  import financeDefault from '../images/core/finance-default.svg';
  import financeCurrent from '../images/core/finance-current.svg';
  import marketingDefault from '../images/core/marketing-default.svg';
  import marketingCurrent from '../images/core/marketing-current.svg';
  import engineeringDefault from '../images/core/engineering-default.svg';
  import engineeringCurrent from '../images/core/engineering-current.svg';
  import zcDefault from '../images/core/zhaocai-default.png';
  import zcCurrent from '../images/core/zhaocai-curr.png';
  import costDefault from '../images/core/cost-default.svg';
  import costCurrent from '../images/core/cost-current.svg';
  import propertyDefault from '../images/core/property-default.svg';
  import propertyCurrent from '../images/core/property-current.svg';
  import smartDefault from '../images/core/default-smart.svg';
  import speackImg from '../images/core/speack.png';
  import sendIcon from '../images/core/current-send.svg';
  import { cancelData, getFirstQuestion, getFollowUpQuestion, queryThemeDomains } from '@/api/ai';
  import { tabClick } from '@/shared/cockpit';
  import { message } from 'ant-design-vue';

  const props = defineProps({
    plate: {
      type: String,
      default: '',
    },
  });
  const emit = defineEmits(['send', 'setCategory', 'toggleHistory']);
  const canSend = ref(false);
  const checkpoint = ref(-1);
  const taskId = ref('');
  function setTaskId(id: string, categoryStr: string) {
    taskId.value = id;
    category.value = categoryStr;
  }

  // 发送按钮禁用：回答进行中（canSend）或输入框为空
  const isSendDisabled = computed(() => canSend.value || !inputText.value || !isAuth.value);
  function canSendFunc() {
    checkpoint.value = -1;
    taskId.value = '';
    canSend.value = false;
  }

  // 切换历史记录卡片显示状态
  function toggleHistory() {
    if (canSend.value) {
      message.warning('请先完成当前对话');
      return;
    }
    emit('toggleHistory');
  }

  // 交互态
  const hoverSmart = ref(false);
  const hoverSend = ref(false);
  // 默认就用 current，hover/active 不切图（图标颜色由 CSS opacity 体现）
  const smartIcon = smartDefault;

  const inputText = ref('');
  const tabs = ref<
    {
      title: string;
      key: string;
      imageDefault?: string;
      imageCurrent?: string;
    }[]
  >([]);

  const isAuth = ref(false);
  onMounted(() => {
    const map = new Map();
    map.set('finance', {
      imageDefault: financeDefault,
      imageCurrent: financeCurrent,
    });
    map.set('marketing', {
      imageDefault: marketingDefault,
      imageCurrent: marketingCurrent,
    });
    map.set('engineering', {
      imageDefault: engineeringDefault,
      imageCurrent: engineeringCurrent,
    });
    map.set('cost', {
      imageDefault: costDefault,
      imageCurrent: costCurrent,
    });
    map.set('property', {
      imageDefault: propertyDefault,
      imageCurrent: propertyCurrent,
    });
    map.set('zc', {
      imageDefault: zcDefault,
      imageCurrent: zcCurrent,
    });
    queryThemeDomains({
      plate: props.plate,
    }).then((res) => {
      tabs.value = res.data.map((item) => ({
        title: item.name,
        key: item.code,
        ...(map.get(item.code) || {}),
      }));
      isAuth.value = res.hasPermission;
      category.value = res?.defaultCategory || '';

      emit('setCategory', category.value);
    });
  });
  const category = ref<string>('');

  const app = getCurrentInstance();
  tabClick(category, tabs, '', app as ComponentInternalInstance);

  function sendFirstMessage() {
    getFirstQuestion({
      plate: props.plate,
      category: category.value,
      message: inputText.value,
    })
      .then((res) => {
        canSend.value = true;
        checkpoint.value = 0;
        taskId.value = res.data.task_id;
        emit(
          'send',
          taskId.value,
          inputText.value,
          checkpoint.value,
          category.value,
          res.data.messageId,
        );
        inputText.value = '';
      })
      .catch(() => {
        canSend.value = false;
      });
  }

  defineExpose({
    canSendFunc,
    setTaskId,
    streamEnd() {
      canSend.value = false;
    },
    sendMessage(q: string) {
      inputText.value = q;
      if (!taskId.value) {
        sendFirstMessage();
      } else {
        sendFollowUpMessage();
      }
    },
  });

  function sendFollowUpMessage() {
    getFollowUpQuestion({
      plate: props.plate,
      taskId: taskId.value,
      checkpoint: checkpoint.value,
      category: category.value,
      message: inputText.value,
    })
      .then((res) => {
        canSend.value = true;
        checkpoint.value = checkpoint.value + 1;
        taskId.value = res.data.task_id;
        emit(
          'send',
          taskId.value,
          inputText.value,
          checkpoint.value,
          category.value,
          res.messageId,
        );
        inputText.value = '';
      })
      .catch(() => {
        canSend.value = false;
      });
  }

  function handleEnter(e: KeyboardEvent) {
    if (!e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function sendMessage() {
    if (!isAuth.value) {
      message.warning('暂无使用权限');
      return;
    }
    if (canSend.value) {
      message.warning('正在回答中，请稍后');
      return;
    }
    if (!inputText.value) {
      message.warning('请输入您的问题');
      return;
    }
    if (!taskId.value) {
      sendFirstMessage();
    } else {
      sendFollowUpMessage();
    }
  }

  function setCategory(categoryStr: string) {
    category.value = category.value && category.value === categoryStr ? '' : categoryStr;
    checkpoint.value = -1;
    taskId.value = '';
    canSendFunc();
    emit('setCategory', category.value);
  }

  onUnmounted(() => {
    if (taskId.value) {
      cancelData({ taskId: taskId.value });
    }
  });
</script>

<style scoped lang="scss">
  .bottom-chart {
    display: flex;
    box-sizing: border-box;
    flex-direction: column;
    width: calc(100% - 32px);
    height: 100%;
    margin: 16px;
  }

  .input-wrap {
    border: 1px solid #4f81bd;
    border-radius: 8px;
    background: #fff;
  }

  .input-area {
    flex: 1;
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 8px;
    outline: none;
    color: #4f81bd;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.6;
    resize: none;

    &::placeholder {
      color: #4f81bd;
    }
  }

  .input-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    padding: 0 12px;

    // margin-top: 10px;
    border-top: 1px solid #4f81bd;
  }

  .btn-ai {
    display: flex;
    align-items: center;
    padding: 6px 16px;
    transition: opacity 0.15s ease;
    border: 1px solid #d0d0d0;
    border-radius: 20px;
    background: #4f81bd;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    gap: 6px;

    // hover / active 视觉高亮：透明度加深
    &.is-hover {
      opacity: 0.85;
    }

    &:hover {
      background: #4f81bd;
    }
  }

  .ai-icon {
    width: 16px;
    height: 16px;
  }

  .input-actions-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: #f0f0f0;
    font-size: 18px;
    cursor: pointer;

    img {
      width: 18px;
      height: 18px;
    }

    &:hover {
      background: #e0e0e0;
    }
  }

  .btn-send {
    // 原是 <button> 用 display:flex；现在挂在 <img> 上，flex 不生效，改用 inline-flex
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: opacity 0.15s ease;
    border: none;
    border-radius: 50%;
    background: #4f81bd;
    color: #fff;
    font-size: 16px;
    cursor: pointer;

    // hover / active 视觉高亮
    &.is-hover {
      opacity: 0.85;
    }

    &:hover {
      background: #3a7bc8;
    }

    // 禁用态：任务进行中（canSend=true）或输入框为空 → 不可点击 + 光标变 🚫 禁止手势
    &.is-disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .category-tabs {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    margin-bottom: 10px;
    background: #fff;

    // gap: 14px;
  }

  .tab-item {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    transition: color 0.15s ease;
    border: none;
    border-radius: 4px;
    background: none;
    color: #4f81bd;
    font-family: var(--font-family-regular);
    font-size: 14px;
    cursor: pointer;
    gap: 4px;

    // 激活态：字体色 #004567（图标已在模板 :src 切换为 current.svg）
    &.is-active {
      color: #004567;
      font-family: var(--font-family-demibold);
    }

    &:hover {
      background: #f0f0f0;
    }
  }

  .tab-icon-img {
    width: 14px;
    height: 14px;
  }
</style>
