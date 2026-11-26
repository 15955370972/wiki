/*
 * @Description: 省份名称到AD码的映射
 * @Author: chenpei <chenpei15.supplier@mychery.com>
 * @Date: 2026-06-11 16:05:09
 * @LastEditors: chenpei <chenpei15.supplier@mychery.com>
 * @LastEditTime: 2026-06-25 10:38:43
 */
export const provinceAdcodeMap: Record<string, string> = {
  北京: '110000',
  天津: '120000',
  河北: '130000',
  山西: '140000',
  内蒙古: '150000',
  辽宁: '210000',
  吉林: '220000',
  黑龙江: '230000',
  上海: '310000',
  江苏: '320000',
  浙江: '330000',
  安徽: '340000',
  福建: '350000',
  江西: '360000',
  山东: '370000',
  河南: '410000',
  湖北: '420000',
  湖南: '430000',
  广东: '440000',
  广西: '450000',
  海南: '460000',
  重庆: '500000',
  四川: '510000',
  贵州: '520000',
  云南: '530000',
  西藏: '540000',
  陕西: '610000',
  甘肃: '620000',
  青海: '630000',
  宁夏: '640000',
  新疆: '650000',
  台湾: '710000',
};

export function getAdcode(provinceName: string): string | undefined {
  return provinceAdcodeMap[provinceName];
}
