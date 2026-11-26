import hljs from 'highlight.js/lib/common'
import { useMemo } from 'react'
import { Button, message } from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import '@/styles/hljs.css'

interface Props {
  code: string
  lang: string
  /** 提供后展示下载按钮 */
  downloadUrl?: string
  maxHeight?: number | string
}

/** vue 是类 html 模板，hljs/common 里没有对应语言，映射到 xml */
function hlLang(lang: string): string {
  return hljs.getLanguage(lang) ? lang : 'xml'
}

export default function CodeBlock({ code, lang, downloadUrl, maxHeight = 560 }: Props) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(code, { language: hlLang(lang) }).value
    } catch {
      return code
    }
  }, [code, lang])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败，请手动选择复制')
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--code-bg)',
        border: '1px solid rgba(128,128,128,0.15)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 1 }}>
        <Button size="small" icon={<CopyOutlined />} onClick={copy}>
          复制
        </Button>
        {downloadUrl && (
          <Button size="small" icon={<DownloadOutlined />} href={downloadUrl} download>
            下载
          </Button>
        )}
      </div>
      <pre style={{ margin: 0, padding: 16, overflow: 'auto', maxHeight }} dir="ltr">
        <code
          className={`hljs language-${lang}`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre',
            display: 'block',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  )
}
