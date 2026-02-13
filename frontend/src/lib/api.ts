import axios from 'axios'
import type {
  Combat,
  Combatant,
  TurnResponse,
  AttackRequest,
  AttackResponse,
  HealRequest,
  HealResponse,
  CombatCreateRequest,
  CombatantCreateRequest,
  CombatLogEntry,
  CombatState,
  CombatantRole,
  SuccessLevel,
  DamageType,
} from '../types/combat'
import type {
  Chase,
  ChaseRoundRequest,
  ChaseRoundResponse,
  ObstacleCheckRequest,
  ObstacleResponse,
  ChaseEndRequest,
  ChaseCreateRequest,
  ChaseParticipantCreateRequest,
  ChaseParticipant,
  ChaseState,
  ChaseEndReason,
  ChaseParticipantRole,
  ObstacleType,
  ObstacleDifficulty,
} from '../types/chase'

// 存储键名常量
export const STORAGE_KEYS = {
  TOKEN: 'monika_token',
  USER: 'monika_user',
} as const

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器 - 解包 API 响应并处理 401
api.interceptors.response.use(
  (response) => {
    // API 返回格式: { code: 0, message: "...", data: ... }
    // 解包 data 字段，如果 code 不为 0 则抛出错误
    const data = response.data as any
    if (data && typeof data === 'object' && 'code' in data && 'data' in data) {
      if (data.code === 0) {
        // 成功响应，返回 data 字段内容
        response.data = data.data
      } else {
        // 业务错误，抛出异常
        return Promise.reject(new Error(data.message || '请求失败'))
      }
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN)
      localStorage.removeItem(STORAGE_KEYS.USER)
      window.location.href = '/auth'
    }
    return Promise.reject(error)
  }
)

// 类型定义
export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface User {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
}

export interface Character {
  id: number
  owner_id: number
  name: string
  age: number
  gender: string
  occupation: string
  mental_illness: string
  backstory: string
  str: number
  con: number
  dex: number
  app: number
  pow: number
  int: number
  siz: number
  edu: number
  hp: number
  mp: number
  san: number
  max_san: number
  luck: number
  created_at: string
  updated_at: string
}

// 创建/更新时使用的类型（排除只读字段）
export interface CharacterCreate {
  name: string
  age: number
  gender: string
  occupation: string
  mental_illness?: string
  backstory?: string
  str: number
  con: number
  dex: number
  app: number
  pow: number
  intelligence: number  // 后端实际字段名
  siz: number
  edu: number
  luck?: number
}

// 认证 API
export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', data)
    return response.data
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await api.post<User>('/auth/register', data)
    return response.data
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me')
    return response.data
  },
}

// 角色 API
export const characterApi = {
  list: async (): Promise<Character[]> => {
    const response = await api.get<Character[]>('/characters')
    return response.data
  },

  getById: async (id: number): Promise<Character> => {
    const response = await api.get<Character>(`/characters/${id}`)
    return response.data
  },

  create: async (data: CharacterCreate): Promise<Character> => {
    const response = await api.post<Character>('/characters', data)
    return response.data
  },

  update: async (id: number, data: Partial<CharacterCreate>): Promise<Character> => {
    const response = await api.put<Character>(`/characters/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/characters/${id}`)
  },

  getOccupations: async (): Promise<any[]> => {
    const response = await api.get('/occupations/')
    const data = response.data
    // Handle both object and array response formats
    if (Array.isArray(data)) {
      return data
    } else if (typeof data === 'object') {
      return Object.values(data)
    }
    return []
  },
}

// Re-export combat types
export type {
  Combat,
  Combatant,
  TurnResponse,
  AttackRequest,
  AttackResponse,
  HealRequest,
  HealResponse,
  CombatCreateRequest,
  CombatantCreateRequest,
  CombatLogEntry,
  CombatState,
  CombatantRole,
  SuccessLevel,
  DamageType,
}

// Combat API
export const combatApi = {
  start: async (data: CombatCreateRequest): Promise<Combat> => {
    const response = await api.post<Combat>('/combat/start', data)
    return response.data
  },

  getById: async (id: string): Promise<Combat> => {
    const response = await api.get<Combat>(`/combat/${id}`)
    return response.data
  },

  getTurnOrder: async (id: string): Promise<Combatant[]> => {
    const response = await api.get<Combatant[]>(`/combat/${id}/turn-order`)
    return response.data
  },

  nextTurn: async (id: string): Promise<TurnResponse> => {
    const response = await api.post<TurnResponse>(`/combat/${id}/turn`)
    return response.data
  },

  attack: async (id: string, data: AttackRequest): Promise<AttackResponse> => {
    const response = await api.post<AttackResponse>(`/combat/${id}/attack`, data)
    return response.data
  },

  heal: async (id: string, data: HealRequest): Promise<HealResponse> => {
    const response = await api.post<HealResponse>(`/combat/${id}/heal`, data)
    return response.data
  },

  addCombatant: async (id: string, data: CombatantCreateRequest): Promise<Combatant> => {
    const response = await api.post<Combatant>(`/combat/${id}/combatants`, data)
    return response.data
  },

  end: async (id: string): Promise<Combat> => {
    const response = await api.post<Combat>(`/combat/${id}/end`)
    return response.data
  },
}

// Re-export chase types
export type {
  Chase,
  ChaseRoundRequest,
  ChaseRoundResponse,
  ObstacleCheckRequest,
  ObstacleResponse,
  ChaseEndRequest,
  ChaseCreateRequest,
  ChaseParticipantCreateRequest,
  ChaseParticipant,
  ChaseState,
  ChaseEndReason,
  ChaseParticipantRole,
  ObstacleType,
  ObstacleDifficulty,
}

// Chase API
export const chaseApi = {
  // Start a new chase session
  start: async (data: ChaseCreateRequest): Promise<Chase> => {
    const response = await api.post<Chase>('/chase/start', data)
    return response.data
  },

  // Get chase session by ID
  getById: async (id: string): Promise<Chase> => {
    const response = await api.get<Chase>(`/chase/${id}`)
    return response.data
  },

  // Execute round actions
  executeRound: async (id: string, data: ChaseRoundRequest): Promise<ChaseRoundResponse> => {
    const response = await api.post<ChaseRoundResponse>(`/chase/${id}/round`, data)
    return response.data
  },

  // Generate obstacles
  generateObstacles: async (id: string): Promise<ObstacleResponse> => {
    const response = await api.post<ObstacleResponse>(`/chase/${id}/obstacles/generate`)
    return response.data
  },

  // End chase
  end: async (id: string, data?: ChaseEndRequest): Promise<void> => {
    await api.post(`/chase/${id}/end`, data || {})
  },

  // Add participant
  addParticipant: async (id: string, data: ChaseParticipantCreateRequest): Promise<ChaseParticipant> => {
    const response = await api.post<ChaseParticipant>(`/chase/${id}/participants`, data)
    return response.data
  },
}
