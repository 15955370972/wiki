import GithubSlugger from 'github-slugger'

export interface TocItem {
  id: string
  text: string
  depth: number
}

/** 提取 md 的 h2/h3 标题生成目录，id 与 rehype-slug（github-slugger）保持一致 */
export function extractHeadings(md: string): TocItem[] {
  const slugger = new GithubSlugger()
  const items: TocItem[] = []
  let inCodeFence = false
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inCodeFence = !inCodeFence
    if (inCodeFence) continue
    const m = line.match(/^(#{2,3})\s+(.+?)\s*#*$/)
    if (!m) continue
    const text = m[2].replace(/`/g, '').trim()
    items.push({ depth: m[1].length, text, id: slugger.slug(text) })
  }
  return items
}
