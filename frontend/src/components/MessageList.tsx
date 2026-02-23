import { useEffect, useRef, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageBubble, type Message } from "@/components/MessageBubble"

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(messages.length)
  const [announcement, setAnnouncement] = useState("")

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    // Announce new messages to screen readers
    if (messages.length > prevMessageCountRef.current) {
      const newMessageCount = messages.length - prevMessageCountRef.current
      setAnnouncement(`${newMessageCount} new message${newMessageCount > 1 ? 's' : ''} received`)
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <ScrollArea ref={scrollAreaRef} className="flex-1" role="log" aria-label="Chat messages">
        <div className="p-4 space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </>
  )
}
