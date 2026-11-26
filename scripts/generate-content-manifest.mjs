/**
 * 扫描 public/content/ 下的内容目录，生成 public/content/manifest.json
 *
 * 笔记：每个 notes/ 顶层文件夹 = 一个条目（笔记 + 对应代码片段）
 *   - *.md 文件 → 笔记文档（docs）
 *   - 其余代码文件 → 代码片段（code）
 *   - 其他文件（图片 / geojson 等大数据）→ 静态资源（assets），仅列入文件树
 * 电子书：扫描 books/ 下的 pdf（子文件夹 = 分类）
 * 项目：扫描 projects/ 下的文件夹，每个含 project.json（元信息）+ intro.md（介绍）
 *
 * 新增内容：把文件放进对应目录后执行 `npm run content` 即可。
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const NOTES_DIR = join(root, 'public', 'content', 'notes')
const OUT_FILE = join(root, 'public', 'content', 'manifest.json')

/** 路径编码：+ 保持原样（静态服务对 %2B 匹配不到文件） */
function enc(seg) {
  return encodeURIComponent(seg).replaceAll('%2B', '+')
}

/** 手动分类映射：文件夹名 → 分类。未配置的走自动规则。 */
const CATEGORY_MAP = {
  可展开排序表格: '组件封装',
  滚动条组件: '组件封装',
  相连面板: '组件封装',
  进度条: '组件封装',
  带延伸线的饼图: '组件封装',
  弹框: '组件封装',
  地图组件: '组件封装',
  弹框缩放: 'Hooks 工具',
  滚动指定位置: 'Hooks 工具',
  省略号文本: 'Hooks 工具',
  '计算悬浮框位置-固定定位': 'Hooks 工具',
  '计算悬浮框位置-固定定位（初版屏幕居中显示）': 'Hooks 工具',
  '计算悬浮框位置-绝对定位': 'Hooks 工具',
  计算表格滚动高度: 'Hooks 工具',
  微前端预加载: '方案实践',
  数据参谋: '方案实践',
  表格高度: '方案实践',
}

const CODE_EXTS = new Set(['vue', 'ts', 'tsx', 'js', 'jsx', 'html', 'css', 'scss', 'less', 'json'])
const DOC_EXTS = new Set(['md'])
/** 超过此大小的代码文件不作为片段在线预览（仍保留下载/文件树展示） */
const MAX_PREVIEW_BYTES = 200 * 1024
/** 这些目录下的文件一律视为静态资源（geojson / 图片等数据），不作为代码片段 */
const ASSET_DIRS = new Set(['assets', 'images', 'static'])

function langOf(name) {
  const ext = name.split('.').pop().toLowerCase()
  return { vue: 'vue', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', html: 'html', css: 'css', scss: 'scss', less: 'less', json: 'json', md: 'markdown' }[ext] ?? ext
}

function autoCategory(entry) {
  if (entry.docs.length === 0) return '组件封装'
  const hasVue = entry.code.some((f) => f.lang === 'vue')
  const hasHook = entry.code.some((f) => /use[A-Z]/.test(f.name))
  if (hasVue) return '组件封装'
  if (hasHook) return 'Hooks 工具'
  return '方案实践'
}

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, base, acc)
    else acc.push(full)
  }
  return acc
}

const notesDirExists = statSync(NOTES_DIR, { throwIfNoEntry: false })
if (!notesDirExists) {
  console.error(`未找到内容目录：${NOTES_DIR}`)
  process.exit(1)
}

