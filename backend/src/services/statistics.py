"""Statistics service for M3 Memory Web milestone.

This service provides statistical analysis for:
- M3-073: Message statistics (count by type, frequency)
- M3-074: Roll check statistics (success rate, skill usage)
- M3-075: Player performance statistics (activity, SAN loss, luck usage)
"""
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from src.models import Event, EventType, Message, VisibilityLevel


@dataclass
class MessageStatistics:
    """Statistics for messages in a session (M3-073)."""

    total_messages: int
    public_messages: int
    kp_only_messages: int
    party_messages: int
    private_messages: int
    hourly_frequency: dict[int, int]  # hour (0-23) -> count


@dataclass
class RollStatistics:
    """Statistics for roll checks in a session (M3-074)."""

    total_rolls: int
    successful_rolls: int
    failed_rolls: int
    success_rate: float
    pushed_rolls: int
    critical_successes: int
    critical_failures: int
    skill_usage: List[dict]  # [{"skill": str, "count": int}, ...]


@dataclass
class PlayerPerformance:
    """Statistics for a player's performance in a session (M3-075)."""

    player_id: int
    total_actions: int
    roll_count: int
    message_count: int
    san_checks: int
    total_san_loss: int
    luck_spends: int
    total_luck_spent: int


@dataclass
class SessionStatistics:
    """Comprehensive statistics for a game session."""

    session_id: UUID
    messages: MessageStatistics
    rolls: RollStatistics
    players: List[PlayerPerformance]


