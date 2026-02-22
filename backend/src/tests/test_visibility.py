"""Tests for Visibility Filter service (TDD - Test First)."""
import pytest
from uuid import uuid4
from datetime import datetime

from src.services.visibility import (
    VisibilityFilter,
    VisibilityLevel,
    VisibilityContext,
)
from src.models.message import Message, MessageVisibility


def create_message(content: str, visibility: VisibilityLevel, sender_id: str, visible_to: list[str] = None) -> Message:
    """Helper to create a test message."""
    msg = Message(
        session_id=str(uuid4()),
        sender_id=sender_id,
        content=content,
        visibility=visibility.value,
        visible_to=visible_to or [],
    )
    # Set the ID manually for testing
    msg.id = uuid4()
    msg.created_at = datetime.now()
    return msg


class TestVisibilityLevel:
    """Test VisibilityLevel enum."""

    def test_visibility_level_values(self):
        """VisibilityLevel should have expected values."""
        assert VisibilityLevel.PUBLIC.value == "public"
        assert VisibilityLevel.KP_ONLY.value == "kp"
        assert VisibilityLevel.PARTY.value == "party"
        assert VisibilityLevel.PRIVATE.value == "private"

    def test_message_visibility_enum_matches(self):
        """MessageVisibility enum should match VisibilityLevel."""
        assert MessageVisibility.PUBLIC.value == "public"
        assert MessageVisibility.KP_ONLY.value == "kp"
        assert MessageVisibility.PARTY.value == "party"
        assert MessageVisibility.PRIVATE.value == "private"


