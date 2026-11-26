<template>
  <div class="tree-table">
    <div class="tree-table__title" v-if="props.title">
      <span class="title-bar"></span>
      <span class="title-text">{{ props.title }}</span>
    </div>
    <div class="tree-table__content">
      <a-spin :spinning="loading">
        <a-table
          :columns="mergedColumns"
          :data-source="computedDataSource"
          :row-key="getRowKey"
          :row-class-name="getRowClassName"
          :row-selection="props.rowSelection"
          :pagination="false"
          :scroll="scrollConfig"
          size="small"
          bordered
        >
          <template #emptyText>
            <div class="empty-state" :style="{ minHeight: props.height + 'px' }">
              <img :src="emptyImg" class="empty-state__img" />
            </div>
          </template>
          <template #headerCell="{ column }">
            <div class="th-cell">
              <span>
                <span
                  class="expand-btn"
                  v-if="column.expandable"
                  @click.stop="toggleExpandAll(column)"
                  >{{ headerFields.includes(column.key) ? '-' : '+' }}</span
                >
                <span style="color: #17375e; font-family: MiSans-Medium; font-size: 18px">{{
                  column.title
                }}</span>
              </span>
              <img
                v-if="column.sortable"
                :src="
                  sortState[column.key] && sortState[column.key].endsWith('asc')
                    ? ascIcon
                    : descIcon
                "
                class="sort-icon"
                @click="handleSort(column.key)"
              />
            </div>
          </template>
          <template #bodyCell="{ column, record, index }">
            <div
              class="td-cell"
              :class="{ 'td-cell--ellipsis': props.isTooltip }"
              :style="column.color ? { color: column.color } : undefined"
            >
              <span
                v-if="
                  column.expandable &&
                  record[column.key] &&
                  !(
                    record.rowType === 'total' ||
                    (record.rowType === 'subtotal' && column.merge)
                  ) &&
                  displayField.includes(column.key)
                "
                class="expand-btn"
                @click.stop="toggleExpand(record.nodeKey, column)"
                >{{
                  (dataMap[column.key] || []).some((item) => record.nodeKey.startsWith(item)) &&
                  displayField
                    .filter((_, index) => index < displayField.length - 1)
                    .includes(column.key)
                    ? '-'
                    : '+'
                }}</span
              >
              <template v-if="!column.isSlot">
                <div
                  v-if="props.isTooltip"
                  class="td-cell__text td-cell__text--ellipsis"
                  :style="
                    column.isTextCenter ? { flex: 1, textAlign: 'center' } : { textAlign: 'left' }
                  "
                  @mouseenter="handleCellEnter($event, column, index, record)"
                  @mouseleave="handleCellLeave()"
                  >{{ getCellText(column, record) }}</div
                >
                <div
                  v-else
                  :style="
                    column.isTextCenter ? { flex: 1, textAlign: 'center' } : { textAlign: 'left' }
                  "
                  >{{ getCellText(column, record) }}</div
                >
              </template>
              <slot v-else :name="column.key" :record="record" :index="index"></slot>
            </div>
          </template>
        </a-table>
      </a-spin>
    </div>
    <pagination
      v-if="total > maxTotal"
      :total="total"
      :pageSize="maxTotal"
      :showSizeChanger="false"
      :showQuickJumper="false"
      @change="handleChange"
    />
    <div v-if="tooltipKey" class="tree-table__custom-tooltip" :style="tooltipPosition">{{
      tooltipText
    }}</div>
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, Ref, ref } from 'vue';
  import ascIcon from '../../images/icons/asc.png';
  import Pagination from '../../components/common/Pagination.vue';
  import descIcon from '../../images/icons/desc.png';
  import emptyImg from '@/views/kongguJww/smartTechnology/images/zanwu.png';
  import {
    queryConditionMediaList,
    queryDetailTableData,
    queryDisplayFieldOptions,
    queryMatrixOptionsData,
  } from '@/api/kgjww/smartTechnology';
  import { FilterQueryParams } from './FilterForm.vue';
  import { getCount } from '@/views/kongguJww/propertyGraticules/propertyManagement/rightContent/utils';

  interface Column {
    isCount?: boolean;
    key: string;
    title: string;
    width?: number | string;
    sortable?: boolean;
    expandable?: boolean;
    merge?: string;
    color?: string;
    unit?: string;
    isTextCenter?: boolean;
    customCell?: (record: any, rowIndex?: number) => { rowSpan?: number; colSpan?: number };
  }

  // 表头列：叶子列需带 key，分组列用 children 嵌套（无 key），支持多级表头
  interface TreeTableColumn {
    key?: string;
    title: string;
    width?: number | string;
    sortable?: boolean;
    expandable?: boolean;
    merge?: string;
    color?: string;
    children?: TreeTableColumn[];
    customCell?: (record: any, rowIndex?: number) => Record<string, any>;
  }

  const treeTableData = ref<Record<string, any>[]>([]);
  const computedDataSource = computed(() => props.dataSource ?? treeTableData.value);
  const total = ref(0);
  const pageNum = ref(1);
  const emit = defineEmits(['change', 'sort']);
  function handleChange(page: number) {
    pageNum.value = page;
    if (props.promiseFunc) {
      emit('change', page);
    } else {
      initList();
    }
  }

  const props = defineProps({
    pageSize: {
      type: Number,
      default: 50,
    },
    height: {
      type: Number,
      default: 250,
    },
    title: {
      type: String,
      default: '',
    },
    tabType: {
      type: String,
      default: '1',
    },
    // 线索渠道明细（1），未下发线索（2），未建档（3），战败原因（4），新媒体矩阵（5）
    promiseFunc: {
      type: Function,
      required: false,
    },
    treeTableColumns: {
      type: Array as PropType<TreeTableColumn[]>,
      default: () => [],
    },
    fixedColumns: {
      type: Array as PropType<Column[]>,
      default: () => [],
    },
    // 外部传入表格数据，传入后优先使用，不走内部 getList
    dataSource: {
      type: Array as PropType<Record<string, any>[]>,
      default: undefined,
    },
    // 行选择配置，透传给 a-table 的 row-selection
    rowSelection: {
      type: Object,
      default: undefined,
    },
    // 外部数据行唯一键字段名（如 'fieldName'），传入后 getRowKey 优先使用
    rowKeyField: {
      type: String,
      default: '',
    },
    // 关闭表体纵向滚动（scroll.y）。开启后表头/表体回到单表渲染，
    // 避免在 scale 缩放容器内表头与首行错位、列竖线断裂的问题。
    noScroll: {
      type: Boolean,
      default: false,
    },
    // 高亮列（如 'fieldName', 'type'），默认不高亮
    highCol: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    // 开启后单元格内容单行展示，超出省略号，鼠标悬浮显示完整内容（灰底白字）
    isTooltip: {
      type: Boolean,
      default: false,
    },
    // 横向滚动宽度（scroll.x）。传入后表格按列 width 真实排布，
    // 总宽超出容器时出现横向滚动条；不传则维持原行为（列宽被拉伸填满容器）。
    scrollX: {
      type: [Number, String] as PropType<number | string>,
      default: undefined,
    },
  });
  const maxTotal = ref(props.pageSize);

  // noScroll 时不设 scroll.y，表头/表体回到单表渲染（避免 scale 容器内错位/断线）
  // 数据为空时改用 scroll.x（而非 scroll.y）：
  //  1. 单表渲染，不再因拆分表头/表体而渲染出多余的默认「暂无信息」占位，也无纵向滚动条；
  //  2. 列宽溢出可视区时出现横向滚动条，溢出的表头仍可滚动查看；
  //  3. antd 会把空占位包进 sticky 的 .ant-table-expanded-row-fixed（宽度=可视区），
  //     使「暂无信息」横向滚动时始终居中在可视区域。
  const scrollConfig = computed(() => {
    if (props.noScroll) return props.scrollX ? { x: props.scrollX } : undefined;
    if (!computedDataSource.value.length) return { x: props.scrollX ?? 'max-content' };
    // 传入 scrollX 时同时设 x：列按 width 真实排布，超出容器出现横向滚动条
    return props.scrollX ? { x: props.scrollX, y: props.height } : { y: props.height };
  });

  const expandKeys = computed(() => {
    return props.fixedColumns.map((item) => item.key);
  });
  const dataKeys = computed(() => {
    // 多级表头：递归收集所有叶子列的 key（分组节点无 key）
    const collect = (cols: TreeTableColumn[]): string[] =>
      cols.reduce((acc, col) => {
        if (col.children && col.children.length) {
          return acc.concat(collect(col.children));
        }
        return col.key ? acc.concat(col.key) : acc;
      }, [] as string[]);
    return collect(props.treeTableColumns);
  });
  const displayField = ref([expandKeys.value[0]]);

  const headerFields = ref<string[]>([]);

  const mergedColumns = computed(() => {
    const fixedKeys = props.fixedColumns.map((c) => c.key);
    const data = treeTableData.value;

    // 预先计算每个 (rowIndex, colKey) 的 rowSpan
    // 规则：当前列值与上一行相同，并且其左侧所有 fixedColumns 的值也相同时，才能合并
    // 例外：isTotal 行不参与纵向合并（自身独占，且不被上方延伸覆盖）
    const spanMap: Record<string, number[]> = {};
    fixedKeys.forEach((key, colIdx) => {
      const spans = new Array(data.length).fill(0);
      let i = 0;
      while (i < data.length) {
        if ((data[i] as any).rowType === 'total') {
          spans[i] = 1;
          i++;
          continue;
        }
        let j = i + 1;
        while (j < data.length) {
          if ((data[j] as any).rowType === 'total') break;
          const sameCurr = data[j][key] === data[i][key];
          const sameParents = fixedKeys.slice(0, colIdx).every((pk) => data[j][pk] === data[i][pk]);
          if (sameCurr && sameParents) {
            j++;
          } else {
            break;
          }
        }
        spans[i] = j - i;
        i = j;
      }
      spanMap[key] = spans;
    });

    // 命中 highCol 的列，给单元格追加高亮 class（背景 #F4F7FC）
    const withHigh = (key: string | undefined, attrs: Record<string, any>) => {
      if (key && props.highCol.includes(key)) {
        attrs.class = attrs.class ? `${attrs.class} tree-table__high-col` : 'tree-table__high-col';
      }
      return attrs;
    };

    const fixedWithSpan: Column[] = props.fixedColumns.map((col, colIdx) => ({
      ...col,
      customCell: (record: any, rowIndex?: number) => {
        const idx = rowIndex ?? 0;
        if (record?.rowType === 'total') {
          // isTotal 行：第一列横向合并整个 fixedColumns，其余列隐藏
          return withHigh(
            col.key,
            colIdx === 0 ? { colSpan: fixedKeys.length, rowSpan: 1 } : { colSpan: 0, rowSpan: 1 },
          );
        }
        const rowSpan = spanMap[col.key]?.[idx] ?? 1;
        // 横向合并：若左侧某列声明了 merge 且其 colSpan 覆盖到当前列，则当前列隐藏
        for (let p = 0; p < colIdx; p++) {
          const pCol = props.fixedColumns[p];
          if (!pCol.merge) continue;
          const pSpan = Number(record?.[pCol.merge]) || 1;
          if (pSpan > 1 && p + pSpan > colIdx) {
            return withHigh(col.key, { colSpan: 0, rowSpan });
          }
        }
        // 当前列自身的横向合并
        if (col.merge) {
          const span = Number(record?.[col.merge]) || 1;
          if (span > 1) {
            const maxSpan = fixedKeys.length - colIdx;
            return withHigh(col.key, { colSpan: Math.min(span, maxSpan), rowSpan });
          }
        }
        return withHigh(col.key, { rowSpan });
      },
    }));

    // treeTableColumns 支持多级表头（children 嵌套）；为命中 highCol 的叶子列追加高亮
    const decorateTree = (cols: TreeTableColumn[]): TreeTableColumn[] =>
      cols.map((col) => {
        if (col.children && col.children.length) {
          return { ...col, children: decorateTree(col.children) };
        }
        if (col.key && props.highCol.includes(col.key)) {
          return {
            ...col,
            customCell: () => ({ class: 'tree-table__high-col' }),
          } as TreeTableColumn;
        }
        return col;
      });

    return fixedWithSpan.concat(decorateTree(props.treeTableColumns) as Column[]);
  });

  const dataMap = ref<Record<string, string[]>>({});

  // 单元格展示文本（tooltip 与正常渲染共用同一份逻辑）
  function getCellText(column: Column, record: Record<string, any>) {
    if (column.isCount) return record[column.key]
      ? record[column.key] + (column.unit || '')
      : props.promiseFunc
        ? '--'
        : '';
    return record[column.key]
      ? getCount(record[column.key]) + (column.unit || '')
      : props.promiseFunc
        ? '--'
        : '';
  }

  // tooltip 受控：仅当内容溢出且 isTooltip 为 true 时，对当前 hover 的单元格展示
  const tooltipKey = ref<string | null>(null);
  const tooltipText = ref('');
  const tooltipViewportPos = ref<{ x: number; y: number } | null>(null);
  // 单元格唯一标识（行索引 + 列 key）。用 index 而非 rowKey：
  // 外部数据未必有稳定 rowKey，同列各行 rowKey 相同会导致整列 tooltip 同时弹出
  function cellKey(column: Column, index: number) {
    return `${index}__${column.key}`;
  }

  // —— scale 容器坐标换算（与 GanttChart 同理）——
  // #smart-technology-entry 处于 .width-scale-container__screen 的 scale 缩放下，
  // position:fixed 的包含块是带 transform 的祖先，left/top 需用本地坐标（viewport ÷ scale）
  function getScaleFromTransform(transform: string) {
    if (!transform || transform === 'none') return 1;
    const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
    if (matrix3dMatch?.[1]) {
      const values = matrix3dMatch[1].split(',').map((v) => Number(v.trim()));
      return Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1;
    }
    const matrixMatch = transform.match(/^matrix\((.+)\)$/);
    if (!matrixMatch?.[1]) return 1;
    const values = matrixMatch[1].split(',').map((v) => Number(v.trim()));
    return Number.isFinite(values[0]) && values[0] > 0 ? values[0] : 1;
  }
  function getCurrentScale() {
    const el = document.querySelector<HTMLElement>('#smart-technology-entry');
    if (!el) return 1;
    const s = getScaleFromTransform(window.getComputedStyle(el).transform);
    if (s !== 1) return s;
    const raw = el.offsetWidth;
    return raw > 0 ? el.getBoundingClientRect().width / raw : 1;
  }
  function toScaledLocalPoint(viewportX: number, viewportY: number) {
    const scale = getCurrentScale();
    const base = (
      document.querySelector('#smart-technology-entry') as HTMLElement
    )?.getBoundingClientRect();
    const baseLeft = base?.left ?? 0;
    const baseTop = base?.top ?? 0;
    return {
      x: (viewportX - baseLeft) / scale,
      y: (viewportY - baseTop) / scale,
    };
  }

  // tooltip 的定位样式（position: fixed 相对于 scale 容器）
  const tooltipPosition = computed(() => {
    if (!tooltipKey.value || !tooltipViewportPos.value) return { display: 'none' };
    const point = toScaledLocalPoint(tooltipViewportPos.value.x, tooltipViewportPos.value.y);
    return {
      position: 'fixed' as const,
      left: point.x + 'px',
      top: point.y + 'px',
      transform: 'translate(-50%, -100%)',
    };
  });

  // 判断文本是否溢出（出现省略号）。
  // scrollWidth / clientWidth 都被浏览器「四舍五入」取整：当文本溢出不足 1px 时
  // （实测溢出仅 0.08~0.24px），两者取整后相等，于是误判为「未溢出」—— 但浏览器
  // 只要内容比盒子宽哪怕 0.01px 就会渲染省略号，100% 显示缩放下该误差尤其常见。
  // 方案：把一个等字体、不换行、不裁剪的克隆节点插入到「同一个单元格」内（同一 scale
  // 坐标系），用 getBoundingClientRect 量它和单元格盒子的「带小数」宽度。两者被同一
  // scale 缩放，可直接相减比较；> 0 即溢出，留极小阈值 0.05 仅用于过滤测量噪声。
  function isCellOverflow(el: HTMLElement, text: string) {
    if (!text) return false;
    const cs = window.getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.cssText =
      'position:absolute;left:0;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;';
    probe.style.font = cs.font;
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.letterSpacing = cs.letterSpacing;
    probe.textContent = text;
    el.appendChild(probe);
    const textWidth = probe.getBoundingClientRect().width;
    el.removeChild(probe);
    // el 自身即文本容器（无内边距），盒宽即可容纳文本的宽度；与 probe 同处 scale 坐标系
    const boxWidth = el.getBoundingClientRect().width;
    return textWidth - boxWidth > 0.05;
  }

  // 鼠标进入：测量文本是否溢出，溢出才打开 tooltip 并记录位置
  function handleCellEnter(
    e: MouseEvent,
    column: Column,
    index: number,
    record: Record<string, any>,
  ) {
    const el = e.currentTarget as HTMLElement;
    const text = getCellText(column, record);
    if (el && isCellOverflow(el, text)) {
      tooltipKey.value = cellKey(column, index);
      tooltipText.value = text;
      const rect = el.getBoundingClientRect();
      tooltipViewportPos.value = {
        x: rect.left + rect.width / 2,
        y: rect.top - 4,
      };
    } else {
      tooltipKey.value = null;
    }
  }
  function handleCellLeave() {
    tooltipKey.value = null;
    tooltipViewportPos.value = null;
  }

  const sortState = ref<Record<string, string>>({});

  function handleSort(key: string) {
    const curr = sortState.value[key];
    const desc = curr ? curr.split('-')[1] === 'asc' : false;
    if (expandKeys.value.some((item) => item.startsWith(key))) {
      dataKeys.value.forEach((item) => {
        delete sortState.value[item];
      });
    } else {
      expandKeys.value.forEach((item) => {
        delete sortState.value[item];
      });
      dataKeys.value.forEach((item) => {
        delete sortState.value[item];
      });
    }
    sortState.value[key] = key + (desc ? '-desc' : '-asc');
    if (props.promiseFunc) {
      // 先同步通知父组件最新的排序状态（emit 是同步调用，父组件会立即更新 sortOrders），
      // 再由本组件自身触发数据刷新，避免父组件调用 expose 的 getList 把 sortState 重置掉。
      emit('sort', sortState.value);
      getList();
    } else {
      getList();
    }
  }

  function toggleExpand(nodeKey: string, column: Column) {
    const field = column.key;
    if (!dataMap.value[field]) {
      dataMap.value[field] = [];
    }
    const isExpend =
      (dataMap.value[field] || []).some((item) => nodeKey.startsWith(item)) &&
      displayField.value
        .filter((_, index) => index < displayField.value.length - 1)
        .includes(column.key);
    if (isExpend) {
      const index = expandKeys.value.findIndex((key) => key === column.key);
      const keys = expandKeys.value.filter((_, i) => i <= index - 1);
      Object.keys(dataMap.value)
        .filter((key) => !keys.includes(key))
        .forEach((currStr) => {
          const newKey = nodeKey
            .split('|')
            .filter((_, currentIndex) => currentIndex <= index)
            .join('|');
          if (dataMap.value[currStr].some((item) => item.startsWith(newKey))) {
            dataMap.value[currStr] = dataMap.value[currStr].filter(
              (str) => !str.startsWith(newKey),
            );
          }
        });
      displayField.value = expandKeys.value.filter((_, i) => i < index + 2);
    } else {
      dataMap.value[field].push(nodeKey);
    }
    const str = Object.values(dataMap.value)
      .map((item) => {
        return item.reduce((prev, cur) => {
          return Math.max(prev, cur.split('|').length);
        }, 0);
      })
      .reduce((prev, cur) => {
        return Math.max(prev, cur);
      }, 0);
    const newStrList = expandKeys.value.filter((_, index) => index < str + 1);
    displayField.value = newStrList;
    getList();
  }

  const currentQueryParams = inject('currentQueryParams') as Ref<Partial<FilterQueryParams>>;

  // a-table 树形数据需要唯一 rowKey，否则同层级行共用同一个 key，
  // 展开一行会把整层一起展开。这里为每个节点打上稳定唯一的 __rowKey。
  function stampTreeKeys(nodes: Record<string, any>[], parentKey = '') {
    return (nodes || []).map((node, index) => {
      const rowKey = node.nodeKey ?? `${parentKey}${parentKey ? '|' : ''}${index}`;
      const stamped: Record<string, any> = { ...node, __rowKey: rowKey };
      if (Array.isArray(node.children) && node.children.length) {
        stamped.children = stampTreeKeys(node.children, rowKey);
      }
      return stamped;
    });
  }
  function getRowKey(record: Record<string, any>) {
    if (props.rowKeyField) return record[props.rowKeyField];
    return record.__rowKey ?? record.nodeKey ?? record.key;
  }

  // total 行整行高亮（绿色底 + 绿色边框）
  function getRowClassName(record: Record<string, any>) {
    return record.nodeType === 'TOTAL' ? 'tree-table__total-row' : '';
  }

  const sortOrders = computed(() => {
    const arr: string[] = [];
    expandKeys.value.forEach((key) => {
      const values = Object.values(sortState.value) as string[];
      if (values.some((item: string) => item.startsWith(key))) {
        arr.push(values.find((item: string) => item.startsWith(key)) as string);
      }
    });
    if (arr.length > 0) {
      return arr;
    }
    return Object.values(sortState.value);
  });

  const loading = ref(false);
  async function getList() {
    loading.value = true;
    try {
      // 父组件传入 promiseFunc 且其返回了 Promise 时，数据完全由其托管；
      // 若 promiseFunc 返回 false（父组件表示该 tabType 不接管），则继续走组件内置查询。
      if (typeof props.promiseFunc === 'function') {
        const result = props.promiseFunc();
        if (result) {
          const { tableData, totalNum } = await result;
          treeTableData.value = stampTreeKeys(tableData || []);
          total.value = totalNum || 0;
          return;
        }
      }
      // 未传 promiseFunc（或其返回 false）：根据 tabType 走组件内置的查询
      const expandedKeys = (Object.values(dataMap.value) as string[][]).reduce(
        (prev: string[], cur: string[]) => {
          return [...prev, ...cur];
        },
        [] as string[],
      );
      if (props.tabType === '5') {
        // 新媒体矩阵明细
        const res = await queryConditionMediaList({
          ...currentQueryParams.value,
          sortOrders: sortOrders.value,
          pageSize: maxTotal.value,
          pageNum: pageNum.value,
          expandedKeys,
        });
        total.value = res.data.page.total;
        treeTableData.value = res.data.rows || [];
      } else {
        // 线索渠道明细 / 未下发 / 未建档 / 战败原因 等
        const res = await queryDetailTableData({
          tabType: props.tabType,
          ...currentQueryParams.value,
          sortOrders: sortOrders.value,
          pageSize: maxTotal.value,
          pageNum: pageNum.value,
          displayFields: displayField.value,
          expandedKeys,
        });
        total.value = res.data.page.total;
        treeTableData.value = res.data.rows || [];
      }
    } catch (error) {
      console.error('getList error:', error);
    } finally {
      loading.value = false;
    }
  }
  function toggleExpandAll(column: Column) {
    if (!headerFields.value.includes(column.key)) {
      const idx = expandKeys.value.indexOf(column.key);
      displayField.value = expandKeys.value.filter((_, index) => index < idx + 2);
      headerFields.value = Array.from(new Set([...displayField.value, column.key]));
    } else {
      const idx = displayField.value.indexOf(column.key);
      headerFields.value = displayField.value.filter((_, index) => index < idx);
      displayField.value = displayField.value.filter((_, index) => index < idx + 1);
    }
    initList();
  }
  function initList() {
    const promiseFunc = props.tabType === '5' ? queryMatrixOptionsData : queryDisplayFieldOptions;
    promiseFunc({
      ...currentQueryParams.value,
      pageSize: maxTotal.value,
      pageNum: pageNum.value,
      tabType: props.tabType,
      displayFields: displayField.value.filter((_, index) => index < displayField.value.length - 1),
    }).then((res) => {
      const { nodes } = res.data;
      dataMap.value = nodes.reduce(
        (prev, cur) => {
          return {
            ...prev,
            [cur.field]: [...(prev[cur.field] || []), cur.nodeKey],
          };
        },
        {} as Record<string, string[]>,
      );
      getList();
    });
  }
  defineExpose({
    initList() {
      pageNum.value = 1;
      sortState.value = {};
      dataMap.value = {};
      displayField.value = [expandKeys.value[0]];
      headerFields.value = [];
      getList();
    },
    getList,
  });
