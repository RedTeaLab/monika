"""LLM response schema definitions."""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Literal


class ToolCall(BaseModel):
    """工具调用定义"""
    name: Literal["search_rules"] = Field(..., description="工具名称")
    arguments: Dict[str, str] = Field(..., description="工具参数")
    result_id: Optional[str] = Field(None, description="工具调用结果ID")


class StateChanges(BaseModel):
    """AI 可以修改的状态字段（白名单）"""
    current_scene: Optional[str] = Field(None, description="当前场景名称")
    world_state: Optional[Dict] = Field(None, description="世界状态更新")


class LLMResponse(BaseModel):
    """LLM 响应格式"""
    narrative: str = Field(..., description="叙述文本，显示给玩家")
    tone: str = Field("calm", description="语气: mystery, horror, action, calm")
    urgency: str = Field("low", description="紧迫度: low, medium, high")
    state_changes: Optional[StateChanges] = Field(None, description="状态变化")
    suggestions: Optional[List[str]] = Field(None, description="给玩家的操作建议")
    audio_cue: Optional[str] = Field(None, description="音效提示")
    requires_roll: bool = Field(False, description="是否建议玩家进行检定")
    tool_calls: Optional[List[ToolCall]] = Field(None, description="工具调用列表")
