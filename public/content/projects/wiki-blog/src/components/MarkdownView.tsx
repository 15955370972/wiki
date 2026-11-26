import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import { stripFrontmatter } from '@/api/content'
import '@/styles/hljs.css'
import '@/styles/markdown.css'

interface Props {
  content: string
  /** 用于把 md 里的相对图片/链接地址改写为站点绝对地址 */
  resolveAssetUrl?: (url: string) => string
}

export default function MarkdownView({ content, resolveAssetUrl }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        urlTransform={(url) => (resolveAssetUrl ? resolveAssetUrl(url) : url)}
      >
        {stripFrontmatter(content)}
      </ReactMarkdown>
    </div>
  )
}
