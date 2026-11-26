import { useEffect, useMemo, useState } from 'react'
import { DataNode } from 'antd/es/tree'
import { Button, Card, Empty, Spin, Tree, Typography } from 'antd'
import { DownloadOutlined, FileOutlined, FolderOutlined } from '@ant-design/icons'
import CodeBlock from '@/components/CodeBlock'
import { fetchText } from '@/api/content'

const { Text } = Typography

export interface BrowserFile {
  path: string
  name: string
  size: number
  lang: string
}

interface Props {
  files: BrowserFile[]
  base: string
  /** 预览大小上限，与 manifest 生成规则一致 */
  maxPreviewBytes?: number
}

interface BuildResult {
  nodes: DataNode[]
  fileMap: Map<string, BrowserFile>
}

function buildTree(files: BrowserFile[]): BuildResult {
  const fileMap = new Map<string, BrowserFile>()
  const root: DataNode[] = []
  const dirNodes = new Map<string, DataNode[]>()

  const ensureDir = (parts: string[]): DataNode[] => {
    if (parts.length === 0) return root
    const parentKey = parts.join('/')
    const existing = dirNodes.get(parentKey)
    if (existing) return existing
    const children = ensureDir(parts.slice(0, -1))
    const node: DataNode = {
      key: parentKey,
      title: parts[parts.length - 1],
      icon: <FolderOutlined />,
      children: [],
    }
    children.push(node)
    dirNodes.set(parentKey, node.children as DataNode[])
    return dirNodes.get(parentKey)!
  }

  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    fileMap.set(f.path, f)
    const parts = f.path.split('/')
    const dir = ensureDir(parts.slice(0, -1))
    dir.push({ key: f.path, title: f.name, icon: <FileOutlined />, isLeaf: true })
  }
  return { nodes: root, fileMap }
}

export default function CodeBrowser({ files, base, maxPreviewBytes = 200 * 1024 }: Props) {
  const { nodes, fileMap } = useMemo(() => buildTree(files), [files])
  const [selected, setSelected] = useState<string | null>(files[0]?.path ?? null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activeFile = selected ? fileMap.get(selected) : undefined

  useEffect(() => {
    if (!activeFile || !activeFile.path) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetchText(base + activeFile.path)
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
  }, [activeFile, base])

  const previewable = activeFile ? activeFile.size <= maxPreviewBytes : false

  return (
    <Card
      size="small"
      title={<span className="meta-mono">源码浏览</span>}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'flex', minHeight: 420, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '0 0 280px',
            minWidth: 220,
            borderInlineEnd: '1px solid rgba(128,128,128,0.15)',
            padding: '8px 4px',
            maxHeight: 620,
            overflowY: 'auto',
          }}
        >
          <Tree
            showIcon
            defaultExpandAll
            treeData={nodes}
            selectedKeys={selected ? [selected] : []}
            onSelect={(keys) => {
              const key = String(keys[0] ?? '')
              if (key && fileMap.has(key)) setSelected(key)
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 300, padding: 12 }}>
          {activeFile ? (
            <>
              <div
                className="meta-mono"
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginBlockEnd: 10, flexWrap: 'wrap' }}
              >
                <Text strong>{activeFile.path}</Text>
                {previewable && (
                  <Button size="small" icon={<DownloadOutlined />} href={base + activeFile.path} download>
                    下载
                  </Button>
                )}
              </div>
              {loading ? (
                <Spin style={{ display: 'block', margin: '60px auto' }} />
              ) : error ? (
                <Empty description={error} />
              ) : previewable ? (
                <CodeBlock code={code} lang={activeFile.lang} maxHeight={560} />
              ) : (
                <Empty description="文件超过在线预览大小限制">
                  <Button type="primary" href={base + activeFile.path} download>
                    下载查看
                  </Button>
                </Empty>
              )}
            </>
          ) : (
            <Empty description="选择左侧文件查看源码" style={{ marginTop: 80 }} />
          )}
        </div>
      </div>
    </Card>
  )
}