const entries = readdirSync(NOTES_DIR)
  .filter((name) => statSync(join(NOTES_DIR, name)).isDirectory())
  .map((folder) => {
    const files = walk(join(NOTES_DIR, folder))
    const entry = {
      id: folder,
      title: folder,
      category: CATEGORY_MAP[folder],
      docs: [],
      code: [],
      assets: [],
      updatedAt: '',
    }

    for (const full of files) {
      const rel = relative(join(NOTES_DIR, folder), full).replaceAll('\\', '/')
      const name = rel.split('/').pop()
      const size = statSync(full).size
      const mtime = statSync(full).mtime.toISOString().slice(0, 10)
      if (mtime > entry.updatedAt) entry.updatedAt = mtime
      const item = { path: rel, name, size }
      const ext = name.split('.').pop().toLowerCase()
      const inAssetDir = rel.split('/').slice(0, -1).some((seg) => ASSET_DIRS.has(seg))
      const isDataFile =
        ext === 'json' && (inAssetDir || size > 100 * 1024 || /mock|mock数据/i.test(name))
      if (DOC_EXTS.has(ext)) {
        entry.docs.push(item)
      } else if (CODE_EXTS.has(ext) && !isDataFile) {
        entry.code.push({ ...item, lang: langOf(name), previewable: size <= MAX_PREVIEW_BYTES })
      } else {
        entry.assets.push(item)
      }
    }

    // md 与主文档排序：与文件夹同名的排最前
    entry.docs.sort((a, b) => Number(b.name.startsWith(folder)) - Number(a.name.startsWith(folder)) || a.path.localeCompare(b.path))
    entry.code.sort((a, b) => Number(b.path.includes('/')) - Number(a.path.includes('/')) || a.path.localeCompare(b.path))
    entry.category ??= autoCategory(entry)
    return entry
  })
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

const categories = [...new Set(entries.map((e) => e.category))]

// ---- 电子书：books/ 下的 pdf，子文件夹 = 分类（无子文件夹则归"未分类"）----
const BOOKS_DIR = join(root, 'public', 'books')
const books = []
if (statSync(BOOKS_DIR, { throwIfNoEntry: false })) {
  for (const name of readdirSync(BOOKS_DIR)) {
    const full = join(BOOKS_DIR, name)
    if (statSync(full).isFile() && name.toLowerCase().endsWith('.pdf')) {
      books.push({ id: name, title: name.replace(/\.pdf$/i, ''), category: '未分类', path: `/books/${enc(name)}`, size: statSync(full).size })
    }
  }
  for (const dir of readdirSync(BOOKS_DIR)) {
    const full = join(BOOKS_DIR, dir)
    if (!statSync(full).isDirectory()) continue
    for (const name of readdirSync(full)) {
      if (!name.toLowerCase().endsWith('.pdf')) continue
      const filePath = join(full, name)
      books.push({ id: `${dir}/${name}`, title: name.replace(/\.pdf$/i, ''), category: dir, path: `/books/${enc(dir)}/${enc(name)}`, size: statSync(filePath).size })
    }
  }
}

// ---- 项目：projects/ 下每个文件夹含 project.json + intro.md + 源码 ----
const PROJECTS_DIR = join(root, 'public', 'content', 'projects')
const projects = []
if (statSync(PROJECTS_DIR, { throwIfNoEntry: false })) {
  for (const folder of readdirSync(PROJECTS_DIR)) {
    const dir = join(PROJECTS_DIR, folder)
    if (!statSync(dir).isDirectory()) continue
    const metaFile = join(dir, 'project.json')
    let meta = {}
    try {
      Object.assign(meta, JSON.parse(readFileSync(metaFile, 'utf-8')))
    } catch {
      console.warn(`项目 ${folder} 缺少 project.json 或格式有误，已跳过`)
      continue
    }
    const files = walk(dir)
      .filter((f) => !/project\.json$/.test(f))
      .map((f) => {
        const rel = relative(dir, f).replaceAll('\\', '/')
        const size = statSync(f).size
        const ext = rel.split('.').pop().toLowerCase()
        return { path: rel, name: rel.split('/').pop(), size, lang: langOf(rel) }
      })
    projects.push({
      id: folder,
      title: meta.title ?? folder,
      summary: meta.summary ?? '',
      stack: meta.stack ?? [],
      demoUrl: meta.demoUrl ?? null,
      repoUrl: meta.repoUrl ?? null,
      embedable: meta.embedable ?? false,
      screenshots: meta.screenshots ?? [],
      intro: `projects/${folder}/intro.md`,
      files,
      updatedAt: meta.updatedAt || statSync(dir).mtime.toISOString().slice(0, 10),
    })
  }
}

mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(
  OUT_FILE,
  JSON.stringify({ generatedAt: new Date().toISOString(), categories, entries, books, projects }, null, 2),
  'utf-8',
)
console.log(
  `已生成 manifest.json：${entries.length} 个笔记条目 / ${projects.length} 个项目 / ${books.length} 本电子书，分类：${categories.join(' / ')}`,
)
