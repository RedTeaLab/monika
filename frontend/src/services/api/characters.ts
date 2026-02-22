import api from '@/lib/api'

interface GenerationRequest {
  backstory?: string
  occupation?: string
  era?: string
  min_age?: number
  max_age?: number
  gender?: string
}

interface GeneratedCharacter {
  name: string
  age: number
  gender: string
  occupation: string
  backstory: string
  str_stat: number
  con_stat: number
  dex_stat: number
  app_stat: number
  pow_stat: number
  int_stat: number
  siz_stat: number
  edu_stat: number
  hp: number
  mp: number
  san: number
  luck: number
  skills: Record<string, number>
  personality_traits: string[]
  motivations: string[]
}

export const charactersApi = {
  async getCharacters(): Promise<any[]> {
    const response = await api.get('/characters')
    return response.data
  },

  async getCharacter(id: number): Promise<any> {
    const response = await api.get(`/characters/${id}`)
    return response.data
  },

  async createCharacter(data: any): Promise<any> {
    const response = await api.post('/characters', data)
    return response.data
  },

  async updateCharacter(id: number, data: any): Promise<any> {
    const response = await api.put(`/characters/${id}`, data)
    return response.data
  },

  async deleteCharacter(id: number): Promise<void> {
    await api.delete(`/characters/${id}`)
  },

  async toggleFavorite(id: number): Promise<{ is_favorite: boolean }> {
    const response = await api.post(`/characters/${id}/favorite`)
    return response.data
  },

  async createShareLink(id: number): Promise<{ share_code: string; share_url: string }> {
    const response = await api.post(`/characters/${id}/share`)
    return response.data
  },

  async getSharedCharacter(shareCode: string): Promise<any> {
    const response = await api.get(`/characters/shared/${shareCode}`)
    return response.data
  },

  async copySharedCharacter(shareCode: string): Promise<any> {
    const response = await api.post(`/characters/shared/${shareCode}/copy`)
    return response.data
  },

  async getTemplates(): Promise<any[]> {
    const response = await api.get('/characters/templates')
    return response.data
  },

  async setAsTemplate(id: number): Promise<{ is_template: boolean }> {
    const response = await api.post(`/characters/${id}/template`)
    return response.data
  },

  async generateCharacter(request: GenerationRequest): Promise<any> {
    const response = await api.post('/characters/generate', request)
    return response.data
  },

  async previewGeneration(request: GenerationRequest): Promise<GeneratedCharacter> {
    const response = await api.post('/characters/generate/preview', request)
    return response.data
  },

  async validateCharacter(id: number): Promise<any> {
    const response = await api.get(`/characters/${id}/validate`)
    return response.data
  },
}
