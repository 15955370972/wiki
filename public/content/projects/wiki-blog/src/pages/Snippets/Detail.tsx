import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Breadcrumb, Button, Card, Descriptions, Empty, Spin, Tag, Typography } from 'antd'
import { ReadOutlined } from '@ant-design/icons'
import CodeBlock from '@/components/CodeBlock'
import { fetchManifest, fetchText, formatSize, noteBase, type NoteEntry } from '@/api/content'

const { Title, Text } = Typography

export default function SnippetDetail() {
  const { noteId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [entry, setEntry] = useState<NoteEntry | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const filePath = searchParams.get('file') ?? ''
  const file = entry?.code.find((f) => f.path === filePath)

  useEffect(() => {
    setEntry(null)
    setError('')
    fetchManifest()
      .then((m) => {
        const found = m.entries.find((e) => e.id === noteId)
        if (!found) throw new Error('片段不存在')
        setEntry(found)
        const target = searchParams.get('file') ?? found.code[0]?.path ?? ''
        if (target && target !== searchParams.get('file')) {
          setSearchParams({ file: target }, { replace: true })
        }
      })
      .catch((e) => setError(String(e.message ?? e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  useEffect(() => {
    if (!entry || !file) return
    let cancelled = false
    setLoading(true)
    setCode('')
    if (!file.previewable) {
      setLoading(false)
      return
    }
    fetchText(noteBase(entry.id) + file.path)
      .then((text) => {
        if (!cancelled) setCode(text)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entry, file])

  if (error) return <Empty description={error} style={{ paddingBlock: 120 }} />
  if (!entry) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />

  const rawUrl = file ? noteBase(entry.id) + file.path : ''

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link to="/snippets">代码片段</Link> },
          { title: entry.title },
          ...(file ? [{ title: <span className="meta-mono">{file.path}</span> }] : []),
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBlock: '16px 16px' }}>
        <Title level={3} style={{ margin: 0 }} className="meta-mono">
          {file?.name}
        </Title>
        {file && <Tag color="processing">{file.lang}</Tag>}
        <Text type="secondary" className="meta-mono">
          {file && formatSize(file.size)}
        </Text>
        <Button
          type="primary"
          ghost
          icon={<ReadOutlined />}
          style={{ marginInlineStart: 'auto' }}
          href={`/notes/${encodeURIComponent(entry.id)}`}
        >
          查看对应笔记
        </Button>
      </div>

      {/* 同笔记下其他代码文件快速切换 */}
      {entry.code.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBlockEnd: 16 }}>
          {entry.code.map((f) => (
            <Button
              key={f.path}
              size="small"
              className="meta-mono"
              type={f.path === filePath ? 'primary' : 'default'}
              onClick={() => setSearchParams({ file: f.path })}
            >
              {f.path}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <Spin style={{ display: 'block', margin: '80px auto' }} />
      ) : file && !file.previewable ? (
        <Card>
          <Empty
            description={
              <Descriptions column={1} size="small" style={{ maxWidth: 420 }}>
                <Descriptions.Item label="原因">文件超过在线预览大小限制</Descriptions.Item>
                <Descriptions.Item label="大小">{formatSize(file.size)}</Descriptions.Item>
              </Descriptions>
            }
          >
            <Button type="primary" href={rawUrl} download>
              下载查看
            </Button>
          </Empty>
        </Card>
      ) : (
        file && <CodeBlock code={code} lang={file.lang} downloadUrl={rawUrl} maxHeight="calc(100vh - 320px)" />
      )}
    </div>
  )
}
