export interface AnsItem {
  label: string;
  summary: string;
  data: string;
  type: string;
  x: string;
  y: string;
  success: boolean;
}

export interface AnsRoot {
  items: AnsItem[];
}

interface FeishuCardHeader {
  title: { tag: 'plain_text'; content: string };
  template: 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'wathet';
}

interface FeishuCardElement {
  tag: string;
  [key: string]: any;
}

export interface FeishuInteractiveCard {
  config: { wide_screen_mode: boolean; enable_forward?: boolean };
  header?: FeishuCardHeader;
  elements: FeishuCardElement[];
}

export interface InsightData {
  columns: string[];
  data: (string | number)[][];
}

export interface InsightItem {
  title: string;
  summary: string;
  chart_type: 'number' | 'bar' | 'line' | 'pie' | 'table';
  data: InsightData;
  x?: string;
  y?: string;
}

function parseInsightData(raw: string): InsightData {
  if (!raw) return { columns: [], data: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.columns && Array.isArray(parsed.data)) {
      return { columns: parsed.columns, data: parsed.data };
    }
    return { columns: [], data: [] };
  } catch {
    if (/^result_df|^df_|^dataframe/i.test(raw.trim())) {
      return { columns: [], data: [] };
    }
    return { columns: [], data: [] };
  }
}

export function normalizeInsight(item: any): InsightItem {
  let title = item.title || '';
  let summary = item.summary || '';
  let chart_type = item.chart_type || 'table';
  let x = item.x || undefined;
  let y = item.y || undefined;
  let data = typeof item.data === 'string' ? parseInsightData(item.data) : (item.data || { columns: [], data: [] });

  if (summary && isAnsXml(summary)) {
    try {
      const ansRoot = parseAnsXml(summary);
      if (ansRoot.items.length > 0) {
        const ansItem = ansRoot.items[0];
        if (!title) title = ansItem.label;
        summary = ansItem.summary;
        if (!item.chart_type && ansItem.type) chart_type = ansItem.type as InsightItem['chart_type'];
        if (!item.x && ansItem.x) x = ansItem.x;
        if (!item.y && ansItem.y) y = ansItem.y;
        if (ansItem.data) {
          data = parseInsightData(ansItem.data);
        }
      }
    } catch {}
  }

  return {
    title,
    summary,
    chart_type,
    data,
    x,
    y,
  };
}

function splitPlainText(text: string): { title: string; summary: string } {
  const trimmed = text.trim();
  const splitRe = /[。！？\n]/;
  const match = splitRe.exec(trimmed);
  if (!match) {
    return { title: trimmed, summary: '' };
  }
  const endIdx = match.index + match[0].length;
  const candidate = trimmed.slice(0, endIdx).trim();
  if (candidate.length >= 8 && candidate.length <= 60) {
    return {
      title: candidate,
      summary: trimmed.slice(endIdx).trim(),
    };
  }
  if (match.index > 60) {
    return { title: trimmed.slice(0, match.index).trim(), summary: trimmed.slice(match.index).trim() };
  }
  return { title: trimmed.slice(0, 30).trim(), summary: trimmed };
}

function parseXmlToInsights(xmlString: string): InsightItem[] {
  const ansRoot = parseAnsXml(xmlString);
  return ansRoot.items.map((item) => ({
    title: item.label,
    summary: item.summary,
    chart_type: (item.type || 'bar') as InsightItem['chart_type'],
    data: parseInsightData(item.data),
    x: item.x || undefined,
    y: item.y || undefined,
  }));
}

/**
 * 解析 task_finish 的 content，按优先级：JSON 数组 → XML → 普通字符串
 */
export function parseTaskFinishContent(content: string): InsightItem[] {
  if (!content) return [];
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeInsight);
    }
  } catch {}

  if (isAnsXml(trimmed)) {
    return parseXmlToInsights(trimmed);
  }

  if (trimmed.length < 8) return [];

  const { title, summary } = splitPlainText(trimmed);
  return [
    {
      title,
      summary,
      chart_type: 'table',
      data: { columns: [], data: [] },
    },
  ];
}

export function parseAnsXml(xmlString: string): AnsRoot {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`ANS XML 解析失败: ${parseError.textContent}`);
  }

  const itemElements = doc.querySelectorAll('i');
  const items: AnsItem[] = [];

  itemElements.forEach((el) => {
    const getText = (tag: string) => el.querySelector(tag)?.textContent ?? '';

    items.push({
      label: getText('l'),
      summary: getText('s'),
      data: getText('d'),
      type: getText('t'),
      x: getText('x'),
      y: getText('y'),
      success: getText('f') === 'true',
    });
  });

  return { items };
}

export function ansToFeishuCard(xmlString: string): FeishuInteractiveCard {
  const root = parseAnsXml(xmlString);
  const elements: FeishuCardElement[] = [];

  root.items.forEach((item, idx) => {
    if (idx > 0) {
      elements.push({ tag: 'hr' });
    }

    if (item.label) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${escapeLarkMd(item.label)}**`,
        },
      });
    }

    if (item.summary) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: item.summary,
        },
      });
    }

    if (item.data) {
      try {
        const jsonData = JSON.parse(item.data);
        elements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `\`\`\`json\n${JSON.stringify(jsonData, null, 2)}\n\`\`\``,
          },
        });
      } catch {
        elements.push({
          tag: 'div',
          text: { tag: 'plain_text', content: item.data },
        });
      }
    }
  });

  const allSuccess = root.items.every((i) => i.success);
  const anyFail = root.items.some((i) => !i.success);

  const card: FeishuInteractiveCard = {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    elements,
  };

  if (root.items.length > 0 && root.items[0].label) {
    card.header = {
      title: {
        tag: 'plain_text',
        content: root.items[0].label,
      },
      template: anyFail ? 'red' : allSuccess ? 'green' : 'blue',
    };
  }

  return card;
}

export function isAnsXml(content: string): boolean {
  return /^\s*<ans>/i.test(content.trim());
}

export function ansToHtml(xmlString: string): string {
  const root = parseAnsXml(xmlString);

  const parts: string[] = [];

  root.items.forEach((item) => {
    const isError = !item.success;

    parts.push('<div class="ans-card">');

    if (item.label) {
      parts.push(
        `<div class="ans-card-header ${isError ? 'ans-card-error' : 'ans-card-success'}">`,
        `<span class="ans-card-icon">${isError ? '&#9888;' : '&#10004;'}</span>`,
        `<span class="ans-card-label">${item.label}</span>`,
        `</div>`,
      );
    }

    if (item.summary) {
      parts.push(`<div class="ans-card-summary">${item.summary}</div>`);
    }

    if (item.data) {
      try {
        const jsonData = JSON.parse(item.data);
        parts.push(
          `<pre class="ans-card-data"><code>${JSON.stringify(jsonData, null, 2)}</code></pre>`,
        );
      } catch {
        parts.push(`<div class="ans-card-data">${item.data}</div>`);
      }
    }

    parts.push('</div>');
  });

  return parts.join('');
}

function escapeLarkMd(text: string): string {
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
}
