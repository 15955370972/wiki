/** 内容数据层：读取 public/content/ 下的 manifest 与静态文件 */

export interface FileItem {
  path: string
  name: string
  size: number
}

export interface CodeItem extends FileItem {
  lang: string
  previewable: boolean
}

export interface NoteEntry {
  id: string
  title: string
  category: string
  docs: FileItem[]
  code: CodeItem[]
  assets: FileItem[]
  updatedAt: string
}

export interface Manifest {
  generatedAt: string
  categories: string[]
  entries: NoteEntry[]
  books: BookItem[]
  projects: ProjectEntry[]
}

export interface BookItem {
  id: string
  title: string
  category: string
  path: string
  size: number
}

export interface ProjectFile {
  path: string
  name: string
  size: number
  lang: string
}

export interface ProjectEntry {
  id: string
  title: string
  summary: string
  stack: string[]
  demoUrl: string | null
  repoUrl: string | null
  embedable: boolean
  screenshots: string[]
  intro: string
  files: ProjectFile[]
  updatedAt: string
}

export function projectBase(projectId: string): string {
  return `/content/projects/${projectId}/`
}

let manifestCache: Promise<Manifest> | null = null

export function fetchManifest(): Promise<Manifest> {
  manifestCache ??= fetch('/content/manifest.json').then((res) => {
    if (!res.ok) throw new Error(`manifest.json 加载失败：${res.status}`)
    return res.json() as Promise<Manifest>
  })
  return manifestCache
}

/** 某篇笔记内容的基地址（路径含中文，fetch 时浏览器会自动编码） */
export function noteBase(noteId: string): string {
  return `/content/notes/${noteId}/`
}

/** 把 md 里的相对资源地址改写为站点绝对地址 */
export function resolveAssetUrl(noteId: string, url: string): string {
  if (/^(https?:|data:|#|\/)/.test(url)) return url
  return noteBase(noteId) + url
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`文件加载失败（${res.status}）：${url}`)
  return res.text()
}

/** 兼容将来补充 frontmatter 的写法 */
export function stripFrontmatter(md: string): string {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? md.slice(m[0].length) : md
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
