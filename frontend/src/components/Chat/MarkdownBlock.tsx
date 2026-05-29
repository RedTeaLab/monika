import { useState, useEffect, useTransition } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export default function MarkdownBlock({ content, muted, streaming }: { content: string; muted?: boolean; streaming?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [parsed, setParsed] = useState('')

  useEffect(() => {
    if (!streaming && content) {
      startTransition(() => setParsed(content))
    }
  }, [streaming, content, startTransition])

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
      {pending && (
        <div className="mb-2" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.5, fontSize: '13px' }}>
          {content}
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {parsed || content}
      </ReactMarkdown>
    </div>
  )
}
