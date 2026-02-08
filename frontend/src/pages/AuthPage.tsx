import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, AlertCircle } from 'lucide-react'

type AuthMode = 'login' | 'register'

interface AuthFormData {
  username: string
  email: string
  password: string
  confirmPassword: string
}

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [formData, setFormData] = useState<AuthFormData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const { login, register, isLoading } = useAuth()
  const navigate = useNavigate()

  const validateForm = (): string | null => {
    if (formData.username.length < 3) {
      return '用户名至少需要3个字符'
    }

    if (!formData.password) {
      return '请输入密码'
    }

    if (mode === 'register') {
      if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        return '请输入有效的邮箱地址'
      }

      if (formData.password.length < 8) {
        return '密码至少需要8个字符'
      }

      const hasLetter = /[a-zA-Z]/.test(formData.password)
      const hasNumber = /[0-9]/.test(formData.password)
      const hasSpecial = /[!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?`~]/.test(formData.password)

      if (!hasLetter || !hasNumber || !hasSpecial) {
        return '密码必须包含字母、数字和特殊字符'
      }

      if (formData.password !== formData.confirmPassword) {
        return '两次输入的密码不一致'
      }
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      if (mode === 'login') {
        await login(formData.username, formData.password, rememberMe)
        navigate('/select-character')
      } else {
        const result = await register(formData.username, formData.email, formData.password)
        // 注册成功后跳转到欢迎页面
        navigate(`/register-success?username=${encodeURIComponent(result.username)}`)
      }
    } catch {
      // Error already handled by AuthContext with toast
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {mode === 'login' ? '登录' : '注册'} Monika
          </CardTitle>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                disabled={isLoading}
                required
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={isLoading}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                disabled={isLoading}
                required
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  disabled={isLoading}
                  required
                />
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  disabled={isLoading}
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal cursor-pointer"
                >
                  记住我
                </Label>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'login' ? '登录中...' : '注册中...'}
                </>
              ) : (
                mode === 'login' ? '登录' : '注册'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? '没有账号？' : '已有账号？'}
            <button
              type="button"
              className="ml-1 text-primary hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
                setFormData({
                  username: '',
                  email: '',
                  password: '',
                  confirmPassword: '',
                })
              }}
            >
              {mode === 'login' ? '去注册' : '去登录'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
