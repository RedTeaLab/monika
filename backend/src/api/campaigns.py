"""Campaign API routes."""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

from src.core.auth import get_current_user
from src.core.database import get_db
from src.models.campaign import Campaign, CampaignMember, CampaignRole, MemberStatus, generate_invite_code
from src.models.user import User
from src.models.character import Character
from src.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignJoin, MemberRoleUpdate, MemberAdd

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def campaign_to_dict(campaign: Campaign) -> Dict[str, Any]:
    """Convert Campaign ORM object to dict."""
    return campaign.to_dict()


def member_to_dict(member: CampaignMember) -> Dict[str, Any]:
    """Convert CampaignMember ORM object to dict."""
    return member.to_dict()


@router.post("")
def create_campaign(
    campaign_data: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new campaign."""
    campaign = Campaign(
        name=campaign_data.name,
        description=campaign_data.description,
        keeper_id=current_user.id,
        scenario_id=campaign_data.scenario_id,
        max_players=campaign_data.max_players,
        settings=campaign_data.settings,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    # Auto-add creator as keeper member
    keeper_member = CampaignMember(
        campaign_id=campaign.id,
        user_id=current_user.id,
        role=CampaignRole.KEEPER.value,
        status=MemberStatus.ACTIVE.value,
    )
    db.add(keeper_member)
    db.commit()

    return campaign_to_dict(campaign)


@router.get("")
def list_campaigns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all campaigns for the current user."""
    # Get campaigns where user is keeper
    keeper_campaigns = (
        db.query(Campaign)
        .filter(Campaign.keeper_id == current_user.id)
        .all()
    )

    # Get campaigns where user is a member
    member_campaign_ids = (
        db.query(CampaignMember.campaign_id)
        .filter(
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE.value
        )
        .distinct()
        .all()
    )
    member_campaign_ids = [cid for (cid,) in member_campaign_ids]

    member_campaigns = (
        db.query(Campaign)
        .filter(Campaign.id.in_(member_campaign_ids))
        .all()
    )

    # Combine and deduplicate
    all_campaigns = keeper_campaigns + member_campaigns
    unique_campaigns = {c.id: c for c in all_campaigns}.values()

    return [campaign_to_dict(c) for c in unique_campaigns]


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific campaign."""
    try:
        cid = uuid.UUID(campaign_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Check access: user must be keeper or member
    is_member = (
        campaign.keeper_id == current_user.id or
        db.query(CampaignMember).filter(
            CampaignMember.campaign_id == campaign.id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE.value
        ).first() is not None
    )

    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this campaign",
        )

    return campaign_to_dict(campaign)


@router.put("/{campaign_id}")
def update_campaign(
    campaign_id: str,
    campaign_data: CampaignUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a campaign."""
    try:
        cid = uuid.UUID(campaign_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Only keeper can update
    if campaign.keeper_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign keeper can update the campaign",
        )

    # Update fields
    update_data = campaign_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(campaign, field, value)

    db.commit()
    db.refresh(campaign)
    return campaign_to_dict(campaign)


@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a campaign."""
    try:
        cid = uuid.UUID(campaign_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Only keeper can delete
    if campaign.keeper_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign keeper can delete the campaign",
        )

    db.delete(campaign)
    db.commit()
    return {"message": "Campaign deleted successfully"}


@router.post("/{campaign_id}/invite")
def generate_invite_code(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a new invite code for the campaign."""
    try:
        cid = uuid.UUID(campaign_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Only keeper can generate invite codes
    if campaign.keeper_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign keeper can generate invite codes",
        )

    # Generate new invite code
    campaign.regenerate_invite_code()
    db.commit()
    db.refresh(campaign)

    return {"invite_code": campaign.invite_code}


@router.post("/{campaign_id}/join")
def join_campaign(
    campaign_id: str,
    join_data: CampaignJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Join a campaign using an invite code."""
    try:
        cid = uuid.UUID(campaign_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Verify invite code
    if campaign.invite_code != join_data.invite_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invite code",
        )

    # Check if already a member
    existing_member = (
        db.query(CampaignMember)
        .filter(
            CampaignMember.campaign_id == campaign.id,
            CampaignMember.user_id == current_user.id,
        )
        .first()
    )
    if existing_member:
        if existing_member.status == MemberStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already a member of this campaign",
            )
        else:
            # Reactivate member
            existing_member.status = MemberStatus.ACTIVE.value
            existing_member.character_id = join_data.character_id
            existing_member.update_last_seen()
            db.commit()
            db.refresh(existing_member)
            return member_to_dict(existing_member)

    # Check if campaign is full
    if not campaign.can_join():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign is full or not accepting new players",
        )

    # Verify character exists and belongs to user
    if join_data.character_id:
        character = (
            db.query(Character)
            .filter(
                Character.id == join_data.character_id,
                Character.owner_id == current_user.id,
            )
            .first()
        )
        if not character:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Character not found or does not belong to you",
            )

    # Create member
    member = CampaignMember(
        campaign_id=campaign.id,
        user_id=current_user.id,
        character_id=join_data.character_id,
        role=CampaignRole.PLAYER.value,
        status=MemberStatus.ACTIVE.value,
    )
    member.update_last_seen()
    db.add(member)
    db.commit()
    db.refresh(member)

    return member_to_dict(member)


@router.get("/{campaign_id}/members")
def list_members(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all members of a campaign."""
    try:
        cid = uuid.UUID(campaign_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid campaign ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Check access: user must be keeper or member
    is_member = (
        campaign.keeper_id == current_user.id or
        db.query(CampaignMember).filter(
            CampaignMember.campaign_id == campaign.id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE.value
        ).first() is not None
    )

    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this campaign",
        )

    members = (
        db.query(CampaignMember)
        .filter(CampaignMember.campaign_id == campaign.id)
        .all()
    )

    return [member_to_dict(m) for m in members]


@router.delete("/{campaign_id}/members/{member_id}")
def remove_member(
    campaign_id: str,
    member_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from the campaign."""
    try:
        cid = uuid.UUID(campaign_id)
        mid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Only keeper can remove members
    if campaign.keeper_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign keeper can remove members",
        )

    member = (
        db.query(CampaignMember)
        .filter(CampaignMember.id == mid, CampaignMember.campaign_id == cid)
        .first()
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    db.delete(member)
    db.commit()
    return {"message": "Member removed successfully"}


@router.put("/{campaign_id}/members/{member_id}/role")
def update_member_role(
    campaign_id: str,
    member_id: str,
    role_data: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a member's role."""
    try:
        cid = uuid.UUID(campaign_id)
        mid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID format",
        )

    campaign = db.query(Campaign).filter(Campaign.id == cid).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Only keeper can update roles
    if campaign.keeper_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign keeper can update member roles",
        )

    member = (
        db.query(CampaignMember)
        .filter(CampaignMember.id == mid, CampaignMember.campaign_id == cid)
        .first()
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    member.role = role_data.role
    db.commit()
    db.refresh(member)

    return member_to_dict(member)
