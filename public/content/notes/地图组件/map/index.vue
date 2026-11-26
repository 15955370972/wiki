<!--
 * @Description: 智能科技首页地图模块（mock 数据驱动，世界→中国→省份三级下钻）
-->
<template>
  <a-spin wrapper-class-name="map-spin" :spinning="!isReady">
    <div class="map-wrapper">
      <MapChart :data="mapDataset" :options="options" :interaction="{ drill: isDrillable }" />
      <MapCard
        :tab-type="mapType"
        :tabs="tabs"
        :active-tab-index="activeTabIndex"
        @tab-change="handleTabClick"
      />
    </div>
  </a-spin>
</template>

<script setup lang="ts">
  import {
    ComponentInternalInstance,
    computed,
    getCurrentInstance,
    inject,
    Ref,
    ref,
    watch,
  } from 'vue';
  import MapChart, {
    type MapChartOptions,
    type MapDataset,
    type ProvinceData,
    type WorldCountryData,
  } from './MapChart.vue';
  import MapCard from '../MapCard.vue';

  import { tabClick } from '@/shared/cockpit/index.js';
  import { FilterQueryParams } from '../FilterForm.vue';
  import { fetchMapCountries, fetchMapProvinces } from '@/api/zk/home.js';

  defineOptions({ name: 'SmartTechHomeMap' });

  /** 顶部 Tab 项 */
  const tabs = ['经营数据', '销量分布'];
  const activeTabIndex = ref(0);
  const eventTabs = computed(() => {
    return tabs.map((item, index) => ({ key: index, title: item }));
  });

  const app = getCurrentInstance();
  tabClick(activeTabIndex, eventTabs, '', app as ComponentInternalInstance);

  function handleTabClick(index: number) {
    activeTabIndex.value = index;
  }

  const isReady = ref(true);
  const isDrillable = computed(() => activeTabIndex.value === 1 && isReady.value);

  const options: MapChartOptions = {
    tooltip: {
      // 合计收入已在两种视图统一关闭，因此不再配置 totalLabel / showTotal；
      // 分项标签改由 mapData/worldData.revenueItems[i].key 自定义，不再提供 cateringLabel 等固定分项标签
      unit: '万元',
    },
    scatter: {
      // 默认散点颜色与商社 SocietyWorldMapPanel 对齐；可通过 options.scatter.color 全局覆盖
      rippleScale: 2.6,
      ripplePeriod: 4.4,
    },
    visual: {
      // 区域底色、边界色、hover 色 渐变档色，均可在 options.visual 中调整
      // 例如把视觉映射换成红色系：visualColors: [...]
    },
  };

  const currentQueryParams = inject<Ref<FilterQueryParams>>(
    'currentQueryParams',
  ) as Ref<FilterQueryParams>;
  const mapType = computed(() => (activeTabIndex.value === 0 ? 'BUSINESS' : 'SALES'));

  // [
  //   { name: '中国', unit: '万元', revenueItems: [{ key: '销量', value: 29240 }] },
  //   { name: '美国', unit: '万元', revenueItems: [{ key: '销量', value: 25400 }] },
  // ];
  const worldData = ref<WorldCountryData[]>([]);

  // [{
  //   provinceName: '安徽省',
  //   unit: '万元',
  //   revenueItems: [
  //     { key: '007', value: 1280 },
  //     { key: 'MINI卡', value: 860 },
  //     { key: '探索06', value: 540 },
  //   ],
  //   baseList: [
  //     {
  //       baseName: '合肥',
  //       sortOrder: 1,
  //       unit: '万元',
  //       revenueItems: [
  //         { key: '007', value: 520 },
  //         { key: 'MINI卡', value: 360 },
  //         { key: '探索06', value: 210 },
  //       ],
  //     },
  //     {
  //       baseName: '芜湖',
  //       sortOrder: 2,
  //       unit: '万元',
  //       revenueItems: [
  //         { key: '007', value: 380 },
  //         { key: 'MINI卡', value: 260 },
  //         { key: '探索06', value: 180 },
  //       ],
  //     },
  //   ],
  // }]
  const mapData = ref<ProvinceData[]>([]);

  /** 合并后的地图数据集：world 可选、provinces 必传 */
  const mapDataset = computed<MapDataset>(() => ({
    world: worldData.value,
    provinces: mapData.value,
  }));

  function loadMap() {
    const params = {
      ...currentQueryParams.value,
      mapType: mapType.value,
    };
    isReady.value = false;
    worldData.value = [];
    mapData.value = [];
    Promise.all([fetchMapCountries(params), fetchMapProvinces(params)])
      .then(([res1, res2]) => {
        isReady.value = true;

        const list = res1.data?.countries || [];
        worldData.value = list.map((item) => ({
          ...item,
          name: item.countryName || '',
        }));

        mapData.value = res2.data?.provinces || [];
      })
      .catch(() => {
        isReady.value = true;
      });
  }
  watch([() => currentQueryParams?.value, () => activeTabIndex.value], loadMap, {
    immediate: true,
  });

  // 仅供 IDE 推断类型 / 父级组件透传字段参考
  export type { WorldCountryData, MapChartOptions };
</script>

<style scoped lang="scss">
  .map-spin {
    width: 100%;
    min-width: 0;

    :deep(.ant-spin-container) {
      width: 100%;
      min-width: 0;
    }
  }

  .map-wrapper {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 696px;
    border: 1px solid #cedff0;
  }
</style>
