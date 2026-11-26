import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, Input, Spin, Tag, Typography } from 'antd'
import { CodeOutlined, SearchOutlined } from '@ant-design/icons'
import { fetchManifest, formatSize, type CodeItem, type NoteEntry } from '@/api/content'

const { Title, Text } = Typography

export default function SnippetsList() {
  const [entries, setEntries] = useState<NoteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchManifest()
      .then((m) => setEntries(m.entries))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  // 支持从笔记页 ?highlight=定位，未用到的参数保留
  const groups = useMemo(    () =>
      entries
        .filter(
          (e) =>
            e.code.length > 0 &&
            (e.title.toLowerCase().includes(search.toLowerCase()) ||
              e.code.some((f) => f.path.toLowerCase().includes(search.toLowerCase()))),
        )
        .map((e) => ({ entry: e })),
    [entries, search],
  )

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
  if (error) return <Empty description={`加载失败：${error}`} style={{ paddingBlock: 120 }} />

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBlock: '16px 8px' }}>
        <Title level={3} style={{ margin: 0 }}>
          代码片段
        </Title>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索片段或所属笔记"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240, marginInlineStart: 'auto' }}
        />
      </div>
      <Text type="secondary" className="meta-mono">
        每个片段与一篇笔记对应，可互相跳转
      </Text>

      {groups.length === 0 ? (
        <Empty description="没有匹配的片段" style={{ paddingBlock: 80 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          {groups.map(({ entry }) => (
            <div key={entry.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 260px', minWidth: 0 }}>
                <Link to={`/notes/${encodeURIComponent(entry.id)}`}>{entry.title}</Link>
                <div>
                  <Tag color="processing" style={{ marginTop: 4 }}>
                    {entry.category}
                  </Tag>
                  <span className="meta-mono" style={{ opacity: 0.6 }}>
                    {entry.code.length} 个文件
                  </span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {entry.code.map((f) => (
                  <SnippetChip key={f.path} entry={entry} file={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SnippetChip({ entry, file }: { entry: NoteEntry; file: CodeItem }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/snippets/${encodeURIComponent(entry.id)}?file=${encodeURIComponent(file.path)}`)}
      style={{
        border: '1px solid rgba(128,128,128,0.2)',
        borderRadius: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span className="meta-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <CodeOutlined style={{ marginInlineEnd: 6 }} />
        {file.path}
      </span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Tag style={{ margin: 0 }}>{file.lang}</Tag>
        <span className="meta-mono" style={{ opacity: 0.6 }}>
          {formatSize(file.size)}
        </span>
      </span>
    </div>
  )
}
