import * as React from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export interface TourStep {
  target: string
  title: string
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

interface TourProps {
  steps: TourStep[]
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

export function Tour({ steps, isOpen, onClose, onComplete }: TourProps) {
  const [currentStep, setCurrentStep] = React.useState(0)

  React.useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      localStorage.setItem('monika_tour_seen', 'true')
      onComplete?.()
      onClose()
    }
  }

  const handleSkip = () => {
    localStorage.setItem('monika_tour_seen', 'true')
    onClose()
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (!isOpen || steps.length === 0) return null

  const step = steps[currentStep]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4 shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">{step.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                步骤 {currentStep + 1} / {steps.length}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm mb-6">{step.content}</p>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              跳过
            </Button>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button variant="outline" size="sm" onClick={handlePrev}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一步
                </Button>
              )}
              <Button size="sm" onClick={handleNext}>
                {currentStep === steps.length - 1 ? '完成' : '下一步'}
                {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    target: 'input',
    title: '输入你的行动',
    content: '在这里描述你想做的事情，例如"调查房间"或"检查门锁"。也可以使用命令如/roll STR。',
    position: 'top',
  },
  {
    target: 'state',
    title: '角色状态',
    content: '查看你的生命值SAN值、幸运值和当前所在场景。',
    position: 'left',
  },
  {
    target: 'leads',
    title: '行动提示',
    content: '这里显示可供选择的行动线索。点击可选择执行。',
    position: 'right',
  },
]
