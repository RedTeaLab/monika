import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export default function MarkdownBlock({ content, muted }: { content: string; muted?: boolean }) {
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
