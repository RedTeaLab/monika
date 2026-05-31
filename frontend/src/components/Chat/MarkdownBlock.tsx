import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Browser } from '@wailsio/runtime'

function CodeBlock({ children, ...rest }: React.ComponentPropsWithoutRef<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const el = ref.current
    if (!el) return
    const text = el.textContent || ''
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [])

  return (
    <div className="relative group/codeblock">
      <pre ref={ref} {...rest}>{children}</pre>
      <button
        className="absolute top-[6px] right-[6px] opacity-0 group-hover/codeblock:opacity-100 transition-opacity
                   text-[10px] font-semibold uppercase tracking-[0.04em] rounded px-1.5 py-0.5
                   hover:bg-[var(--bg-hover)] cursor-pointer"
        style={{ color: 'var(--text-dim)' }}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function ExternalLink({ href, children, ...rest }: React.ComponentPropsWithoutRef<'a'>) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (href) Browser.OpenURL(href)
  }, [href])

  return <a href={href} onClick={handleClick} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
}

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
        components={{ pre: CodeBlock, a: ExternalLink }}
      >
        {parsed || content}
      </ReactMarkdown>
    </div>
  )
}
