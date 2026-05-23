import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export default function MarkdownBlock({ content, muted, streaming }: { content: string; muted?: boolean; streaming?: boolean }) {
  if (streaming) {
    return (
      <div className={`markdown-body text-[13px] leading-[1.6] ${muted ? 'markdown-body--muted' : ''}`} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {content}
        <span className="motion-safe:animate-pulse">▌</span>
      </div>
    )
  }

  return (
    <div className={`markdown-body text-[13px] leading-[1.6] ${muted ? 'markdown-body--muted' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
