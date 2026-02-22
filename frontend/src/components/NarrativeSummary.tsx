import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen } from 'lucide-react'

interface NarrativeSummaryProps {
  summary: string
  className?: string
}

export function NarrativeSummary({ summary, className = '' }: NarrativeSummaryProps) {
  const paragraphs = summary.split('\n').filter((p) => p.trim())

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          叙事摘要
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {paragraphs.map((paragraph, idx) => (
              <p key={idx} className="text-base leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
