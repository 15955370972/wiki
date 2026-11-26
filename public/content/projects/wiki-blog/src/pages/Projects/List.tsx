import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Spin, Tag, Typography } from 'antd'
import { fetchManifest, type ProjectEntry } from '@/api/content'

const { Title, Paragraph } = Typography

export default function ProjectsList() {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchManifest()
      .then((m) => setProjects(m.projects))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
  if (error) return <Empty description={`加载失败：${error}`} style={{ paddingBlock: 120 }} />
  if (projects.length === 0)
    return (
      <Empty
        style={{ paddingBlock: 120 }}
        description="暂无项目 · 在 public/content/projects/ 下放入含 project.json 的项目文件夹，运行 npm run content 即可"
      />
    )

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        项目
      </Title>
      <Paragraph type="secondary">可运行的完整前端项目，支持在线预览与源码浏览</Paragraph>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {projects.map((p) => (
          <Card
            key={p.id}
            hoverable
            onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}
            styles={{ body: { display: 'flex', flexDirection: 'column', gap: 10, height: '100%' } }}
          >
            <Card.Meta title={p.title} description={p.summary} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
              {p.stack.map((s) => (
                <Tag key={s} color="processing">
                  {s}
                </Tag>
              ))}
            </div>
            <span className="meta-mono" style={{ opacity: 0.6 }}>
              {p.files.length} 个源码文件 · 更新于 {p.updatedAt}
            </span>
          </Card>
        ))}
      </div>
    </div>
  )
}
