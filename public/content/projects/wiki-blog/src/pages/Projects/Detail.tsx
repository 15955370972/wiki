import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Breadcrumb, Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd'
import { GithubOutlined, LinkOutlined } from '@ant-design/icons'
import MarkdownView from '@/components/MarkdownView'
import CodeBrowser from '@/components/CodeBrowser'
import { fetchManifest, fetchText, projectBase, type ProjectEntry } from '@/api/content'

const { Title } = Typography

export default function ProjectDetail() {
  const { id = '' } = useParams()
  const [project, setProject] = useState<ProjectEntry | null>(null)
  const [intro, setIntro] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setProject(null)
    setError('')
    let cancelled = false
    fetchManifest()
      .then(async (m) => {
        const found = m.projects.find((p) => p.id === id)
        if (!found) throw new Error('项目不存在')
        if (!cancelled) setProject(found)
        const text = await fetchText(projectBase(found.id) + 'intro.md')
        if (!cancelled) setIntro(text)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) return <Empty description={error} style={{ paddingBlock: 120 }} />
  if (!project) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />

  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link to="/projects">项目</Link> }, { title: project.title }]}
      />
      <div style={{ marginBlock: '16px 16px' }}>
        <Title level={3} style={{ marginTop: 0 }}>
          {project.title}
        </Title>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {project.stack.map((s) => (
            <Tag key={s} color="processing">
              {s}
            </Tag>
          ))}
          <span className="meta-mono" style={{ opacity: 0.6 }}>
            更新于 {project.updatedAt}
          </span>
          <Space style={{ marginInlineStart: 'auto' }}>
            {project.repoUrl && (
              <Button icon={<GithubOutlined />} href={project.repoUrl} target="_blank">
                GitHub
              </Button>
            )}
            {project.demoUrl && (
              <Button type="primary" icon={<LinkOutlined />} href={project.demoUrl} target="_blank">
                在线演示
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* 在线预览：项目允许嵌入且有演示地址时展示 */}
      {project.embedable && project.demoUrl && (
        <Card size="small" title={<span className="meta-mono">在线预览</span>} style={{ marginBottom: 16 }}>
          <iframe
            src={project.demoUrl}
            title={project.title}
            style={{ width: '100%', height: 560, border: 'none', borderRadius: 8 }}
          />
        </Card>
      )}

      {intro && (
        <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 16 }}>
          <MarkdownView content={intro} />
        </Card>
      )}

      <CodeBrowser files={project.files} base={projectBase(project.id)} />
    </div>
  )
}
