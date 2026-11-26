import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Breadcrumb, Button, Card, Empty, Spin, Tabs, Tag, Typography } from 'antd'
import { CodeOutlined, FileTextOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import MarkdownView from '@/components/MarkdownView'
import { extractHeadings } from '@/hooks/useToc'
import { fetchManifest, fetchText, formatSize, noteBase, resolveAssetUrl, type NoteEntry } from '@/api/content'

const { Title } = Typography

export default function NoteDetail() {
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<NoteEntry | null>(null)
  const [content, setContent] = useState('')
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [activeHeading, setActiveHeading] = useState('')

  const activeDoc = searchParams.get('doc') ?? ''

  // 条目查找
  useEffect(() => {
    setEntry(null)
    setError('')
    fetchManifest()
      .then((m) => {
        const found = m.entries.find((e) => e.id === id)
        if (!found) throw new Error('笔记不存在')
        setEntry(found)
        // 未指定文档时选第一篇
        if (!searchParams.get('doc') && found.docs[0]) {
          setSearchParams({ doc: found.docs[0].path }, { replace: true })
        }
      })
      .catch((e) => setError(String(e.message ?? e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 文档内容加载
  useEffect(() => {
    if (!entry || !activeDoc) return
    let cancelled = false
    setLoadingDoc(true)
    fetchText(noteBase(entry.id) + activeDoc)
      .then((text) => {
        if (!cancelled) setContent(text)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false)
      })
    return () => {
      cancelled = true
    }
  }, [entry, activeDoc])

  // 目录数据
  const toc = useMemo(() => extractHeadings(content), [content])

  // 切换文档/笔记时回到顶部
  useEffect(() => {
    window.scrollTo({ top: 0 })
    setProgress(0)
    setActiveHeading('')
  }, [id, activeDoc])

  // 阅读进度 + 目录滚动高亮
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      setProgress(total > 0 ? Math.min(100, (window.scrollY / total) * 100) : 0)
      let current = ''
      for (const h of toc) {
        const el = document.getElementById(h.id)
        if (el && el.getBoundingClientRect().top <= 110) current = h.id
      }
      setActiveHeading(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [toc])

  // 上下篇（manifest 按更新时间排序）
  const [prevEntry, setPrevEntry] = useState<NoteEntry | null>(null)
  const [nextEntry, setNextEntry] = useState<NoteEntry | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchManifest().then((m) => {
      if (cancelled) return
      const idx = m.entries.findIndex((e) => e.id === id)
      setPrevEntry(m.entries[idx - 1] ?? null)
      setNextEntry(m.entries[idx + 1] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) return <Empty description={error} style={{ paddingBlock: 120 }} />
  if (!entry) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />

  const jumpToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      {/* 顶部阅读进度条 */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: 3,
          width: `${progress}%`,
          background: 'var(--ant-color-primary, #3d5af1)',
          zIndex: 200,
          transition: 'width 0.1s linear',
        }}
      />

      <Breadcrumb
        items={[
          { title: <Link to="/notes">笔记</Link> },
          { title: entry.title },
        ]}
      />
      <div
        style={{
          display: 'flex',
          gap: 24,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginTop: 16,
        }}
      >
        {/* 正文列 */}
        <div style={{ flex: '1 1 640px', minWidth: 0 }}>
          <Title level={3} style={{ marginTop: 0 }}>
            {entry.title}
          </Title>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tag color="processing">{entry.category}</Tag>
            <span className="meta-mono" style={{ opacity: 0.7 }}>
              更新于 {entry.updatedAt}
            </span>
          </div>

          {entry.docs.length > 1 && (
            <Tabs
              activeKey={activeDoc}
              onChange={(key) => setSearchParams({ doc: key })}
              items={entry.docs.map((d) => ({ key: d.path, label: d.name }))}
              style={{ marginBottom: 8 }}
            />
          )}

          {loadingDoc ? (
            <Spin style={{ display: 'block', margin: '80px auto' }} />
          ) : (
            <Card styles={{ body: { padding: '16px 24px' } }}>
              <MarkdownView
                content={content}
                resolveAssetUrl={(url) => resolveAssetUrl(entry.id, url)}
              />
            </Card>
          )}

          {/* 上一篇 / 下一篇 */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Button
              style={{ flex: 1, minWidth: 200, textAlign: 'left' }}
              disabled={!prevEntry}
              onClick={() => prevEntry && navigate(`/notes/${encodeURIComponent(prevEntry.id)}`)}
            >
              <LeftOutlined /> {prevEntry ? prevEntry.title : '已是第一篇'}
            </Button>
            <Button
              style={{ flex: 1, minWidth: 200, textAlign: 'right' }}
              disabled={!nextEntry}
              onClick={() => nextEntry && navigate(`/notes/${encodeURIComponent(nextEntry.id)}`)}
            >
              {nextEntry ? nextEntry.title : '已是最后一篇'} <RightOutlined />
            </Button>
          </div>
        </div>

        {/* 侧栏：相关代码 + 目录 */}
        <div style={{ flex: '0 0 280px', position: 'sticky', top: 88, minWidth: 0, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}>
          <Card size="small" title={<span className="meta-mono"><CodeOutlined /> 相关代码</span>}>
            {entry.code.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无代码文件" />
            ) : (
              entry.code.map((f) => (
                <div
                  key={f.path}
                  onClick={() => navigate(`/snippets/${encodeURIComponent(entry.id)}?file=${encodeURIComponent(f.path)}`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                  className="meta-mono"
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.path}
                  </span>
                  <Tag style={{ flexShrink: 0 }}>{f.lang}</Tag>
                </div>
              ))
            )}
            <div className="meta-mono" style={{ opacity: 0.6, marginTop: 8, padding: '0 8px' }}>
              <FileTextOutlined /> {entry.docs.length} 篇文档 · {formatSize(entry.code.reduce((s, f) => s + f.size, 0))}
            </div>
          </Card>

          {toc.length > 0 && (
            <Card size="small" title={<span className="meta-mono">目录</span>} style={{ marginTop: 16 }}>
              {toc.map((h) => (
                <div
                  key={h.id}
                  onClick={() => jumpToHeading(h.id)}
                  className="meta-mono"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    paddingInlineStart: h.depth === 3 ? 22 : 8,
                    background: activeHeading === h.id ? 'var(--code-bg)' : undefined,
                    color: activeHeading === h.id ? 'var(--ant-color-primary, #3d5af1)' : undefined,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {h.text}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
