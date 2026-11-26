import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Spin, Typography } from 'antd'
import { BookOutlined } from '@ant-design/icons'
import { fetchManifest, formatSize, type BookItem } from '@/api/content'

const { Title, Paragraph } = Typography

export default function BooksList() {
  const [books, setBooks] = useState<BookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchManifest()
      .then((m) => setBooks(m.books))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, BookItem[]>()
    for (const b of books) {
      if (!map.has(b.category)) map.set(b.category, [])
      map.get(b.category)!.push(b)
    }
    return [...map.entries()]
  }, [books])

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
  if (error) return <Empty description={`加载失败：${error}`} style={{ paddingBlock: 120 }} />
  if (books.length === 0)
    return (
      <Empty
        style={{ paddingBlock: 120 }}
        description="暂无电子书 · 把 PDF 放进 public/books/ 后运行 npm run content 即可"
      />
    )

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        电子书
      </Title>
      <Paragraph type="secondary">PDF 在线阅读</Paragraph>
      {groups.map(([category, items]) => (
        <div key={category} style={{ marginBottom: 24 }}>
          <div className="meta-mono" style={{ opacity: 0.65, marginBlockEnd: 10 }}>
            {category} · {items.length}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {items.map((b) => (
              <Card
                key={b.id}
                hoverable
                size="small"
                onClick={() => navigate(`/books/${b.id.split('/').map(encodeURIComponent).join('/')}`)}
                styles={{ body: { display: 'flex', gap: 12, alignItems: 'center' } }}
              >
                <BookOutlined style={{ fontSize: 28, color: 'var(--ant-color-primary, #3d5af1)' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.title}
                  </div>
                  <span className="meta-mono" style={{ opacity: 0.6 }}>
                    PDF · {formatSize(b.size)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