class TestVisibilityFilter:
    """Test VisibilityFilter with strict TDD approach."""

    @pytest.fixture
    def filter(self):
        """Create a fresh VisibilityFilter for each test."""
        return VisibilityFilter()

    @pytest.fixture
    def kp_user_id(self):
        """KP user ID."""
        return str(uuid4())

    @pytest.fixture
    def player1_id(self):
        """Player 1 ID."""
        return str(uuid4())

    @pytest.fixture
    def player2_id(self):
        """Player 2 ID."""
        return str(uuid4())

    @pytest.fixture
    def session_id(self):
        """Test session ID."""
        return str(uuid4())

    class TestPublicVisibility:
        """Test PUBLIC visibility level."""

        def test_public_visible_to_all(self, filter, kp_user_id, player1_id, player2_id):
            """Public messages should be visible to everyone."""
            message = create_message(
                content="Hello everyone",
                visibility=VisibilityLevel.PUBLIC,
                sender_id=player1_id,
            )

            # KP should see public message
            kp_context = VisibilityContext(
                viewer_id=kp_user_id,
                viewer_role="keeper",
            )
            assert filter.filter_message(message, kp_context) is True

            # Players should see public message
            player1_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player1_context) is True

            player2_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player2_context) is True

    class TestKPOnlyVisibility:
        """Test KP_ONLY visibility level."""

        def test_kp_only_visible_to_keeper(self, filter, kp_user_id, player1_id):
            """KP-only messages should only be visible to keeper."""
            message = create_message(
                content="Secret keeper info",
                visibility=VisibilityLevel.KP_ONLY,
                sender_id=kp_user_id,
            )

            # KP should see KP-only message
            kp_context = VisibilityContext(
                viewer_id=kp_user_id,
                viewer_role="keeper",
            )
            assert filter.filter_message(message, kp_context) is True

            # Players should NOT see KP-only message
            player_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player_context) is False

        def test_kp_only_not_visible_to_other_kps(self, filter, kp_user_id, player1_id):
            """KP-only messages from one KP should be visible to other KPs (if multi-KP)."""
            # In CoC, typically there's one KP, but if there are multiple, they should see all KP messages
            other_kp_id = str(uuid4())

            message = create_message(
                content="Secret keeper info",
                visibility=VisibilityLevel.KP_ONLY,
                sender_id=kp_user_id,
            )

            # Other KP should see KP-only message
            other_kp_context = VisibilityContext(
                viewer_id=other_kp_id,
                viewer_role="keeper",
            )
            assert filter.filter_message(message, other_kp_context) is True

    class TestPartyVisibility:
        """Test PARTY visibility level."""

        def test_party_visible_to_all_players_and_kp(self, filter, kp_user_id, player1_id, player2_id):
            """Party messages should be visible to all players and keeper."""
            message = create_message(
                content="Party message",
                visibility=VisibilityLevel.PARTY,
                sender_id=player1_id,
            )

            # KP should see party message
            kp_context = VisibilityContext(
                viewer_id=kp_user_id,
                viewer_role="keeper",
            )
            assert filter.filter_message(message, kp_context) is True

            # Player 1 (sender) should see party message
            player1_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player1_context) is True

            # Player 2 should see party message
            player2_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player2_context) is True

    class TestPrivateVisibility:
        """Test PRIVATE visibility level."""

        def test_private_only_visible_to_specified_users(self, filter, kp_user_id, player1_id, player2_id):
            """Private messages should only be visible to specified users."""
            message = create_message(
                content="Private message",
                visibility=VisibilityLevel.PRIVATE,
                sender_id=kp_user_id,
                visible_to=[player1_id],  # Only player1 should see this
            )

            # KP (sender) should see private message
            kp_context = VisibilityContext(
                viewer_id=kp_user_id,
                viewer_role="keeper",
            )
            assert filter.filter_message(message, kp_context) is True

            # Player 1 (in visible_to) should see private message
            player1_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player1_context) is True

            # Player 2 (NOT in visible_to) should NOT see private message
            player2_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player2_context) is False

        def test_private_sender_always_sees_own_message(self, filter, player1_id, player2_id):
            """Sender should always see their own private message."""
            message = create_message(
                content="My private message",
                visibility=VisibilityLevel.PRIVATE,
                sender_id=player1_id,
                visible_to=[],  # Empty list, but sender should still see it
            )

            # Sender should see their own message
            sender_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, sender_context) is True

            # Other players should NOT see it
            other_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, other_context) is False

        def test_private_empty_visible_to_only_sender(self, filter, player1_id, player2_id):
            """Private message with empty visible_to should only be visible to sender."""
            message = create_message(
                content="Private note to self",
                visibility=VisibilityLevel.PRIVATE,
                sender_id=player1_id,
                visible_to=[],
            )

            # Sender should see it
            sender_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, sender_context) is True

            # Others should NOT see it
            other_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, other_context) is False

    class TestEdgeCases:
        """Test edge cases and special scenarios."""

        def test_none_visibility_defaults_to_public(self, filter, player1_id, player2_id):
            """Message with None visibility should default to public."""
            message = create_message(
                content="Default message",
                visibility=VisibilityLevel.PUBLIC,
                sender_id=player1_id,
            )
            message.visibility = None  # Explicitly set to None

            player_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            # Should default to public (visible)
            assert filter.filter_message(message, player_context) is True

        def test_sender_can_see_all_own_messages(self, filter, player1_id, player2_id):
            """Sender should always see their own messages regardless of visibility."""
            # Test with KP_ONLY (sender is player, not KP)
            message = create_message(
                content="My message",
                visibility=VisibilityLevel.KP_ONLY,
                sender_id=player1_id,
            )

            # Sender should see their own message even if it's KP_ONLY
            sender_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, sender_context) is True

            # Other players should NOT see it
            other_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, other_context) is False

        def test_multiple_users_in_private_visible_to(self, filter, kp_user_id, player1_id, player2_id):
            """Private message can be visible to multiple specific users."""
            player3_id = str(uuid4())

            message = create_message(
                content="Secret for select players",
                visibility=VisibilityLevel.PRIVATE,
                sender_id=kp_user_id,
                visible_to=[player1_id, player2_id],  # player3_id is NOT included
            )

            # KP (sender) should see it
            kp_context = VisibilityContext(
                viewer_id=kp_user_id,
                viewer_role="keeper",
            )
            assert filter.filter_message(message, kp_context) is True

            # Player 1 should see it
            player1_context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player1_context) is True

            # Player 2 should see it
            player2_context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player2_context) is True

            # Player 3 should NOT see it
            player3_context = VisibilityContext(
                viewer_id=player3_id,
                viewer_role="player",
            )
            assert filter.filter_message(message, player3_context) is False

    class TestBatchFiltering:
        """Test batch filtering of multiple messages."""

        def test_filter_multiple_messages(self, filter, kp_user_id, player1_id, player2_id):
            """Should correctly filter multiple messages at once."""
            messages = [
                create_message("Public msg", VisibilityLevel.PUBLIC, player1_id),
                create_message("KP msg", VisibilityLevel.KP_ONLY, kp_user_id),
                create_message("Private to player2", VisibilityLevel.PRIVATE, kp_user_id, [player2_id]),
            ]

            context = VisibilityContext(
                viewer_id=player2_id,
                viewer_role="player",
            )

            filtered = filter.filter_messages(messages, context)

            # Player 2 should see: public msg, private msg to player2
            # But NOT: KP msg
            assert len(filtered) == 2
            assert filtered[0].content == "Public msg"
            assert filtered[1].content == "Private to player2"

        def test_empty_message_list(self, filter, player1_id):
            """Should handle empty message list gracefully."""
            context = VisibilityContext(
                viewer_id=player1_id,
                viewer_role="player",
            )

            filtered = filter.filter_messages([], context)
            assert len(filtered) == 0
