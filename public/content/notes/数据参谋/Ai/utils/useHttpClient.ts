import { onUnmounted } from 'vue';
import { HttpClient } from './httpClient';

type MessageCallback = (data: any) => void;

/**
 * 基于 HttpClient 的 Vue 组合式封装
 * 组件挂载时自动建立 SSE 长连接，服务端有数据推送时回调，卸载时自动清理
 *
 * @param streamPath SSE 流地址
 * @param token      认证 token
 * @param callback   接收数据的回调函数
 * @returns { send, stop }  主动发送方法、终止连接方法
 *
 * @example
 * const { send, stop } = useSocket('/api/stream', token, (data) => {
 *   console.log('收到数据:', data);
 * });
 * send('/api/send', { message: 'hello' });
 * stop();
 */
export function useHttpClient(streamPath: string, token: string, callback: MessageCallback) {
  let client: HttpClient | null = null;

  const send = (sendPath: string, data: any): void => {
    client?.send(sendPath, data);
  };

  const stop = (): void => {
    if (client) {
      client.close();
      client = null;
    }
  };

  client = new HttpClient(streamPath, token);
  client.onMessage(callback);

  onUnmounted(() => {
    stop();
  });

  return { send, stop };
}
