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
      const response = await authApi.login({ username, password })
      console.log('[AuthContext] Login API response:', response)

      if (!response.access_token) {
        throw new Error(response.data?.detail || '登录失败：未收到 access token')
      }

      const access_token = response.access_token

      // Step 2: 获取用户信息（使用新获取的 token）
      const userData = await authApi.getCurrentUser()
      console.log('[AuthContext] User data received:', userData)

      // 验证用户数据
      if (!userData || !userData.id) {
        throw new Error('登录失败：无法获取用户信息')
      }

      // Step 3: 保存到 localStorage（最后，确保数据完整后再保存）
      setUser(userData)
      setToken(access_token)

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, access_token)
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData))
        console.log('[AuthContext] Saved to localStorage')
      }

      if (showToast) {
        toast.success('登录成功')
        console.log('[AuthContext] Toast shown')
      }

      // 登录成功后导航到角色选择页面
      setTimeout(() => {
        console.log('[AuthContext] Navigating to /select-character')
        // 这里不能直接用 navigate，需要让调用方决定何时跳转
        // 因为 navigate 会立即改变路由，可能导致 Promise 中断
      }, 100)

    } catch (error: any) {
      console.error('[AuthContext] Login error:', error)
      const message = error?.response?.data?.detail || error?.message || '登录失败'
      toast.error(message)

      // 确保即使出错也要重置 loading 状态
      setIsLoading(false)

      // 对于已知错误，可以不 throw，让调用方处理
      if (error?.response?.status !== 401) {
        throw error
      }
    } finally {
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
