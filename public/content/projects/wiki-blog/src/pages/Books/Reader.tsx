import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Empty, Spin, Typography } from 'antd'
import { DownloadOutlined, SelectOutlined } from '@ant-design/icons'
import PdfReader from '@/components/PdfReader'
import { fetchManifest, formatSize, type BookItem } from '@/api/content'

const { Text } = Typography

/** PDF 阅读器：pdf.js 渲染，跨浏览器一致 */
export default function BookReader() {
  const params = useParams()
  // 路由为 books/*，'*' 段即书籍 id（可含子文件夹）
  const bookId = decodeURIComponent(params['*'] ?? '')
  const [book, setBook] = useState<BookItem | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setBook(null)
    setError('')
    let cancelled = false
    fetchManifest()
      .then((m) => {
        const found = m.books.find((b) => b.id === bookId)
        if (!found) throw new Error('电子书不存在')
        if (!cancelled) setBook(found)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e))
      })
    return () => {
      cancelled = true
    }
  }, [bookId])

  if (error) return <Empty description={error} style={{ paddingBlock: 120 }} />
  if (!book) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />

  return (
    <div>
      <span style={{ color: 'rgba(128,128,128,0.9)', fontSize: 14 }}>
        <Link to="/books">电子书</Link>
        <span style={{ margin: '0 8px', opacity: 0.5 }}>/</span>
        <span className="meta-mono">{book.title}</span>
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBlock: '12px 12px' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {book.title}
        </Typography.Title>
        <Text type="secondary" className="meta-mono">
          PDF · {formatSize(book.size)}
        </Text>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={<SelectOutlined />} href={book.path} target="_blank">
            新窗口打开
          </Button>
          <Button icon={<DownloadOutlined />} href={book.path} download>
            下载
          </Button>
        </div>
      </div>

      <PdfReader file={book.path} title={book.title} />
    </div>
  )
}
