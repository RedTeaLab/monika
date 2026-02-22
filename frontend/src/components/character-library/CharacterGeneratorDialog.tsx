import { useState } from 'react'
import { Wand2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { charactersApi } from '@/services/api/characters'
import { toast } from 'sonner'

interface CharacterGeneratorDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const OCCUPATIONS = [
  { value: 'antiquarian', label: '古董商' },
  { value: 'artist', label: '艺术家' },
  { value: 'athlete', label: '运动员' },
  { value: 'author', label: '作家' },
  { value: 'detective', label: '侦探' },
  { value: 'doctor', label: '医生' },
  { value: 'engineer', label: '工程师' },
  { value: 'journalist', label: '记者' },
  { value: 'lawyer', label: '律师' },
  { value: 'librarian', label: '图书管理员' },
  { value: 'professor', label: '教授' },
  { value: 'soldier', label: '士兵' },
]

export function CharacterGeneratorDialog({ open, onClose, onSuccess }: CharacterGeneratorDialogProps) {
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [backstory, setBackstory] = useState('')
  const [occupation, setOccupation] = useState('')
  const [era, setEra] = useState('1920s')

  const handlePreview = async () => {
    setPreviewing(true)
    try {
      const result = await charactersApi.previewGeneration({
        backstory: backstory || undefined,
        occupation: occupation || undefined,
        era,
      })
      setPreview(result)
    } catch (err: any) {
      toast.error(err.message || '生成预览失败')
    } finally {
      setPreviewing(false)
    }
  }

  const handleGenerate = async () => {
    if (!preview) {
      toast.error('请先预览角色')
      return
    }

    setLoading(true)
    try {
      await charactersApi.generateCharacter({
        backstory: backstory || undefined,
        occupation: occupation || undefined,
        era,
      })
      toast.success('角色已创建')
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || '创建角色失败')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setPreview(null)
      setBackstory('')
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            AI 角色生成器
          </DialogTitle>
          <DialogDescription>
            输入背景描述或选择职业，AI 将为你生成完整的调查员角色
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="backstory">背景故事描述 (可选)</Label>
            <Textarea
              id="backstory"
              placeholder="描述你想要的角色背景，例如：一个在伦敦长大的私家侦探，曾经是警察..."
              value={backstory}
              onChange={(e) => setBackstory(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="occupation">职业</Label>
              <select
                id="occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">随机</option>
                {OCCUPATIONS.map((occ) => (
                  <option key={occ.value} value={occ.value}>
                    {occ.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="era">时代背景</Label>
              <select
                id="era"
                value={era}
                onChange={(e) => setEra(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="1920s">经典 1920年代</option>
                <option value="modern">现代</option>
                <option value="gaslight">维多利亚时代</option>
                <option value="delta_green">Delta Green</option>
              </select>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handlePreview}
            disabled={previewing}
          >
            {previewing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                生成预览中...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                生成预览
              </>
            )}
          </Button>

          {preview && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{preview.name}</h3>
                <span className="text-sm text-muted-foreground">
                  {preview.age}岁 · {preview.gender === 'male' ? '男' : '女'}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">{preview.occupation}</p>

              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">STR</div>
                  <div className="font-bold">{preview.str_stat}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">CON</div>
                  <div className="font-bold">{preview.con_stat}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">DEX</div>
                  <div className="font-bold">{preview.dex_stat}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">INT</div>
                  <div className="font-bold">{preview.int_stat}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">POW</div>
                  <div className="font-bold">{preview.pow_stat}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">HP</div>
                  <div className="font-bold">{preview.hp}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">MP</div>
                  <div className="font-bold">{preview.mp}</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="text-muted-foreground">SAN</div>
                  <div className="font-bold">{preview.san}</div>
                </div>
              </div>

              <p className="text-sm line-clamp-3">{preview.backstory}</p>

              {preview.personality_traits && (
                <div className="flex flex-wrap gap-1">
                  {preview.personality_traits.map((trait: string, i: number) => (
                    <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {trait}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleGenerate} disabled={!preview || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              '创建角色'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
