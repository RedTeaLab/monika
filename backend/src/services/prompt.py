"""Prompt template engine for building LLM prompts."""
from src.models.character import Character
from src.models.session import GameSession


class PromptBuilder:
    """构建 LLM Prompt

    This class builds prompts for the LLM-based Keeper (Game Master)
    by combining system instructions with game state context.
    """

    SYSTEM_TEMPLATE = """你是克苏鲁的呼唤 7 版（Call of Cthulhu 7th Edition）的守密人（Keeper）。

你的职责：
1. 描述场景、NPC 反应和故事发展
2. 保持神秘和恐怖的氛围
3. 尊重玩家的选择，推动故事发展
4. 可以修改场景信息和添加线索，但不能直接修改玩家角色的 HP/SAN 等核心属性

规则查询工具：
当玩家询问游戏规则时，你可以使用 search_rules 工具来查询相关规则。
工具调用格式：
{{
  "tool_calls": [
    {{
      "name": "search_rules",
      "arguments": {{"query": "搜索关键词"}}
    }}
  ]
}}

常见规则查询场景：
- 玩家询问某个技能如何使用
- 玩家询问战斗机制
- 玩家询问 SAN 检定规则
- 玩家询问推骰、花幸运等机制

请以 JSON 格式响应，包含以下字段：
- narrative: 叙述文本（第二人称"你"）
- tone: 语气 (mystery|horror|action|calm)
- urgency: 紧迫度 (low|medium|high)
- state_changes: 状态变化（可选）- 只修改 current_scene 和 world_state
- suggestions: 给玩家的建议（可选）
- tool_calls: 工具调用（可选）- 当需要查询规则时使用
"""

    async def build_system_prompt(self) -> str:
        """Build the system prompt for the LLM.

        Returns:
            The system prompt string defining the Keeper's role and behavior.
        """
        return self.SYSTEM_TEMPLATE

    async def build_context_messages(
        self,
        character: Character,
        session: GameSession,
        recent_events: list[dict],
        user_message: str
    ) -> list[dict]:
        """Build context messages for the LLM.

        Creates a series of messages that provide the LLM with:
        1. Current game state (character stats, scene, leads)
        2. Recent events (last 5)
        3. User's current action/message

        Args:
            character: The player's character
            session: The current game session
            recent_events: List of recent game events
            user_message: The user's current input

        Returns:
            List of message dictionaries with 'role' and 'content' keys.
        """
        messages = []

        # Build context message with character and session state
        context = f"""当前游戏状态:
- 角色: {character.name}
- 当前场景: {session.current_scene_name or session.location or "未知"}
- HP: {character.hp}/10
- SAN: {character.san}/{character.max_san}
"""

        # Add leads if any exist
        if session.world_state and session.world_state.get("leads"):
            context += f"- 已发现线索: {', '.join(session.world_state['leads'])}\n"

        messages.append({"role": "user", "content": context})

        # Add recent events (limited to 5)
        if recent_events:
            events_text = "最近发生的事情:\n"
            for event in recent_events[:5]:
                events_text += f"- {event.get('description', 'event')}\n"
            messages.append({"role": "user", "content": events_text})

        # Add user's current message
        messages.append({"role": "user", "content": user_message})

        return messages
