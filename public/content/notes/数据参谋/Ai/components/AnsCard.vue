<template>
  <div class="ans-card-container">
    <div
      v-for="(item, idx) in ansData.items"
      :key="idx"
      :class="['ans-card', item.success ? 'ans-card-success' : 'ans-card-error']"
    >
      <div class="ans-card-header">
        <span class="ans-card-icon">{{
          item.success ? '&#10004;' : '&#9888;'
        }}</span>
        <span class="ans-card-label">{{ item.label }}</span>
      </div>
      <div v-if="item.summary" class="ans-card-summary">
        {{ item.summary }}
      </div>
      <div v-if="item.data" class="ans-card-data-section">
        <pre class="ans-card-data"><code>{{ formatData(item.data) }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { parseAnsXml, type AnsRoot } from '../utils/ansXmlParser';

  const props = defineProps<{
    content: string;
  }>();

  const ansData = computed<AnsRoot>(() => {
    try {
      return parseAnsXml(props.content);
    } catch {
      return { items: [] };
    }
  });

  function formatData(data: string): string {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }
</script>

<style scoped lang="scss">
  .ans-card-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ans-card {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e3e8ef;
    background: #fff;

    &.ans-card-error {
      border-color: #fed7d7;
      background: #fff5f5;
    }

    &.ans-card-success {
      border-color: #c6f6d5;
      background: #f0fff4;
    }
  }

  .ans-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 600;
    color: #1a3050;

    .ans-card-error & {
      color: #c53030;
      border-bottom: 1px solid #fed7d7;
    }

    .ans-card-success & {
      color: #276749;
      border-bottom: 1px solid #c6f6d5;
    }
  }

  .ans-card-icon {
    font-size: 16px;
    line-height: 1;
  }

  .ans-card-label {
    flex: 1;
  }

  .ans-card-summary {
    padding: 12px 16px;
    color: #4a5568;
    font-size: 14px;
    line-height: 1.7;
  }

  .ans-card-data-section {
    padding: 0 16px 12px;
  }

  .ans-card-data {
    margin: 0;
    padding: 10px;
    border-radius: 4px;
    background: #f7fafc;
    color: #2d3748;
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;

    .ans-card-error & {
      background: #fff5f5;
    }
  }
</style>
