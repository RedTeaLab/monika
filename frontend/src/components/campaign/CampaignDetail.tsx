import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Users,
  Settings,
  ArrowLeft,
  Trash2,
  UserPlus,
  Crown,
  Shield,
  User,
  Eye,
} from 'lucide-react'
import { campaignsApi } from '@/services/api/campaigns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { InviteCodeDisplay } from './InviteCodeDisplay'
import { CreateCampaignDialog } from './CreateCampaignDialog'
import { JoinCampaignDialog } from './JoinCampaignDialog'
import type { Campaign, CampaignMember } from '@/types/campaign'

export function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [members, setMembers] = useState<CampaignMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadData = async () => {
    if (!campaignId) return

    try {
      setLoading(true)
      setError(null)
      const [campaignData, membersData] = await Promise.all([
        campaignsApi.getCampaign(campaignId),
        campaignsApi.listCampaignMembers(campaignId),
      ])
      setCampaign(campaignData)
      setMembers(membersData)
    } catch (err: any) {
      setError(err.message || '加载失败')
      toast.error('加载战役详情失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [campaignId])

  const handleDelete = async () => {
    if (!campaignId) return

    setDeleting(true)
    try {
      await campaignsApi.deleteCampaign(campaignId)
      toast.success('战役已删除')
      navigate('/campaigns')
    } catch (err: any) {
      toast.error(err.message || '删除失败')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleEditSuccess = () => {
    setShowEditDialog(false)
    loadData()
    toast.success('战役已更新')
  }

  const handleInviteSuccess = () => {
    setShowInviteDialog(false)
    loadData()
    toast.success('玩家已加入')
  }

  const handleGenerateInviteCode = async () => {
    if (!campaignId) return

    try {
      const result = await campaignsApi.generateInviteCode(campaignId)
      toast.success('新邀请码已生成')
      // Reload campaign to get new invite code
      loadData()
    } catch (err: any) {
      toast.error(err.message || '生成邀请码失败')
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'keeper':
        return <Crown className="h-4 w-4" />
      case 'co-keeper':
        return <Shield className="h-4 w-4" />
      case 'player':
        return <User className="h-4 w-4" />
      case 'observer':
        return <Eye className="h-4 w-4" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  const getRoleName = (role: string) => {
    switch (role) {
      case 'keeper':
        return '主持人'
      case 'co-keeper':
        return '副主持人'
      case 'player':
        return '玩家'
      case 'observer':
        return '观察者'
      default:
        return role
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted animate-pulse rounded w-1/3" />
        <Card className="p-6">
          <div className="h-6 bg-muted animate-pulse rounded w-1/2 mb-4" />
          <div className="h-4 bg-muted animate-pulse rounded w-3/4 mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
        </Card>
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <Card className="p-12 text-center">
        <p className="text-red-500 mb-4">{error || '战役未找到'}</p>
        <Button onClick={() => navigate('/campaigns')}>返回列表</Button>
      </Card>
    )
  }

  const activeMemberCount = members.filter(
    (m) => m.status === 'active'
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/campaigns')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <p className="text-muted-foreground">
              创建于 {new Date(campaign.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            编辑
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
        </div>
      </div>

      {/* Campaign Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">战役信息</h2>
          <div className="space-y-4">
            {campaign.description && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">描述</p>
                <p>{campaign.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">状态</p>
              <Badge
                variant={
                  campaign.status === 'active'
                    ? 'default'
                    : campaign.status === 'paused'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {campaign.status === 'active'
                  ? '进行中'
                  : campaign.status === 'paused'
                  ? '暂停'
                  : campaign.status === 'ended'
                  ? '已结束'
                  : '已归档'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                玩家限制
              </p>
              <p className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {activeMemberCount} / {campaign.max_players}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">邀请码</h2>
            <Button variant="outline" size="sm" onClick={handleGenerateInviteCode}>
              重新生成
            </Button>
          </div>
          <InviteCodeDisplay inviteCode={campaign.invite_code} />
        </Card>
      </div>

      {/* Members */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">成员</h2>
          <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            添加成员
          </Button>
        </div>

        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getRoleIcon(member.role)}
                <div>
                  <p className="font-medium">用户 #{member.user_id}</p>
                  <p className="text-sm text-muted-foreground">
                    {getRoleName(member.role)}
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  member.status === 'active'
                    ? 'default'
                    : member.status === 'inactive'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {member.status === 'active'
                  ? '活跃'
                  : member.status === 'inactive'
                  ? '离线'
                  : member.status === 'kicked'
                  ? '已移除'
                  : '已离开'}
              </Badge>
            </div>
          ))}

          {members.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              暂无成员
            </p>
          )}
        </div>
      </Card>

      {/* Dialogs */}
      {showDeleteDialog && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除战役</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除战役"{campaign.name}"吗？此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? '删除中...' : '确认删除'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showEditDialog && (
        <CreateCampaignDialog
          open={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          onSuccess={handleEditSuccess}
          campaign={campaign}
        />
      )}

      {showInviteDialog && campaignId && (
        <JoinCampaignDialog
          open={showInviteDialog}
          onClose={() => setShowInviteDialog(false)}
          onSuccess={handleInviteSuccess}
          campaignId={campaignId}
        />
      )}
    </div>
  )
}