</script>

<style lang="less" scoped>
  .tree-table {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    padding-top: 20px;

    &__title {
      display: flex;
      align-items: center;
      margin-bottom: 12px;

      .title-bar {
        width: 3px;
        height: 14px;
        margin-right: 8px;
        border-radius: 2px;
        background: #3b82f6;
      }

      .title-text {
        color: #17375e;
        font-family: MiSans-Normal;
        font-size: 18px;
      }
    }

    &__content {
      flex: 1;

      &::-webkit-scrollbar {
        height: 8px;
      }

      &::-webkit-scrollbar-thumb {
        border-radius: 4px;
        background: #4f81bd;
      }

      &::-webkit-scrollbar-track {
        border-radius: 4px;
        background: #f0f0f0;
      }
    }

    .th-cell {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 6px;
    }

    .sort-icon {
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    .td-cell {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      color: #17375e;
      font-family: MiSans-Normal;
      font-size: 16px;
      font-weight: normal;
    }

    // isTooltip：单元格内容单行展示，超出省略号
    .td-cell--ellipsis {
      flex-wrap: nowrap;
      min-width: 0;
    }

    .td-cell__text--ellipsis {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      user-select: none;
    }

    .expand-btn {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-right: 8px;
      border-radius: 2px;
      color: #4f81bd;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      user-select: none;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 0;

      &__img {
        width: 220px;
        height: auto;
        margin-bottom: 12px;
      }
    }

    :deep(.ant-table-placeholder) {
      .ant-table-cell {
        padding: 0;
        border-bottom: none;
      }

      .ant-table-expanded-row-fixed {
        padding: 0;
      }
    }

    :deep(.ant-table) {
      border-color: #cedff0;
      font-size: 13px;

      .ant-table-thead > tr > th {
        padding: 10px 12px;
        border-color: #cedff0;
        background: #e4eefa;
        color: #17375e;
        font-weight: 500;
      }

      .ant-table-tbody > tr > td {
        padding: 9px 12px;
        border-color: #cedff0;
        color: #333;
      }

      .ant-table-container {
        border-color: #cedff0;
      }

      .ant-table-cell {
        border-color: #cedff0 !important;
      }

      // fix: fixed 列横向滚动时右侧列内容透出（含 hover 态）
      .ant-table-cell-fix-left,
      .ant-table-cell-fix-right {
        z-index: 2;
        background: #fff !important;
      }

      .ant-table-thead > tr > th.ant-table-cell-fix-left,
      .ant-table-thead > tr > th.ant-table-cell-fix-right {
        background: #e4eefa !important;
      }

      // 兼容 antdv v3/v4 两种 hover 实现：
      // v3 通过 tr:hover > td 触发；v4 给每个 td 加 .ant-table-cell-row-hover
      .ant-table-tbody > tr:hover > td.ant-table-cell-fix-left,
      .ant-table-tbody > tr:hover > td.ant-table-cell-fix-right,
      .ant-table-tbody > tr.ant-table-row-hover > td.ant-table-cell-fix-left,
      .ant-table-tbody > tr.ant-table-row-hover > td.ant-table-cell-fix-right,
      .ant-table-tbody > tr > td.ant-table-cell-fix-left.ant-table-cell-row-hover,
      .ant-table-tbody > tr > td.ant-table-cell-fix-right.ant-table-cell-row-hover,
      td.ant-table-cell-fix-left.ant-table-cell-row-hover,
      td.ant-table-cell-fix-right.ant-table-cell-row-hover {
        background: #fff !important;
      }

      // hover / 多选选中时，内容行（非合计行）背景色与字体颜色保持默认不变
      .ant-table-tbody > tr:not(.tree-table__total-row):hover > td,
      .ant-table-tbody > tr:not(.tree-table__total-row).ant-table-row-hover > td,
      .ant-table-tbody > tr:not(.tree-table__total-row) > td.ant-table-cell-row-hover,
      .ant-table-tbody > tr.ant-table-row-selected:not(.tree-table__total-row) > td,
      .ant-table-tbody > tr.ant-table-row-selected:not(.tree-table__total-row):hover > td,
      .ant-table-tbody
        > tr.ant-table-row-selected:not(.tree-table__total-row)
        > td.ant-table-cell-row-hover {
        background: #fff !important;
        color: #333 !important;
      }

      // type 为 total 的行整行高亮
      .ant-table-tbody > tr.tree-table__total-row > td {
        border-top: 1px solid #2ac465 !important;
        border-bottom: 1px solid #2ac465 !important;
        background: #eaf9f0 !important;
      }

      .ant-table-tbody > tr.tree-table__total-row > td:first-child {
        border-left: 1px solid #2ac465 !important;
      }

      .ant-table-tbody > tr.tree-table__total-row > td:last-child {
        border-right: 1px solid #2ac465 !important;
      }

      // 命中 highCol 的列：单元格背景高亮（覆盖 hover / fixed 列的白底）
      .ant-table-tbody > tr:not(.tree-table__total-row) > td.tree-table__high-col,
      .ant-table-tbody > tr:not(.tree-table__total-row):hover > td.tree-table__high-col,
      .ant-table-tbody
        > tr:not(.tree-table__total-row)
        > td.tree-table__high-col.ant-table-cell-row-hover {
        background: #f4f7fc !important;
      }
    }
  }
</style>

<style lang="less">
  // 自定义 tooltip：灰底白字，position:fixed 定位到 scale 容器坐标
  .tree-table__custom-tooltip {
    position: fixed;
    z-index: 99999;
    max-width: 240px;
    padding: 6px 8px;
    border-radius: 4px;
    background: #595959;
    color: #fff;
    font-size: 14px;
    pointer-events: none;
    user-select: none;

    &::after {
      content: '';
      position: absolute;
      bottom: -5px;
      left: 50%;
      margin-left: -5px;
      border-top: 5px solid #595959;
      border-right: 5px solid transparent;
      border-left: 5px solid transparent;
    }
  }
</style>
