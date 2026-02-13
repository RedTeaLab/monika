import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react'
import { authApi, type User, STORAGE_KEYS } from '@/lib/api'
import { toast } from 'sonner'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; username: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 从 localStorage 恢复登录状态
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN)
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER)

    if (storedToken && storedUser) {
      setToken(storedToken)
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem(STORAGE_KEYS.TOKEN)
        localStorage.removeItem(STORAGE_KEYS.USER)
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (
    username: string,
    password: string,
    rememberMe = true,
    showToast = true
  ) => {
    console.log('[AuthContext] Starting login for:', username)
    setIsLoading(true)

    try {
      // Step 1: 调用登录 API
      const apiResponse = await authApi.login({ username, password })
      console.log('[AuthContext] Login API response:', apiResponse)

      // API 返回格式: { code: 0, message: "...", data: { access_token: "...", ... } }
      // 需要从 data 字段中提取 access_token
      const access_token = (apiResponse as any).data?.access_token || apiResponse?.access_token
      if (!access_token) {
        throw new Error('登录失败：未收到 access token')
      }

      // Step 2: 先保存 token 到 localStorage（在调用 API 之前）
      // 这样 getCurrentUser() 的请求拦截器才能获取到 token
      setToken(access_token)

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, access_token)
        console.log('[AuthContext] Token saved to localStorage before getCurrentUser call')
      }

      // Step 3: 获取用户信息（现在 token 已经在 localStorage 中了）
      const userData = await authApi.getCurrentUser()
      console.log('[AuthContext] User data received:', userData)

      // 验证用户数据
      if (!userData || !userData.id) {
        throw new Error('登录失败：无法获取用户信息')
      }

      // Step 4: 保存用户信息到 state 和 localStorage
      setUser(userData)

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData))
        console.log('[AuthContext] User data saved to localStorage')
      }

      if (showToast) {
        toast.success('登录成功')
        console.log('[AuthContext] Toast shown')
      }

    } catch (error: any) {
      console.error('[AuthContext] Login error:', error)
      // Axios拦截器已经将业务错误转换为Error(data.message)
      // HTTP错误会有error.response，业务错误只有error.message
      const message = error?.message || '登录失败'
      toast.error(message)

      // Always throw to allow caller to handle navigation
      throw error
    } finally {
      setIsLoading(false)
      console.log('[AuthContext] Login completed (loading set to false)')
    }
  }

  const register = async (username: string, email: string, password: string) => {
    setIsLoading(true)
    try {
      await authApi.register({ username, email, password })

      // 注册成功，显示 toast 并返回成功
      toast.success('注册成功！')
      // 注意：不再自动登录，由调用方处理跳转
      return { success: true, username }
    } catch (error: any) {
      const message = error.response?.data?.detail || '注册失败'
      toast.error(message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN)
    localStorage.removeItem(STORAGE_KEYS.USER)
    setToken(null)
    setUser(null)
    toast.success('已登出')
  }

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
