"""Invitation service for managing campaign invitations."""
import uuid
from typing import Optional
from sqlalchemy.orm import Session

from src.models.campaign import Campaign, CampaignMember


class InvitationService:
    """Service for managing campaign invitations via invite codes."""

    def __init__(self, db: Session):
        self.db = db

    async def join_campaign(
        self,
        invite_code: str,
        user_id: str,
        character_id: Optional[str] = None
    ) -> CampaignMember:
        """Join a campaign using an invite code."""
        # Find campaign by invite code
        campaign = self.db.query(Campaign).filter(
            Campaign.invite_code == invite_code
        ).first()

        if not campaign:
            raise ValueError(f"Invalid invite code: {invite_code}")

        # Check if user is already a member
        existing = self.db.query(CampaignMember).filter(
            CampaignMember.campaign_id == campaign.id,
            CampaignMember.user_id == user_id
        ).first()

        if existing:
            return existing

        # Create new member
        member = CampaignMember(
            id=uuid.uuid4(),
            campaign_id=campaign.id,
            user_id=user_id,
            character_id=character_id,
            role="player"
        )
        self.db.add(member)
        self.db.commit()
        self.db.refresh(member)
        return member

    async def get_members(self, campaign_id: str) -> list[CampaignMember]:
        """Get all members of a campaign."""
        return self.db.query(CampaignMember).filter(
            CampaignMember.campaign_id == campaign_id
        ).all()

    async def remove_member(self, campaign_id: str, user_id: str) -> bool:
        """Remove a member from a campaign."""
        member = self.db.query(CampaignMember).filter(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.user_id == user_id
        ).first()

        if member:
            self.db.delete(member)
            self.db.commit()
            return True
        return False
