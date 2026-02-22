import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Calendar, Settings } from 'lucide-react'
import { campaignsApi } from '@/services/api/campaigns'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateCampaignDialog } from './CreateCampaignDialog'
import { JoinCampaignDialog } from './JoinCampaignDialog'
import type { Campaign } from '@/types/campaign'

export function CampaignList() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showJoinDialog, setShowJoinDialog] = useState(false)

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await campaignsApi.listCampaigns()
      setCampaigns(data)
    } catch (err: any) {
      setError(err.message || '加载失败')
      toast.error('加载战役列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  const handleCreateSuccess = () => {
    setShowCreateDialog(false)
    loadCampaigns()
    toast.success('战役创建成功')
  }

  const handleJoinSuccess = () => {
    setShowJoinDialog(false)
    loadCampaigns()
    toast.success('加入战役成功')
  }

  const handleCampaignClick = (campaignId: string) => {
    navigate(`/campaigns/${campaignId}`)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-6 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/2 mb-4" />
            <Skeleton className="h-10 w-24" />
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="p-12 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={loadCampaigns}>重试</Button>
      </Card>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">没有战役</h3>
          <p className="text-muted-foreground mb-6">
            创建一个新战役或使用邀请码加入现有战役
          </p>
          <div className="flex justify-center gap-4">
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              创建战役
            </Button>
            <Button variant="outline" onClick={() => setShowJoinDialog(true)}>
              加入战役
            </Button>
          </div>
        </Card>

        {showCreateDialog && (
          <CreateCampaignDialog
            open={showCreateDialog}
            onClose={() => setShowCreateDialog(false)}
            onSuccess={handleCreateSuccess}
          />
        )}

        {showJoinDialog && (
          <JoinCampaignDialog
            open={showJoinDialog}
            onClose={() => setShowJoinDialog(false)}
            onSuccess={handleJoinSuccess}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">我的战役</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowJoinDialog(true)}>
            加入战役
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建战役
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <Card
            key={campaign.id}
            className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleCampaignClick(campaign.id)}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold line-clamp-1">
                {campaign.name}
              </h3>
              {campaign.status === 'active' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  进行中
                </span>
              )}
            </div>

            {campaign.description && (
              <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                {campaign.description}
              </p>
            )}

            <div className="flex items-center text-sm text-muted-foreground gap-4">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{campaign.max_players} 人</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(campaign.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  {campaign.invite_code}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(campaign.invite_code)
                    toast.success('邀请码已复制')
                  }}
                >
                  复制
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showCreateDialog && (
        <CreateCampaignDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {showJoinDialog && (
        <JoinCampaignDialog
          open={showJoinDialog}
          onClose={() => setShowJoinDialog(false)}
          onSuccess={handleJoinSuccess}
        />
      )}
    </div>
  )
}
