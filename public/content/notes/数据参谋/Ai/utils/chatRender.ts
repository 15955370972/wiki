import showdown from 'showdown';
import { isAnsXml, type InsightItem } from './ansXmlParser';

export interface MessageItem {
  /** 消息唯一标识，用作 v-for key（历史消息由 setMessages 注入） */
  id: string;
  type: 'ask' | 'question' | 'status';
  message: string;
  insights?: InsightItem[];
  messageId?: string;
  feedback?: string;
  feedbackContent?: string;
  // 卡片一（思考过程）是否折叠
  collapsed?: boolean;
  // 错误消息：纯文本展示在正文卡片，不进入思考过程卡片
  isError?: boolean;
}

/** 外部传入的消息结构（id 由 createMessage 注入） */
export type MessageInit = Omit<MessageItem, 'id'> & { id?: string };

let uid = 0;
export function nextMessageId(): string {
  uid += 1;
  return `msg_${uid}`;
}

export function createMessage(init: MessageInit): MessageItem {
  return { ...init, id: init.id || nextMessageId() } as MessageItem;
}

const converter = new showdown.Converter({
  tables: true,
  strikethrough: true,
  simpleLineBreaks: true,
  simplifiedAutoLink: true,
});

// —— 缓存上限：超出后按插入顺序淘汰（整场会话历史消息有限，一般到不了上限）——
const CACHE_MAX = 300;

/** 未缓存的 markdown → html（流式 delta 使用，每次内容都不同，不入缓存） */
export function makeHtml(md: string): string {
  return converter.makeHtml(md);
}

/**
 * 缓存版 markdown → html：历史消息内容不变，只在最终态算一次，
 * 之后即使父组件每帧重渲染也只做一次 Map 命中查找
 */
const htmlCache = new Map<string, string>();
export function makeHtmlCached(md?: string): string {
  if (!md) return '';
  const hit = htmlCache.get(md);
  if (hit !== undefined) return hit;
  const html = converter.makeHtml(md);
  if (htmlCache.size >= CACHE_MAX) {
    const first = htmlCache.keys().next();
    if (!first.done) htmlCache.delete(first.value);
  }
  htmlCache.set(md, html);
  return html;
}

/** 缓存版 isAnsXml：避免每次渲染对长字符串重复跑正则 */
const ansXmlCache = new Map<string, boolean>();
export function isAnsXmlCached(md?: string): boolean {
  if (!md) return false;
  const hit = ansXmlCache.get(md);
  if (hit !== undefined) return hit;
  const flag = isAnsXml(md);
  if (ansXmlCache.size >= CACHE_MAX) {
    const first = ansXmlCache.keys().next();
    if (!first.done) ansXmlCache.delete(first.value);
  }
  ansXmlCache.set(md, flag);
  return flag;
}

/** 卡片一：纯文本（markdown）回答 */
export function hasPlainText(item: MessageItem) {
  return item.type === 'question' && !item.isError && !!item.message && !isAnsXmlCached(item.message);
}

/** 卡片二：结构化回答（AnsCard）或洞察卡片（InsightCard） */
export function hasRichCard(item: MessageItem) {
  return (!!item.message && isAnsXmlCached(item.message)) || !!item.insights?.length;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/** 取 html 中最后一行文本（按 <br>/<p> 换行边界切分），用于折叠态单行打字机预览 */
export function getLastLineText(html: string): string {
  const lines = html
    .split(/<br\s*\/?>|<\/p>|<p[^>]*>/i)
    .map((line) => stripHtml(line).trim())
    .filter((line) => !!line);
  return lines.length ? lines[lines.length - 1] : '';
}
