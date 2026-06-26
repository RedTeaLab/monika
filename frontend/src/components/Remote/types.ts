export interface RemoteClientInfo {
    id: string
    remote_addr: string
    connected_at: string
    last_heartbeat: string
}

export interface RemoteLogEntry {
    time: string
    client_id: string
    event: string
    method?: string
    detail?: string
}

export interface RemoteStatus {
    mode: 'idle' | 'serving' | 'connecting' | 'connected'
    fingerprint?: string
    endpoint?: string
}
