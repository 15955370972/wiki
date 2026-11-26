import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Input, Spin, Tabs, Tag, Typography } from 'antd'
import { FileTextOutlined, CodeOutlined, SearchOutlined } from '@ant-design/icons'
import { fetchManifest, type NoteEntry } from '@/api/content'

const { Title } = Typography

export default function NotesList() {
  const [entries, setEntries] = useState<NoteEntry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchManifest()
      .then((m) => {
        setEntries(m.entries)
        setCategories(m.categories)
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (activeCategory === '全部' || e.category === activeCategory) &&
          e.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [entries, activeCategory, search],
  )

  if (loading)
    return (
      <div style={{ paddingBlock: 120, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  if (error) return <Empty description={`加载失败：${error}`} />

  const tabItems = [
    { key: '全部', label: `全部 ${entries.length}` },
    ...categories.map((c) => ({
      key: c,
      label: `${c} ${entries.filter((e) => e.category === c).length}`,
    })),
  ]

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        笔记
      </Title>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Tabs
          activeKey={activeCategory}
          onChange={setActiveCategory}
          items={tabItems}
          style={{ flex: 1, minWidth: 0, marginBottom: -16 }}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索笔记"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220, alignSelf: 'center' }}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty description="没有匹配的笔记" style={{ paddingBlock: 80 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map((entry) => (
            <Card
              key={entry.id}
              hoverable
              size="small"
              onClick={() => navigate(`/notes/${encodeURIComponent(entry.id)}`)}
              styles={{ body: { display: 'flex', flexDirection: 'column', gap: 8, height: '100%' } }}
            >
              <Card.Meta
                title={entry.title}
                description={
                  <span className="meta-mono">更新于 {entry.updatedAt}</span>
                }
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 'auto' }}>
                <Tag color="processing">{entry.category}</Tag>
                <span className="meta-mono" style={{ opacity: 0.75 }}>
                  <FileTextOutlined /> {entry.docs.length} 篇文档
                  <CodeOutlined style={{ marginInlineStart: 10, marginInlineEnd: 4 }} />
                  {entry.code.length} 个代码文件
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
