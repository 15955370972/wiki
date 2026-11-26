/**
 * 无损格式化接口数值文本：只为整数部分添加千分位，小数文本与尾随零保持不变。
 * @param value 接口原始数值；空值返回占位符，非数值文本原样返回。
 * @returns 添加千分位后的可展示文本。
 */
export function formatDisplayNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '--';
  const source = String(value);
  const match = source.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!match || (!match[2] && match[3] === undefined)) return source;

  const [, sign, integerPart, decimalPart] = match;
  const groupedInteger = (integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalPart === undefined
    ? `${sign}${groupedInteger}`
    : `${sign}${groupedInteger}.${decimalPart}`;
}
