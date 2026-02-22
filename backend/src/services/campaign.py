"""Campaign service for multiplayer campaign management."""
import uuid
import string
import random
from typing import Optional, List
from sqlalchemy.orm import Session

from src.models.campaign import Campaign, CampaignMember


class CampaignService:
    """Service for managing campaigns."""

    def __init__(self, db: Session):
        self.db = db

    async def create_campaign(
        self,
        name: str,
        keeper_id: str,
        description: Optional[str] = None,
        max_players: int = 4
    ) -> Campaign:
        """Create a new campaign with invite code."""
        campaign = Campaign(
            id=uuid.uuid4(),
            name=name,
            description=description or "",
            keeper_id=keeper_id,
            max_players=max_players,
            invite_code=self._generate_invite_code(),
        )
        self.db.add(campaign)
        self.db.commit()
        self.db.refresh(campaign)
        return campaign

    def _generate_invite_code(self) -> str:
        """Generate an 8-character invite code."""
        chars = string.ascii_uppercase + string.digits
        return ''.join(random.choice(chars) for _ in range(8))

    async def get_campaign(self, campaign_id: str) -> Optional[Campaign]:
        """Get a campaign by ID."""
        return self.db.query(Campaign).filter(Campaign.id == campaign_id).first()

    async def get_campaign_by_invite_code(self, invite_code: str) -> Optional[Campaign]:
        """Get a campaign by invite code."""
        return self.db.query(Campaign).filter(Campaign.invite_code == invite_code).first()

    async def list_campaigns(self, keeper_id: str) -> List[Campaign]:
        """List all campaigns for a keeper."""
        return self.db.query(Campaign).filter(Campaign.keeper_id == keeper_id).all()
