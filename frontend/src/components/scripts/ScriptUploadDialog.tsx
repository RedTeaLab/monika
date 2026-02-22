import { useState, useRef } from 'react'
import { Upload, FileJson, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { scriptsApi } from '@/services/api/scripts'
import { toast } from 'sonner'

interface ScriptUploadDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ScriptUploadDialog({ open, onClose, onSuccess }: ScriptUploadDialogProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.json')) {
      toast.error('请上传 JSON 文件')
      return
    }
    setFile(selectedFile)
    setResult(null)
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setProgress(0)

    try {
      const interval = setInterval(() => {
        setProgress(p => Math.min(p + 10, 90))
      }, 200)

      const response = await scriptsApi.uploadScript(file)

      clearInterval(interval)
      setProgress(100)

      setResult(response)

      if (response.success) {
        toast.success(response.message)
        setTimeout(() => {
          onSuccess()
        }, 1500)
      }
    } catch (err: any) {
      toast.error(err.message || '上传失败')
      setResult({ success: false, message: err.message })
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    if (!uploading) {
      setFile(null)
      setResult(null)
      setProgress(0)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>上传脚本</DialogTitle>
          <DialogDescription>
            上传 JSON 格式的模组脚本文件
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileJson className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                拖拽文件到此处，或
              </p>
              <Button variant="outline" onClick={() => inputRef.current?.click()}>
                选择文件
              </Button>
            </>
          )}
        </div>

        {uploading && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-center text-muted-foreground">
              正在上传并校验...
            </p>
          </div>
        )}

        {result && (
          <div className={`p-4 rounded-lg ${result.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className={result.success ? 'text-green-500' : 'text-red-500'}>
                {result.message}
              </span>
            </div>

            {result.validation_result && (
              <div className="text-sm space-y-2">
                {result.validation_result.errors?.length > 0 && (
                  <div>
                    <p className="font-medium text-red-500">错误:</p>
                    <ul className="list-disc list-inside text-xs text-red-400">
                      {result.validation_result.errors.map((e: any, i: number) => (
                        <li key={i}>{e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.validation_result.warnings?.length > 0 && (
                  <div>
                    <p className="font-medium text-yellow-500 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      警告:
                    </p>
                    <ul className="list-disc list-inside text-xs text-yellow-400">
                      {result.validation_result.warnings.map((w: any, i: number) => (
                        <li key={i}>{w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.validation_result.stats && (
                  <div className="text-xs text-muted-foreground">
                    场景: {result.validation_result.stats.scene_count} |
                    NPC: {result.validation_result.stats.npc_count} |
                    线索: {result.validation_result.stats.clue_count}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            取消
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                上传中
              </>
            ) : (
              '上传'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
