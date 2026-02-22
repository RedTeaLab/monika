import api from '@/lib/api'
import type {
  ScriptResponse,
  ScriptListResponse,
  ScriptDetailResponse,
  UploadResponse,
  ScriptUpdateRequest,
} from '@/types/script'

interface GetScriptsParams {
  page?: number
  page_size?: number
  status?: string
  type?: string
  search?: string
}

export const scriptsApi = {
  async getScripts(params: GetScriptsParams = {}): Promise<ScriptListResponse> {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.page_size) searchParams.set('page_size', String(params.page_size))
    if (params.status) searchParams.set('status', params.status)
    if (params.type) searchParams.set('type', params.type)
    if (params.search) searchParams.set('search', params.search)

    const response = await api.get(`/scripts?${searchParams.toString()}`)
    return response.data
  },

  async getPublicScripts(params: GetScriptsParams = {}): Promise<ScriptListResponse> {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.page_size) searchParams.set('page_size', String(params.page_size))
    if (params.search) searchParams.set('search', params.search)

    const response = await api.get(`/scripts/public?${searchParams.toString()}`)
    return response.data
  },

  async getScript(id: string): Promise<ScriptDetailResponse> {
    const response = await api.get(`/scripts/${id}`)
    return response.data
  },

  async uploadScript(file: File): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/scripts/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async updateScript(id: string, data: ScriptUpdateRequest): Promise<ScriptResponse> {
    const response = await api.put(`/scripts/${id}`, data)
    return response.data
  },

  async deleteScript(id: string): Promise<void> {
    await api.delete(`/scripts/${id}`)
  },

  async getVersions(scriptId: string): Promise<any[]> {
    const response = await api.get(`/scripts/${scriptId}/versions`)
    return response.data
  },

  async getVersion(scriptId: string, versionNumber: number): Promise<any> {
    const response = await api.get(`/scripts/${scriptId}/versions/${versionNumber}`)
    return response.data
  },

  async validateScript(scriptId: string): Promise<any> {
    const response = await api.post(`/scripts/${scriptId}/validate`)
    return response.data
  },
}