class StatisticsService:
    """Service for calculating game statistics."""

    @staticmethod
    def get_message_statistics(db: Session, session_id: UUID) -> MessageStatistics:
        """Get message statistics for a session (M3-073).

        Args:
            db: Database session
            session_id: Game session ID

        Returns:
            MessageStatistics with counts by visibility type and hourly frequency
        """
        # Count by visibility type
        visibility_counts = (
            db.query(
                Message.visibility,
                func.count(Message.id).label("count")
            )
            .filter(Message.session_id == session_id)
            .group_by(Message.visibility)
            .all()
        )

        counts = {visibility: 0 for visibility in ["public", "kp", "party", "private"]}
        for visibility, count in visibility_counts:
            counts[visibility] = count

        # Get hourly frequency
        messages = (
            db.query(
                func.strftime("%H", Message.created_at).label("hour"),
                func.count(Message.id).label("count")
            )
            .filter(Message.session_id == session_id)
            .group_by("hour")
            .all()
        )

        hourly_frequency = {int(hour): count for hour, count in messages}

        return MessageStatistics(
            total_messages=sum(counts.values()),
            public_messages=counts["public"],
            kp_only_messages=counts["kp"],
            party_messages=counts["party"],
            private_messages=counts["private"],
            hourly_frequency=hourly_frequency,
        )

    @staticmethod
    def get_roll_statistics(db: Session, session_id: UUID) -> RollStatistics:
        """Get roll check statistics for a session (M3-074).

        Args:
            db: Database session
            session_id: Game session ID

        Returns:
            RollStatistics with success rate and skill usage breakdown
        """
        # Count regular rolls (not push rolls)
        total_rolls = (
            db.query(func.count(Event.id))
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.event_type == EventType.ROLL
                )
            )
            .scalar() or 0
        )

        # Count successful rolls (check success_level in payload)
        all_rolls = (
            db.query(Event.payload)
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.event_type == EventType.ROLL
                )
            )
            .all()
        )

        successful_rolls = 0
        critical_successes = 0
        critical_failures = 0
        skill_counter = Counter()

        for (payload,) in all_rolls:
            success_level = payload.get("success_level", "")
            skill_name = payload.get("skill", "unknown")

            skill_counter[skill_name] += 1

            # Count successes (anything not failure)
            if success_level != "failure":
                successful_rolls += 1

            # Count criticals
            if payload.get("is_critical"):
                critical_successes += 1
            if payload.get("is_fumble"):
                critical_failures += 1

        failed_rolls = total_rolls - successful_rolls
        success_rate = successful_rolls / total_rolls if total_rolls > 0 else 0.0

        # Count push rolls
        pushed_rolls = (
            db.query(func.count(Event.id))
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.event_type == EventType.PUSH_ROLL
                )
            )
            .scalar() or 0
        )

        # Get most used skills (top 10)
        skill_usage = [
            {"skill": skill, "count": count}
            for skill, count in skill_counter.most_common(10)
        ]

        return RollStatistics(
            total_rolls=total_rolls,
            successful_rolls=successful_rolls,
            failed_rolls=failed_rolls,
            success_rate=success_rate,
            pushed_rolls=pushed_rolls,
            critical_successes=critical_successes,
            critical_failures=critical_failures,
            skill_usage=skill_usage,
        )

    @staticmethod
    def get_player_performance(db: Session, session_id: UUID, player_id: int) -> PlayerPerformance:
        """Get performance statistics for a player in a session (M3-075).

        Args:
            db: Database session
            session_id: Game session ID
            player_id: Player's user ID

        Returns:
            PlayerPerformance with activity summary and resource usage
        """
        # Count rolls by this player
        roll_count = (
            db.query(func.count(Event.id))
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.actor_player_id == player_id,
                    Event.event_type == EventType.ROLL
                )
            )
            .scalar() or 0
        )

        # Count messages by this player
        # Note: Message.sender_id is UUID while player_id is int, so we need to cast
        # For now, we'll skip message counting due to type mismatch
        # TODO: Fix the schema inconsistency between User.id (int) and Message.sender_id (UUID)
        message_count = 0

        # Count SAN checks
        san_checks = (
            db.query(func.count(Event.id))
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.actor_player_id == player_id,
                    Event.event_type == EventType.SAN_CHECK
                )
            )
            .scalar() or 0
        )

        # Sum SAN loss
        san_loss_events = (
            db.query(Event.payload)
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.actor_player_id == player_id,
                    Event.event_type == EventType.SAN_LOSS
                )
            )
            .all()
        )

        total_san_loss = sum(
            payload.get("amount", 0)
            for (payload,) in san_loss_events
        )

        # Count luck spends
        luck_events = (
            db.query(Event.payload)
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.actor_player_id == player_id,
                    Event.event_type == EventType.LUCK_SPEND
                )
            )
            .all()
        )

        luck_spends = len(luck_events)
        total_luck_spent = sum(
            payload.get("amount", 0)
            for (payload,) in luck_events
        )

        total_actions = roll_count + message_count

        return PlayerPerformance(
            player_id=player_id,
            total_actions=total_actions,
            roll_count=roll_count,
            message_count=message_count,
            san_checks=san_checks,
            total_san_loss=total_san_loss,
            luck_spends=luck_spends,
            total_luck_spent=total_luck_spent,
        )

    @staticmethod
    def get_session_statistics(db: Session, session_id: UUID) -> SessionStatistics:
        """Get comprehensive statistics for a session.

        Args:
            db: Database session
            session_id: Game session ID

        Returns:
            SessionStatistics with all message, roll, and player stats
        """
        # Get message statistics
        message_stats = StatisticsService.get_message_statistics(db, session_id)

        # Get roll statistics
        roll_stats = StatisticsService.get_roll_statistics(db, session_id)

        # Get all player IDs in this session
        player_ids = (
            db.query(Event.actor_player_id)
            .filter(
                and_(
                    Event.session_id == session_id,
                    Event.actor_player_id.isnot(None)
                )
            )
            .distinct()
            .all()
        )

        player_ids = [pid for (pid,) in player_ids]

        # Get performance for each player
        players = [
            StatisticsService.get_player_performance(db, session_id, player_id)
            for player_id in player_ids
        ]

        return SessionStatistics(
            session_id=session_id,
            messages=message_stats,
            rolls=roll_stats,
            players=players,
        )
