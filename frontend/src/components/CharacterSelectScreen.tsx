import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { characterApi, type Character, type CharacterCreate } from "@/lib/api"
import { CharacterForm, type CharacterData } from "@/components/CharacterForm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Play, Edit, Trash2, UserPlus, Loader2, User } from "lucide-react"

export function CharacterSelectScreen() {
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<Character[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Load characters on mount
  useEffect(() => {
    loadCharacters()
  }, [])

  const loadCharacters = async () => {
    setIsLoading(true)
    try {
      const data = await characterApi.list()
      setCharacters(data)
    } catch (error: any) {
      const message = error.response?.data?.detail || "加载角色列表失败"
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  // Convert API Character to CharacterForm format
  const apiToForm = (character: Character): Partial<CharacterData> => ({
    name: character.name,
    occupation: character.occupation,
    age: character.age,
    residence: "",
    background: character.backstory || "",
    str: character.str,
    con: character.con,
    dex: character.dex,
    app: character.app,
    pow: character.pow,
    int: character.int,
    siz: character.siz,
    edu: character.edu,
    hp: character.hp,
    mp: character.mp,
    san: character.max_san,
    luck: character.luck,
    move: 8,
    build: 0,
    skills: {},
  })

  // Convert CharacterForm to API format
  const formToApi = (data: CharacterData): CharacterCreate => ({
    name: data.name,
    age: data.age,
    gender: "未设置",
    occupation: data.occupation,
    mental_illness: "",
    backstory: data.background,
    str: data.str,
    con: data.con,
    dex: data.dex,
    app: data.app,
    pow: data.pow,
    intelligence: data.int,
    siz: data.siz,
    edu: data.edu,
    luck: data.luck,
  })

  // Handle play/start game with character
  const handlePlay = (character: Character) => {
    toast.success(`开始游戏: ${character.name}`)
    // Navigate to game screen with character data in state
    navigate('/game', { state: { character } })
  }

  // Handle edit character
  const handleEdit = (character: Character) => {
    setEditingCharacter(character)
  }

  // Handle delete click - open confirmation dialog
  const handleDeleteClick = (character: Character) => {
    setCharacterToDelete(character)
    setDeleteDialog(true)
  }

  // Handle delete confirm - actually delete the character
  const handleDeleteConfirm = async () => {
    if (!characterToDelete) return

    setIsDeleting(true)
    try {
      await characterApi.delete(characterToDelete.id)
      toast.success(`角色 "${characterToDelete.name}" 已删除`)
      setDeleteDialog(false)
      setCharacterToDelete(null)
      // Reload the list
      await loadCharacters()
    } catch (error: any) {
      const message = error.response?.data?.detail || "删除失败"
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  // Callback: Character created
  const handleCharacterCreated = async (data: CharacterData) => {
    try {
      const apiData = formToApi(data)
      await characterApi.create(apiData)
      toast.success("角色创建成功")
      setIsCreating(false)
      await loadCharacters()
    } catch (error: any) {
      const message = error.response?.data?.detail || "创建失败"
      toast.error(message)
      throw error
    }
  }

  // Callback: Character updated
  const handleCharacterUpdated = async (data: CharacterData) => {
    if (!editingCharacter) return

    try {
      const apiData = formToApi(data)
      await characterApi.update(editingCharacter.id, apiData)
      toast.success("角色更新成功")
      setEditingCharacter(null)
      await loadCharacters()
    } catch (error: any) {
      const message = error.response?.data?.detail || "更新失败"
      toast.error(message)
      throw error
    }
  }

  // Cancel edit/create
  const handleCancelEdit = () => {
    setEditingCharacter(null)
    setIsCreating(false)
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User className="h-8 w-8" />
            我的角色
          </h1>
          <p className="text-muted-foreground mt-1">
            选择一个角色开始游戏，或创建新角色
          </p>
        </div>
        {!isCreating && !editingCharacter && characters.length > 0 && (
          <Button onClick={() => setIsCreating(true)} size="lg">
            <UserPlus className="h-4 w-4 mr-2" />
            创建角色
          </Button>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {/* Empty State - Inline CharacterForm */}
      {!isLoading && characters.length === 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>创建你的第一个角色</CardTitle>
          </CardHeader>
          <CardContent>
            <CharacterForm
              onSave={handleCharacterCreated}
              isLoading={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Creating New Character - Inline Form */}
      {!isLoading && isCreating && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>创建新角色</CardTitle>
          </CardHeader>
          <CardContent>
            <CharacterForm
              onSave={handleCharacterCreated}
              onCancel={handleCancelEdit}
              isLoading={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Editing Character - Inline Form */}
      {!isLoading && editingCharacter && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>编辑角色: {editingCharacter.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <CharacterForm
              initialData={apiToForm(editingCharacter)}
              onSave={handleCharacterUpdated}
              onCancel={handleCancelEdit}
              isLoading={false}
            />
          </CardContent>
        </Card>
      )}

      {/* Character List Table */}
      {!isLoading && !isCreating && !editingCharacter && characters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>角色列表 ({characters.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>职业</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>属性</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {characters.map((character) => (
                  <TableRow key={character.id}>
                    <TableCell className="font-medium">{character.name}</TableCell>
                    <TableCell>{character.occupation || "无"}</TableCell>
                    <TableCell>{character.age}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="outline">STR {character.str}</Badge>
                        <Badge variant="outline">DEX {character.dex}</Badge>
                        <Badge variant="outline">POW {character.pow}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        HP {character.hp}/{character.hp}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePlay(character)}
                          title="开始游戏"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(character)}
                          title="编辑"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(character)}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除角色 "{characterToDelete?.name}" 吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(false)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
