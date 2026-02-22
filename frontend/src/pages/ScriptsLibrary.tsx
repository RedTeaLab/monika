import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Filter, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScriptCard } from '@/components/scripts/ScriptCard'
import { ScriptUploadDialog } from '@/components/scripts/ScriptUploadDialog'
import { scriptsApi } from '@/services/api/scripts'
import { toast } from 'sonner'
import type { ScriptResponse } from '@/types/script'

export function ScriptsLibrary() {
  const [scripts, setScripts] = useState<ScriptResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showUpload, setShowUpload] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 12

  const fetchScripts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await scriptsApi.getScripts({
        page,
        page_size: pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      })
      setScripts(response.scripts)
      setTotal(response.total)
    } catch (err: any) {
      toast.error(err.message || '加载脚本失败')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchScripts()
  }, [fetchScripts])

  const handleUploadSuccess = () => {
    setShowUpload(false)
    fetchScripts()
  }

  const handleDelete = async (id: string) => {
    try {
      await scriptsApi.deleteScript(id)
      toast.success('脚本已删除')
      fetchScripts()
    } catch (err: any) {
      toast.error(err.message || '删除失败')
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">脚本库</h1>
          <p className="text-muted-foreground">管理和上传你的模组脚本</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4 mr-2" />
          上传脚本
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索脚本..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-2"
        >
          <option value="">全部状态</option>
          <option value="valid">有效</option>
          <option value="invalid">无效</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : scripts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">暂无脚本</p>
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4 mr-2" />
            上传第一个脚本
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}

      <ScriptUploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  )
}
