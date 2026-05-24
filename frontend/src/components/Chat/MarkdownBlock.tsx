import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export default function MarkdownBlock({ content, muted, streaming }: { content: string; muted?: boolean; streaming?: boolean }) {
  if (streaming) {
    return (
      <div className={`markdown-body ${muted ? 'markdown-body--muted' : ''}`}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {content}
          <span className="motion-safe:animate-pulse" style={{ opacity: 0.5 }}>▌</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`markdown-body ${muted ? 'markdown-body--muted' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
