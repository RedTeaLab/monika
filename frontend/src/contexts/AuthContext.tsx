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
    setIsLoading(true)
    try {
      const response = await authApi.login({ username, password })

      // 获取用户信息
      const userData = await authApi.getCurrentUser()

      setToken(response.access_token)
      setUser(userData)

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, response.access_token)
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData))
      }

      if (showToast) {
        toast.success('登录成功')
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || '登录失败'
      toast.error(message)
      throw error
    } finally {
      setIsLoading(false)
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
