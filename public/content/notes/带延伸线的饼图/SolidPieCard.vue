<!--
  运营效率 —— 实心饼图卡片
  · 外层统一用 CardComp 包裹（边框 + 标题条），标题右侧可选「更多」入口
  · 饼图为实心饼（内径 0，非圆环）
  · 引导线样式参考 efficiencyOverview/ApprovalDuration.vue：
    关闭 ECharts 自带 label/labelLine，改用 graphic 手绘
    「扇叶边缘 → 径向外移转折 → 水平延伸」的虚线折线 + 线末端空心圆 + 两行文字（数值 / 名称），
    并按容器宽高做防重叠展开与边界裁剪，保证标签不超出容器
-->
<template>
  <CardComp :title="title" class="solid-pie-card">
    <template #title>
      <div v-if="showMore" class="more-info" @click="emit('more-click')">
        <span class="info-span">更多</span>
        <img :src="moreIcon" alt="more" class="more-icon" />
      </div>
    </template>
    <!-- 数据为空或数值全为 0：与 DetailTableCard 的表格空态保持一致，展示暂无数据占位 -->
    <div v-if="isAllEmpty" class="pie-empty">
      <a-empty description="暂无数据" :image-style="{ height: '60px' }" />
    </div>
    <div v-else ref="chartRef" class="pie-chart"></div>
  </CardComp>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import * as echarts from '@/utils/lib/echarts';
  import CardComp from '@/views/kongguJww/smartTechnology/components/common/CardComp.vue';
  import moreIcon from '@/views/kongguJww/smartTechnology/images/show-detail.png';
  import { formatDisplayNumber } from '../../homeIndex/map/utils/formatDisplayNumber';

  defineOptions({ name: 'SolidPieCard' });

  /** 饼图数据项：颜色不传时按 DEFAULT_COLORS 顺序取色 */
  export interface SolidPieItem {
    name: string;
    value: number;
    breakdownItems?: { name: string; value: number }[];
    color?: string;
  }

  const props = withDefaults(
    defineProps<{
      /** 卡片标题（CardComp 标题条） */
      title?: string;
      data: SolidPieItem[];
      /** 数值单位，拼在标签数值后（如「万元」） */
      unit?: string;
      /** 是否显示标题右侧「更多」入口 */
      showMore?: boolean;
      /** 标签字号（px）；窄容器可调小 */
      fontSize?: number;
      /** 固定饼图半径（px）；不传时按标签宽度反推，保证标签不越界 */
      fixedRadius?: number;
    }>(),
    {
      title: '',
      unit: '',
      showMore: false,
      fontSize: 12,
      fixedRadius: undefined,
    },
  );

  const emit = defineEmits<{ (e: 'more-click'): void }>();

  /**
   * 空态判定：数据项为空，或所有数值都是 0/无效值（Number  falsy）。
   * 全 0 时 ECharts 扇区不可见、引导线也被 visibleItems 过滤，
   * 画出来只剩空白，因此统一改展示「暂无数据」占位。
   */
  const isAllEmpty = computed(
    () => !props.data.length || props.data.every((item) => !Number(item.value ?? 0)),
  );

  /** 与人员结构 / 审批时长饼图同一套蓝色系 */
  const DEFAULT_COLORS = ['#17375E', '#366092', '#4F81BD', '#95B3D7', '#B8CCE4'];

  const colorOf = (item: SolidPieItem, index: number) =>
    item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

  /**
   * 离屏 canvas 按真实字体测文本宽度。
   * 字体与渲染处严格一致：名称用 MiSans（常规），数值行用 MiSans-Medium + 600（加粗）。
   * 解决「字符数×字号」估算的两类偏差：数字/连字符被当中文全宽（名称高估→误折行）、
   * 中文单位与加粗数值被 0.6 倍低估（数值低估→牵引线偏短→显示不全）。
   */
  let measureCtx: CanvasRenderingContext2D | null | undefined;
  const getMeasureCtx = () => {
    if (measureCtx === undefined) {
      measureCtx =
        typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    }
    return measureCtx;
  };
  const measureTextWidth = (text: string, fontSize: number, bold: boolean) => {
    const ctx = getMeasureCtx();
    if (!ctx) return text.length * fontSize * (bold ? 0.6 : 1); // 无 canvas 环境兜底：退回估算
    ctx.font = `${bold ? '600 ' : ''}${fontSize}px ${bold ? 'MiSans-Medium' : 'MiSans'}`;
    return ctx.measureText(text).width;
  };

  /** 最宽标签的实际占位宽度（真实字体测宽），用于自适应半径推导 */
  const maxTextWidth = (fontSize: number) =>
    Math.max(
      ...props.data.map((item) =>
        Math.max(
          measureTextWidth(item.name, fontSize, false),
          measureTextWidth(`${formatDisplayNumber(item.value)}${props.unit}`, fontSize, true),
        ),
      ),
      0,
    );

  const chartRef = ref<HTMLElement>();
  let chartInstance: echarts.ECharts | null = null;

  function initChart() {
    // 数据清空/全 0 后随模板切回空态占位，chartRef 卸载——实例立即销毁，
    // 避免下次建图时拿到挂在已脱离 DOM 上的旧实例
    if (isAllEmpty.value) {
      chartInstance?.dispose();
      chartInstance = null;
      return;
    }
    if (!chartRef.value) return;
    if (!chartInstance) {
      chartInstance = echarts.init(chartRef.value);
    }

    const w = chartInstance.getWidth();
    const h = chartInstance.getHeight();
    if (!w || !h) return;

    const list = props.data;
    const colors = list.map((item, index) => colorOf(item, index));
    const labelTexts = list.map((item) => ({
      value: `${formatDisplayNumber(item.value)}${props.unit}`,
      name: item.name,
    }));

    const pad = 4; // 容器内边距
    const lineGap = 10; // 扇叶边缘 → 转折点的径向外移距离
    const horizLen = 12; // 水平段在文字宽度之外额外延伸的长度
    const textOffset = 6; // 线末端圆点 → 文字的水平间距
    const reserve = textOffset + horizLen + lineGap + pad; // 单个标签的横向固定开销
    const cx = w / 2;
    const cy = h / 2;

    // 中文/数字都按真实字体测宽：名称常规 MiSans，数值行加粗 MiSans-Medium
    let fs = props.fontSize;
    const measure = (lines: string[], value: string) =>
      Math.max(
        ...lines.map((l) => measureTextWidth(l, fs, false)),
        measureTextWidth(value, fs, true),
      );

    // ---- 半径：fixedRadius 生效时按固定值取（同尺寸容器下多个饼图等大） ----
    const outerR =
      props.fixedRadius != null
        ? Math.max(20, Math.min(props.fixedRadius, w / 2 - pad, h / 2 - pad))
        : Math.max(20, Math.min(w / 2 - (maxTextWidth(fs) + reserve), h / 2 - (fs + 4) - pad, 72));

    // ---- 标签排版：name 一律单行不折行；线长取 max(名称宽, 数值宽)，保证数值完整显示 ----
    // 仅当单行名称仍超出可用宽度时，才降级为「缩小字号 → 截断加省略号」（均不折行）。
    let nameLines = labelTexts.map((t) => [t.name]);
    if (props.fixedRadius != null && labelTexts.length) {
      const availW = Math.max(24, w / 2 - outerR - reserve);
      const needOf = (lines: string[][]) =>
        Math.max(...labelTexts.map((t, i) => measure(lines[i], t.value)));

      if (needOf(nameLines) > availW) {
        fs = Math.max(10, Math.floor((fs * availW) / needOf(nameLines)));
      }
      if (needOf(nameLines) > availW) {
        // 按真实宽度截断：逐字回退直到「前缀 + …」宽度不超过 availW（至少保留 1 字）
        const ellipsis = '…';
        const truncateToWidth = (line: string) => {
          if (measureTextWidth(line, fs, false) <= availW) return line;
          let cut = line.length;
          while (cut > 1 && measureTextWidth(line.slice(0, cut) + ellipsis, fs, false) > availW) {
            cut -= 1;
          }
          return line.slice(0, cut) + ellipsis;
        };
        nameLines = nameLines.map((lines) => lines.map(truncateToWidth));
      }
    }

    const textWidths = labelTexts.map((t, i) => measure(nameLines[i], t.value));
    const lineHeight = fs + 4; // 单行文字高度
    const maxLines = Math.max(1, ...nameLines.map((l) => l.length));
    const minGap = lineHeight * (maxLines + 1) + 4; // 单个标签占用的最小垂直间距

    const sum = list.reduce((s, d) => s + Number(d.value || 0), 0);
    const equalAngle = list.length > 0 ? (Math.PI * 2) / list.length : 0;

    // ---- 第一步：按角度算出每个扇叶的边缘点与径向转折点 ----
    let startAngle = -Math.PI / 2;
    // 值为 0（如 0.00）的扇区不可见，不生成引导线与文字
    const visibleItems = list
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => Number(item.value || 0) !== 0);
    const labels = visibleItems.map(({ item, index }) => {
      const angle = sum === 0 ? equalAngle : (Number(item.value || 0) / sum) * Math.PI * 2;
      const mid = startAngle + angle / 2;
      startAngle += angle;

      const cos = Math.cos(mid);
      const sin = Math.sin(mid);
      const edgeX = cx + outerR * cos;
      const edgeY = cy + outerR * sin;

      const isLeft = cos < 0;
      return {
        index,
        edgeX,
        edgeY,
        stubX: edgeX + lineGap * cos,
        stubY: edgeY + lineGap * sin,
        isLeft,
        dir: isLeft ? -1 : 1,
        // 水平段要横穿整段文字：长度 = 文字宽 + 圆点间距 + 额外延伸
        lineLen: textWidths[index] + textOffset + horizLen,
        labelY: edgeY + lineGap * sin, // 以转折点为基准做防重叠调整
      };
    });

    // ---- 第二步：左右分组，垂直方向防重叠展开（逻辑同 ApprovalDuration） ----
    const minY = lineHeight;
    const maxY = h - lineHeight;
    const spread = (group: typeof labels) => {
      if (!group.length) return;
      group.sort((a, b) => a.edgeY - b.edgeY);
      for (let i = 1; i < group.length; i++) {
        if (group[i].labelY - group[i - 1].labelY < minGap) {
          group[i].labelY = group[i - 1].labelY + minGap;
        }
      }
      const overflow = group[group.length - 1].labelY - maxY;
      if (overflow > 0) {
        for (let i = group.length - 1; i >= 0; i--) {
          group[i].labelY -= overflow;
          if (i < group.length - 1 && group[i + 1].labelY - group[i].labelY < minGap) {
            group[i].labelY = group[i + 1].labelY - minGap;
          }
        }
      }
      if (group[0].labelY < minY) {
        group[0].labelY = minY;
        for (let i = 1; i < group.length; i++) {
          if (group[i].labelY - group[i - 1].labelY < minGap) {
            group[i].labelY = group[i - 1].labelY + minGap;
          }
        }
      }
    };
    spread(labels.filter((d) => !d.isLeft));
    spread(labels.filter((d) => d.isLeft));

    // ---- 第三步：生成引导线 / 圆点 / 两行文字，横向做边界裁剪 ----
    const graphicElements: any[] = [];
    labels.forEach(({ index, edgeX, edgeY, stubX, isLeft, dir, lineLen, labelY }) => {
      // 内侧顶点按「文字最靠近圆心那一行处的圆盘外缘」钳位：文字在 labelY 上下还占
      // boxUp / boxDown 的垂直高度，只按 labelY 行算会让文字另一端压到圆盘或相邻引导线；
      // 这里取文字盒最靠近圆心的行求圆盘半宽，把整盒文字都推到圆盘之外。
      const boxUp = fs + 4;
      const boxDown = 2 + maxLines * (fs + 2);
      const dy = Math.max(0, labelY < cy ? cy - labelY - boxDown : labelY - cy - boxUp);
      const discHalf = Math.sqrt(Math.max(0, outerR * outerR - dy * dy));
      const innerX = isLeft
        ? Math.min(stubX, cx - discHalf - 2)
        : Math.max(stubX, cx + discHalf + 2);
      // 水平段从内侧顶点向外侧延伸到末端，圆点画在末端
      let endX = innerX + lineLen * dir;
      // 横向越界裁剪：只保证末端本身不出容器
      endX = isLeft ? Math.max(endX, pad) : Math.min(endX, w - pad);

      const color = colors[index];
      const text = labelTexts[index];
      // 文字按「外缘向外对齐」：数值行与名称行的外侧端对齐（左侧左对齐、右侧右对齐），
      // 锚点 = 内侧顶点向外平移整段文字宽度，文字占位范围保持不变
      const textX = isLeft
        ? innerX - textOffset - textWidths[index]
        : innerX + textOffset + textWidths[index];
      const textAlign = isLeft ? 'left' : 'right';

      graphicElements.push(
        {
          type: 'polyline',
          shape: {
            points: [
              [edgeX, edgeY],
              [innerX, labelY],
              [endX, labelY],
            ],
          },
          style: { stroke: color, fill: 'none', lineWidth: 1, lineDash: [4, 3] },
          silent: true,
        },
        {
          type: 'circle',
          shape: { cx: endX, cy: labelY, r: 3 },
          style: { fill: '#fff', stroke: color, lineWidth: 1 },
          silent: true,
        },
        {
          type: 'text',
          style: {
            text: text.value,
            x: textX,
            y: labelY - 2,
            fill: color,
            fontSize: fs,
            fontWeight: 600,
            fontFamily: 'MiSans-Medium',
            textAlign,
            textVerticalAlign: 'bottom',
          },
          silent: true,
        },
        {
          type: 'text',
          style: {
            text: nameLines[index].join('\n'),
            x: textX,
            y: labelY + 2,
            fill: color,
            fontSize: fs,
            lineHeight: fs + 2,
            fontFamily: 'MiSans',
            textAlign,
            textVerticalAlign: 'top',
          },
          silent: true,
        },
      );
    });

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        confine: true,
        // 让自定义 HTML 完全接管样式
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,71,103,0.12); border-radius:4px;',
        formatter: (params: any) => {
          // ===== 卡片整体 =====
          const cardStyle = [
            'box-sizing:border-box',
            'min-width:160px',
            'padding:12px 16px',
            'background:#fff',
            'border-radius:4px',
            'font-family:var(--font-family-regular)',
          ].join(';');

          // ===== 顶部标题（蓝条 + 文字） =====
          const titleWrapStyle = [
            'display:flex',
            'align-items:center',
            'gap:8px',
            'margin-bottom:10px',
          ].join(';');
          const barStyle = [
            'display:inline-block',
            'width:2px',
            'height:14px',
            'border-radius:2px',
            'background:#004567',
          ].join(';');
          const titleTextStyle = [
            'color:#17375E',
            'font-family:var(--font-family-medium)',
            'font-size:14px',
            'line-height:14px',
          ].join(';');
          const titleValueStyle = ['margin-left:8px'].join(';');

          // ===== 标题下方分隔线 229×1 #DBE5F1 =====
          const dividerStyle = [
            'width:229px',
            'height:1px',
            'margin-bottom:10px',
            'background:#DBE5F1',
            'opacity:1',
          ].join(';');

          // ===== 数据行（左项目名 / 右数值） =====
          const rowStyle = [
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'gap:24px',
            'line-height:22px',
          ].join(';');
          const nameStyle = [
            'color:#4F81BD',
            'font-family:var(--font-family-regular)',
            'font-size:16px',
            'line-height:16px',
          ].join(';');
          const valueStyle = [
            'color:#17375E',
            'font-family:var(--font-family-medium)',
            'font-size:14px',
          ].join(';');

          // 向下展开当前扇区的分解项
          const breakdown = params.data?.breakdownItems || [];

          let html = `<div style="${cardStyle}">`;
          html += `<div style="${titleWrapStyle}">`;
          html += `<span style="${barStyle}"></span>`;
          html += `<span style="${titleTextStyle}">${params.name}</span>`;
          html += `<span style="${titleTextStyle}${titleValueStyle ? ';' + titleValueStyle : ''}">${formatDisplayNumber(params.value)}${props.unit}</span>`;
          html += `</div>`;
          if (breakdown.length) {
            html += `<div style="${dividerStyle}"></div>`;
          }

          breakdown.forEach((b: { name: string; value: number }) => {
            html += `<div style="${rowStyle}">`;
            html += `<span style="${nameStyle}">${b.name}</span>`;
            html += `<span style="${valueStyle}">${formatDisplayNumber(b.value)}${props.unit}</span>`;
            html += `</div>`;
          });

          html += `</div>`;
          return html;
        },
      },
      series: [
        {
          type: 'pie',
          // 内径 0 → 实心饼图
          radius: [0, outerR],
          center: [cx, cy],
          // 标签与引导线全部由 graphic 手绘，关闭 ECharts 自带的
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scaleSize: 4 },
          data: list.map((item, index) => ({
            name: item.name,
            value: item.value,
            breakdownItems: item.breakdownItems,
            itemStyle: { color: colors[index] },
          })),
        },
      ],
      graphic: { elements: graphicElements },
    };

    chartInstance.setOption(option, true);
    // 空数据期间占位图替换了 chartRef，恢复数据后这里重新接管尺寸观测
    observeChartResize();
  }

  // 容器尺寸变化时需重算像素坐标，保证缩放后标签仍完整不越界
  let resizeObserver: ResizeObserver | null = null;

  /** 挂载/重建观测：空态→恢复数据时 chartRef 是新 DOM，需要重新 observe */
  function observeChartResize() {
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver ??= new ResizeObserver(() => requestAnimationFrame(() => initChart()));
    if (chartRef.value) resizeObserver.observe(chartRef.value);
  }

  // flush: 'post'：数据为空时模板切到 a-empty 占位，恢复数据后要等 chartRef
  // 挂回 DOM 再建图，pre 时机 chartRef 还是 null，图会一直空着
  watch(() => props.data, initChart, { deep: true, flush: 'post' });
  watch(() => props.fixedRadius, initChart, { flush: 'post' });

  onMounted(() => {
    initChart();
    observeChartResize();
    window.addEventListener('resize', initChart);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', initChart);
    resizeObserver?.disconnect();
    resizeObserver = null;
    chartInstance?.dispose();
    chartInstance = null;
  });
</script>

<style scoped lang="scss">
  .solid-pie-card {
    :deep(.card-comp) {
      display: flex;
      box-sizing: border-box;
      flex-direction: column;
      height: 100%;
    }
  }

  .pie-chart {
    flex: 1;
    width: 100%;
    min-height: 0;
    margin-top: 8px;
  }

  // 空态占位：与 .pie-chart 同一占位区域，内容垂直水平居中
  .pie-empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 0;
    margin-top: 8px;
  }

  // 「更多」入口（与 KeyTrendCard / IndicatorCard 的 more-info 保持一致）
  .more-info {
    display: flex;
    align-items: center;
    height: 28px;
    margin-top: 2px;
    cursor: pointer;
    gap: 8px;

    .info-span {
      color: #4f81bd;
      font-family: var(--font-family-regular);
      font-size: 14px;
      white-space: nowrap;
    }

    .more-icon {
      width: 10px;
      height: 10px;
    }
  }
</style>
