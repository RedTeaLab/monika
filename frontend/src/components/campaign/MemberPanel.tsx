import { useState, useEffect } from 'react'
import {
  Crown,
  Shield,
  User,
  Eye,
  MoreVertical,
  UserMinus,
  userPlus,
} from 'lucide-react'
import { campaignsApi } from '@/services/api/campaigns'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import type { CampaignMember, CampaignRole } from '@/types/campaign'

interface MemberPanelProps {
  campaignId: string
  isKeeper: boolean
  currentUserId?: number
}

export function MemberPanel({
  campaignId,
  isKeeper,
  currentUserId,
}: MemberPanelProps) {
  const [members, setMembers] = useState<CampaignMember[]>([])
  const [loading, setLoading] = useState(true)

  const loadMembers = async () => {
    try {
      setLoading(true)
      const data = await campaignsApi.listCampaignMembers(campaignId)
      setMembers(data)
    } catch (err: any) {
      toast.error('加载成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [campaignId])

  const handleRemoveMember = async (memberId: string) => {
    try {
      await campaignsApi.removeCampaignMember(campaignId, memberId)
      toast.success('成员已移除')
      loadMembers()
    } catch (err: any) {
      toast.error(err.message || '移除失败')
    }
  }

  const handleUpdateRole = async (memberId: string, role: CampaignRole) => {
    try {
      await campaignsApi.updateMemberRole(campaignId, memberId, { role })
      toast.success('角色已更新')
      loadMembers()
    } catch (err: any) {
      toast.error(err.message || '更新失败')
    }
  }

  const getRoleIcon = (role: CampaignRole) => {
    switch (role) {
      case 'keeper':
        return <Crown className="h-4 w-4 text-yellow-500" />
      case 'co-keeper':
        return <Shield className="h-4 w-4 text-blue-500" />
      case 'player':
        return <User className="h-4 w-4 text-green-500" />
      case 'observer':
        return <Eye className="h-4 w-4 text-gray-500" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  const getRoleName = (role: CampaignRole) => {
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

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'inactive':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const getStatusName = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃'
      case 'inactive':
        return '离线'
      case 'kicked':
        return '已移除'
      case 'left':
        return '已离开'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-muted animate-pulse rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">成员列表</h3>
        <span className="text-sm text-muted-foreground">
          {members.filter((m) => m.status === 'active').length} 活跃成员
        </span>
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground text-sm font-medium">
                  {member.user_id.toString().slice(0, 2)}
                </div>
              </Avatar>

              <div>
                <div className="flex items-center gap-2">
                  {getRoleIcon(member.role as CampaignRole)}
                  <span className="font-medium">用户 #{member.user_id}</span>
                  {currentUserId === member.user_id && (
                    <Badge variant="outline" className="text-xs">
                      你
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{getRoleName(member.role as CampaignRole)}</span>
                  <span>•</span>
                  <Badge variant={getStatusVariant(member.status)} className="text-xs">
                    {getStatusName(member.status)}
                  </Badge>
                </div>
              </div>
            </div>

            {isKeeper && member.user_id !== currentUserId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2 py-1.5 text-sm font-semibold">
                    更改角色
                  </div>
                  <Select
                    defaultValue={member.role}
                    onValueChange={(value) =>
                      handleUpdateRole(member.id, value as CampaignRole)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keeper">主持人</SelectItem>
                      <SelectItem value="co-keeper">副主持人</SelectItem>
                      <SelectItem value="player">玩家</SelectItem>
                      <SelectItem value="observer">观察者</SelectItem>
                    </SelectContent>
                  </Select>
                  <DropdownMenuItem
                    onClick={() => handleRemoveMember(member.id)}
                    className="text-red-600"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    移除成员
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}

        {members.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            暂无成员
          </div>
        )}
      </div>
    </Card>
  )
}
