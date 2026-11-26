import axios from 'axios';
import { normalizeInsight } from './ansXmlParser';

const BASE_URL =
  import.meta.env.VITE_COMMON_ENV === 'test'
    ? 'https://test-kpi.cheryholding.com'
    : 'https://kpi.cheryholding.com';

type MessageHandler = (data: any) => void;

/**
 * HTTP SSE 长连接封装（替代 WebSocket）
 * 通过 axios + ReadableStream 接收服务端 SSE 推送，通过 POST 发送消息
 *
 * @param streamPath SSE 流地址，如 '/data-agent/task/123/result/stream'
 * @param token      认证 token
 *
 * @example
 * const client = new HttpClient('/api/stream', token);
 * client.onMessage((data) => { ... });
 * client.send('/api/send', { message: 'hello' });
 * client.close();
 */
export class HttpClient {
  private abortController: AbortController | null = null;
  private messageHandler: MessageHandler | null = null;
  private token: string;

  constructor(streamPath: string, token: string) {
    this.token = token;
    this.connect(streamPath);
  }

  private async connect(streamPath: string): Promise<void> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(BASE_URL + streamPath, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'text/event-stream',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            if (this.messageHandler) {
              this.messageHandler({ done: true });
            }
            this.abortController?.abort();
            return;
          }
          if (!data) continue;
          try {
            const body = JSON.parse(data).body || {};
            if (this.messageHandler && body.error) {
              this.messageHandler(body);
              continue;
            }
            const messageData = this.parseData(body);
            if (
              this.messageHandler &&
              (messageData.content ||
                messageData.type ||
                messageData.insights ||
                messageData.questions)
            ) {
              this.messageHandler(messageData);
            }
          } catch (e) {
            console.error('[HttpClient] JSON 解析失败', data, e);
          }
        }
      }
      if (this.messageHandler) {
        this.messageHandler({ done: true });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[HttpClient] 流读取错误', err);
      if (this.messageHandler) {
        this.messageHandler({ done: true, error: true });
      }
    }
  }

  parseData(body: any) {
    const category = body.category;

    // 1. agent_reply: Agent 确认收到消息
    if (category === 'agent_reply') {
      try {
        const reply = JSON.parse(body.content);
        return { type: 'agent_reply', content: decodeURIComponent(reply.content) };
      } catch {
        return { type: 'agent_reply', content: body.content };
      }
    }

    // 2. llm: LLM 推理输出（delta 逐字流 / data 完整汇总）
    if (category === 'llm') {
      return { type: 'llm', content: body.content, event_type: body.event_type };
    }

    // 3. task_finish: 任务完成，返回洞察卡片
    if (category === 'task_finish') {
      try {
        const parsed = JSON.parse(body.content);
        if (Array.isArray(parsed)) {
          return { type: 'task_finish', insights: parsed.map(normalizeInsight) };
        }
        return { type: 'task_finish', content: body.content };
      } catch {
        return { type: 'task_finish', content: body.content };
      }
    }

    // 4. recommended_question: 推荐追问
    if (category === 'recommended_question') {
      try {
        const data = JSON.parse(body.content);
        return { type: 'recommended_question', questions: data.questions };
      } catch {
        return { type: 'recommended_question', content: body.content };
      }
    }

    // 5. content: 流结束标记（SSE_FINISH）
    if (category === 'content') {
      return { type: 'finish' };
    }

    // 6. gateway_reply：网关确认
    if (category === 'gateway_reply') {
      return { type: 'gateway_reply', content: decodeURIComponent(body.content) };
    }

    return {};
  }

  /**
   * 注册接收消息的回调
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * POST 发送消息
   * @param sendPath 发送路径
   * @param data     请求体
   */
  async send(sendPath: string, data: any): Promise<void> {
    await axios.post(BASE_URL + sendPath, data, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    });
  }

  /**
   * 关闭 SSE 连接
   */
  close(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.messageHandler = null;
  }
}
