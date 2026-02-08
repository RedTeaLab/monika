import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import confetti from 'canvas-confetti'

export function RegisterSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const username = searchParams.get('username') || '用户'
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    // Trigger confetti animation on mount
    const duration = 3000
    const end = Date.now() + duration

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'],
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'],
      })

      if (Date.now() < end && showConfetti) {
        requestAnimationFrame(frame)
      }
    }

    setShowConfetti(true)
    frame()

    // Cleanup
    return () => {
      setShowConfetti(false)
    }
  }, [showConfetti])

  const handleGoToLogin = () => {
    navigate('/auth?mode=login&username=' + encodeURIComponent(username))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
      {/* Confetti canvas is added automatically by canvas-confetti */}

      <Card className="w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
        <CardContent className="pt-8 pb-8 px-8 text-center">
          {/* Success Icon */}
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-green-100 opacity-75"></div>
              <div className="relative bg-green-500 rounded-full p-4 shadow-lg">
                <CheckCircle2 className="h-12 w-12 text-white" />
              </div>
            </div>
          </div>

          {/* Sparkle Icons */}
          <div className="absolute top-8 right-8 animate-bounce" style={{ animationDelay: '0s' }}>
            <Sparkles className="h-6 w-6 text-yellow-500" />
          </div>
          <div className="absolute top-8 left-8 animate-bounce" style={{ animationDelay: '0.2s' }}>
            <Sparkles className="h-6 w-6 text-purple-500" />
          </div>
          <div className="absolute bottom-8 right-8 animate-bounce" style={{ animationDelay: '0.4s' }}>
            <Sparkles className="h-6 w-6 text-blue-500" />
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎉 注册成功！
          </h1>

          {/* Username Message */}
          <p className="text-lg text-gray-700 mb-4">
            欢迎 <span className="font-semibold text-blue-600"> @{username}</span> 加入 Monika
          </p>

          {/* Welcome Message */}
          <p className="text-gray-600 mb-8 leading-relaxed">
            您的账号已成功创建。Monika 是一个 AI 驱动的克苏鲁神话 TRPG 平台，
            准备好开始您的冒险之旅了吗？
          </p>

          {/* Feature Highlights (Optional) */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-8 text-left">
            <p className="text-sm font-medium text-gray-700 mb-2">
              ✨ 接下来您可以：
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>👤 登录您的账号</li>
              <li>🎭 创建您的第一个角色卡</li>
              <li>🎲 开始单人跑团冒险</li>
              <li>📚 探索克苏鲁神话规则</li>
            </ul>
          </div>

          {/* Call to Action */}
          <Button
            onClick={handleGoToLogin}
            size="lg"
            className="w-full sm:w-auto shadow-lg hover:shadow-xl transition-all duration-200 group"
          >
            去登录
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
          </Button>

          {/* Additional Info */}
          <p className="text-xs text-gray-500 mt-6">
            需要帮助？查看我们的{' '}
            <a href="https://docs.monika.dev" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              文档
            </a>
            {' '}或{' '}
            <a href="https://github.com/GuoChangxi/monika" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              GitHub
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
