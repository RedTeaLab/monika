export interface ScriptResponse {
  id: string
  owner_id: number
  name: string
  description?: string
  script_type: string
  status: string
  metadata?: Record<string, any>
  cover_image_url?: string
  tags: string[]
  scene_count: number
  npc_count: number
  clue_count: number
  current_version: number
  validation_errors?: Array<{ field: string; message: string; code: string }>
  validation_warnings?: Array<{ field: string; message: string; code: string }>
  is_public: boolean
  download_count: number
  created_at?: string
  updated_at?: string
}

export interface ScriptListResponse {
  scripts: ScriptResponse[]
  total: number
  page: number
  page_size: number
}

export interface ScriptDetailResponse {
  script: ScriptResponse
  scenes: ScriptScene[]
  versions: ScriptVersion[]
}

export interface ScriptScene {
  id: string
  script_id: string
  name: string
  order_index: number
  description?: string
  location?: string
  time_of_day?: string
  atmosphere?: string
  npcs: any[]
  clues: any[]
  handouts: any[]
  estimated_duration_minutes?: number
}

export interface ScriptVersion {
  id: string
  script_id: string
  version_number: number
  change_notes?: string
  file_size_bytes?: number
  file_hash?: string
  validation_status?: string
  validation_errors?: any[]
  created_at?: string
}

export interface UploadResponse {
  success: boolean
  message: string
  validation_result?: {
    is_valid: boolean
    errors: Array<{ field: string; message: string; code: string }>
    warnings: Array<{ field: string; message: string; code: string }>
    stats: Record<string, number>
  }
  script_id?: string
}

export interface ScriptUpdateRequest {
  name?: string
  description?: string
  tags?: string[]
  is_public?: boolean
}
