// Campaign components tests
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { CampaignList } from '@/components/campaign/CampaignList'
import { CreateCampaignDialog } from '@/components/campaign/CreateCampaignDialog'
import { InviteCodeDisplay } from '@/components/campaign/InviteCodeDisplay'
import { JoinCampaignDialog } from '@/components/campaign/JoinCampaignDialog'
import { campaignsApi } from '@/services/api/campaigns'
import type { Campaign } from '@/types/campaign'

// Mock the campaigns API
vi.mock('@/services/api/campaigns', () => ({
  campaignsApi: {
    listCampaigns: vi.fn(),
    createCampaign: vi.fn(),
    getCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    generateInviteCode: vi.fn(),
    joinCampaign: vi.fn(),
    listCampaignMembers: vi.fn(),
    removeCampaignMember: vi.fn(),
    updateMemberRole: vi.fn(),
  },
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

const mockCampaigns: Campaign[] = [
  {
    id: '1',
    name: 'The Haunted Manor',
    description: 'A spooky adventure',
    keeper_id: 1,
    scenario_id: null,
    invite_code: 'ABCD1234',
    max_players: 4,
    status: 'active',
    settings: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'The Lost Temple',
    description: 'An archaeological expedition',
    keeper_id: 1,
    scenario_id: null,
    invite_code: 'EFGH5678',
    max_players: 6,
    status: 'active',
    settings: {},
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
]

function createTestWrapper() {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return <BrowserRouter>{children}</BrowserRouter>
  }
}

describe('CampaignList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(campaignsApi.listCampaigns).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<CampaignList />, { wrapper: createTestWrapper() })
    expect(screen.getByText(/加载中/i)).toBeInTheDocument()
  })

  it('renders campaign list', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue(mockCampaigns)

    render(<CampaignList />, { wrapper: createTestWrapper() })

    await waitFor(() => {
      expect(screen.getByText('The Haunted Manor')).toBeInTheDocument()
      expect(screen.getByText('The Lost Temple')).toBeInTheDocument()
    })
  })

  it('renders empty state when no campaigns', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([])

    render(<CampaignList />, { wrapper: createTestWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/没有战役/i)).toBeInTheDocument()
    })
  })

  it('handles error state', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockRejectedValue(new Error('Failed to load'))

    render(<CampaignList />, { wrapper: createTestWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/加载失败/i)).toBeInTheDocument()
    })
  })

  it('opens create dialog when button clicked', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([])

    render(<CampaignList />, { wrapper: createTestWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/创建战役/i)).toBeInTheDocument()
    })

    const createButton = screen.getByText(/创建战役/i)
    await userEvent.click(createButton)

    // Dialog should be rendered
    await waitFor(() => {
      expect(screen.getByText(/创建新战役/i)).toBeInTheDocument()
    })
  })
})

describe('CreateCampaignDialog', () => {
  it('renders dialog fields', () => {
    const onClose = vi.fn()
    render(<CreateCampaignDialog open={true} onClose={onClose} />, {
      wrapper: createTestWrapper(),
    })

    expect(screen.getByLabelText(/战役名称/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/描述/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/最大玩家数/i)).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    const onClose = vi.fn()
    render(<CreateCampaignDialog open={true} onClose={onClose} />, {
      wrapper: createTestWrapper(),
    })

    const submitButton = screen.getByText(/创建/i)
    await userEvent.click(submitButton)

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/名称为必填项/i)).toBeInTheDocument()
    })
  })

  it('submits valid campaign data', async () => {
    const onClose = vi.fn()
    vi.mocked(campaignsApi.createCampaign).mockResolvedValue(mockCampaigns[0])

    render(<CreateCampaignDialog open={true} onClose={onClose} />, {
      wrapper: createTestWrapper(),
    })

    const nameInput = screen.getByLabelText(/战役名称/i)
    await userEvent.type(nameInput, 'Test Campaign')

    const submitButton = screen.getByText(/创建/i)
    await userEvent.click(submitButton)

    await waitFor(() => {
      expect(campaignsApi.createCampaign).toHaveBeenCalledWith({
        name: 'Test Campaign',
      })
      expect(toast.success).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('closes dialog on cancel', async () => {
    const onClose = vi.fn()
    render(<CreateCampaignDialog open={true} onClose={onClose} />, {
      wrapper: createTestWrapper(),
    })

    const cancelButton = screen.getByText(/取消/i)
    await userEvent.click(cancelButton)

    expect(onClose).toHaveBeenCalled()
  })
})

describe('InviteCodeDisplay', () => {
  it('displays invite code', () => {
    render(<InviteCodeDisplay inviteCode="ABCD1234" />, {
      wrapper: createTestWrapper(),
    })

    expect(screen.getByText('ABCD1234')).toBeInTheDocument()
    expect(screen.getByText(/邀请码/i)).toBeInTheDocument()
  })

  it('copies code to clipboard when clicked', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    })

    render(<InviteCodeDisplay inviteCode="ABCD1234" onCopy={() => {}} />, {
      wrapper: createTestWrapper(),
    })

    const copyButton = screen.getByRole('button', { name: /复制/i })
    await userEvent.click(copyButton)

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('ABCD1234')
      expect(toast.success).toHaveBeenCalledWith('邀请码已复制')
    })
  })

  it('handles clipboard error', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      },
    })

    render(<InviteCodeDisplay inviteCode="ABCD1234" onCopy={() => {}} />, {
      wrapper: createTestWrapper(),
    })

    const copyButton = screen.getByRole('button', { name: /复制/i })
    await userEvent.click(copyButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('复制失败')
    })
  })
})

describe('JoinCampaignDialog', () => {
  it('renders dialog fields', () => {
    const onClose = vi.fn()
    render(<JoinCampaignDialog open={true} onClose={onClose} />, {
      wrapper: createTestWrapper(),
    })

    expect(screen.getByLabelText(/邀请码/i)).toBeInTheDocument()
  })

  it('validates invite code format', async () => {
    const onClose = vi.fn()
    render(<JoinCampaignDialog open={true} onClose={onClose} />, {
      wrapper: createTestWrapper(),
    })

    const submitButton = screen.getByText(/加入战役/i)
    await userEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/请输入邀请码/i)).toBeInTheDocument()
    })
  })

  it('submits valid invite code', async () => {
    const onClose = vi.fn()
    vi.mocked(campaignsApi.joinCampaign).mockResolvedValue({
      id: 'member-1',
      campaign_id: '1',
      user_id: 2,
      character_id: null,
      role: 'player',
      status: 'active',
      joined_at: '2024-01-01T00:00:00Z',
      last_seen_at: null,
    })

    render(
      <JoinCampaignDialog open={true} onClose={onClose} campaignId="1" />,
      {
        wrapper: createTestWrapper(),
      }
    )

    const codeInput = screen.getByLabelText(/邀请码/i)
    await userEvent.type(codeInput, 'ABCD1234')

    // Use role to find the button in the form footer
    const submitButton = screen.getByRole('button', { name: /加入战役/i })
    await userEvent.click(submitButton)

    await waitFor(() => {
      expect(campaignsApi.joinCampaign).toHaveBeenCalledWith('1', {
        invite_code: 'ABCD1234',
      })
      expect(toast.success).toHaveBeenCalledWith('加入战役成功')
      expect(onClose).toHaveBeenCalled()
    })
  })
})
