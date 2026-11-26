import { useEffect, useMemo, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button, Empty, InputNumber, Space, Spin, Typography } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// Vite 下以 url 方式引入 worker
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const { Text } = Typography

interface Props {
  file: string
  title: string
}

export default function PdfReader({ file, title }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 切书时重置
  useEffect(() => {
    setNumPages(0)
    setPageNumber(1)
    setLoading(true)
    setError('')
  }, [file])

  // 键盘翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPageNumber((p) => Math.max(1, p - 1))
      if (e.key === 'ArrowRight') setPageNumber((p) => Math.min(numPages || p, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages])

  const docOptions = useMemo(
    () => ({
      // 大文件：渐进式加载
      disableAutoFetch: true,
      disableStream: false,
    }),
    [],
  )

  return (
    <div>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          paddingBlock: 8,
          position: 'sticky',
          top: 64,
          zIndex: 10,
          background: 'var(--ant-color-bg-layout, inherit)',
        }}
      >
        <Space.Compact>
          <Button icon={<ZoomOutOutlined />} onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))} />
          <Button style={{ pointerEvents: 'none' }} className="meta-mono">
            {Math.round(scale * 100)}%
          </Button>
          <Button icon={<ZoomInOutlined />} onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))} />
        </Space.Compact>
        <Space.Compact>
          <Button icon={<ArrowLeftOutlined />} disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)} />
          <InputNumber
            min={1}
            max={numPages || 1}
            value={pageNumber}
            onChange={(v) => v && setPageNumber(Math.min(numPages || 1, Math.max(1, v)))}
            style={{ width: 64 }}
            className="meta-mono"
          />
          <Button style={{ pointerEvents: 'none' }} className="meta-mono">
            / {numPages || '…'}
          </Button>
          <Button
            icon={<ArrowRightOutlined />}
            disabled={numPages > 0 && pageNumber >= numPages}
            onClick={() => setPageNumber((p) => p + 1)}
          />
        </Space.Compact>
        <Text type="secondary" className="meta-mono">
          ← → 键翻页
        </Text>
      </div>

      <div
        style={{
          background: 'var(--code-bg)',
          borderRadius: 8,
          border: '1px solid rgba(128,128,128,0.15)',
          padding: 16,
          maxHeight: 'calc(100vh - 230px)',
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Document
          file={file}
          loading={<Spin size="large" style={{ display: 'block', margin: '120px auto' }} />}
          error={<Empty description="PDF 加载失败" style={{ paddingBlock: 80 }} />}
          onLoadSuccess={({ numPages: n }: { numPages: number }) => {
            setNumPages(n)
            setLoading(false)
          }}
          onLoadError={(e) => {
            setError(String(e))
            setLoading(false)
          }}
          options={docOptions}
        >
          <Page
            key={`${file}-${pageNumber}`}
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<Spin style={{ display: 'block', margin: '60px auto' }} />}
          />
        </Document>
      </div>
      {error && <Empty description={`加载出错：${error}`} style={{ paddingBlock: 40 }} />}
      {loading && numPages === 0 && !error && (
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 8 }}>
          正在加载 {title} …
        </Text>
      )}
    </div>
  )
}
