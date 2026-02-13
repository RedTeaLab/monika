import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { characterApi, type Character } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { InvestigatorFileCard, InvestigatorFileCardSkeleton } from '@/components/InvestigatorFileCard'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import {
  Edit,
  Trash2,
  User,
  Plus,
  Loader2,
} from 'lucide-react'
import type { InvestigatorData } from '@/types/investigator'

/**
 * Convert Character API response to InvestigatorData format
 */
function characterToInvestigatorData(char: Character): Partial<InvestigatorData> {
  return {
    name: char.name,
    age: char.age,
    gender: char.gender as 'male' | 'female' | 'other',
    occupation: char.occupation,
    attributes: {
      str: char.str,
      con: char.con,
      siz: char.siz,
      dex: char.dex,
      app: char.app,
      int: char.int,
      pow: char.pow,
      edu: char.edu,
    },
    hp: {
      current: char.hp,
      max: char.hp, // Assuming max HP is same as current for display
    },
    mp: {
      current: char.mp,
      max: char.mp, // Assuming max MP is same as current for display
    },
    sanity: {
      current: char.san,
      max: char.max_san || 99,
    },
    luck: {
      current: char.luck || 50,
      max: char.luck || 50,
    },
  }
}

export function CharacterListPage() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    // Load character list
    const fetchCharacters = async () => {
      try {
        setLoading(true)
        const data = await characterApi.list()
        setCharacters(data)
      } catch (err) {
        console.error('Failed to load characters:', err)
        toast({
          variant: 'destructive',
          title: '加载失败',
          description: '无法加载调查员列表，请稍后重试',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchCharacters()
  }, [toast])

  const handleCreateNew = () => {
    navigate('/character/new')
  }

  const handleEdit = (id: number) => {
    navigate(`/character/${id}/edit`)
  }

  const handleDelete = (id: number) => {
    setDeleteDialog(id)
  }

  const confirmDelete = async () => {
    if (!deleteDialog) return

    try {
      setDeleting(true)
      await characterApi.delete(deleteDialog)

      // Remove from list
      setCharacters(prev => prev.filter(char => char.id !== deleteDialog))
      setDeleteDialog(null)

      toast({
        title: '删除成功',
        description: '调查员档案已删除',
      })
    } catch (err) {
      console.error('Failed to delete character:', err)
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: '无法删除调查员，请稍后重试',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">调查员档案</h1>
              <p className="text-sm text-gray-500 mt-1">
                {user?.username || '调查员'} · 美国阿卡姆探员协会
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleCreateNew}
              className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            >
              <Plus className="h-4 w-4 mr-2" />
              创建调查员
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {loading ? (
          // Loading state
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <p className="text-center text-gray-500">加载调查员档案...</p>
            </div>
            <div className="space-y-6">
              <InvestigatorFileCardSkeleton />
              <InvestigatorFileCardSkeleton />
            </div>
          </div>
        ) : characters.length === 0 ? (
          // Empty state
          <Card className="max-w-md mx-auto border-dashed border-2 border-gray-300 bg-gray-50/50">
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <User className="h-8 w-8 text-gray-400" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">还没有创建调查员</h3>
                <p className="text-sm text-gray-500">
                  创建你的第一个调查员档案，开始克苏鲁的呼唤之旅
                </p>
              </div>
              <Button
                onClick={handleCreateNew}
                className="bg-gray-900 text-white hover:bg-gray-800"
              >
                <Plus className="h-4 w-4 mr-2" />
                创建调查员
              </Button>
            </div>
          </Card>
        ) : (
          // Character list
          <div className="space-y-6 max-w-4xl mx-auto">
            {characters.map((char) => (
              <div key={char.id} className="relative group">
                <InvestigatorFileCard
                  data={characterToInvestigatorData(char)}
                  editable={false}
                  className="transition-all duration-200 hover:shadow-xl"
                />

                {/* Action buttons */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(char.id)}
                    className="bg-white/90 backdrop-blur-sm border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 shadow-sm"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(char.id)}
                    className="bg-white/90 backdrop-blur-sm border-red-300 text-red-700 hover:bg-red-50 hover:text-red-900 shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation dialog */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
              <p className="text-sm text-gray-600 mb-6">
                确定要删除这个调查员档案吗？此操作无法撤销。
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialog(null)}
                  disabled={deleting}
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      删除中...
                    </>
                  ) : (
                    '删除'
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default CharacterListPage
