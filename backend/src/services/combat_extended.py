"""Extended combat service with dodge, block, armor, and critical hits."""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
from random import randint

from sqlalchemy.orm import Session

from src.models.combat import (
    Combat,
    Combatant,
    CombatAction,
    CombatState,
    CombatActionType,
    DamageType,
    CombatantRole,
)
from src.models.character import Character
from src.services.dice import roll_check, BonusPenalty, SuccessLevel
from src.services.combat import CombatService as BaseCombatService


class CriticalHitType(str, Enum):
    """Types of critical hits."""

    NORMAL = "normal"
    CRITICAL = "critical"
    IMPALE = "impaile"


class ArmorType(str, Enum):
    """Types of armor."""

    NONE = "none"
    LIGHT = "light"
    MEDIUM = "medium"
    HEAVY = "heavy"


ARMOR_VALUES: dict[ArmorType, int] = {
    ArmorType.NONE: 0,
    ArmorType.LIGHT: 1,
    ArmorType.MEDIUM: 2,
    ArmorType.HEAVY: 3,
}


class ExtendedCombatService(BaseCombatService):
    """Extended combat service with full combat mechanics."""

    def __init__(self, db: Session):
        super().__init__(db)
        self.db = db

    def resolve_attack_with_dodge(
        self,
        combat_id: uuid.UUID,
        attacker_id: uuid.UUID,
        target_id: uuid.UUID,
        attack_skill: int,
        target_dodge_skill: int,
        attack_roll: Optional[int] = None,
        dodge_roll: Optional[int] = None,
        damage_roll: Optional[int] = None,
        damage_bonus: int = 0,
    ) -> Dict[str, Any]:
        """Resolve an attack with dodge opportunity.

        CoC 7e rules:
        - Target can try to dodge an attack
        - If dodge succeeds, attack misses
        - Dodge uses DEX or Dodge skill

        Args:
            combat_id: Combat UUID
            attacker_id: Attacker combatant UUID
            target_id: Target combatant UUID
            attack_skill: Attacker's attack skill
            target_dodge_skill: Target's dodge skill (DEX or Dodge)
            attack_roll: Optional fixed attack roll
            dodge_roll: Optional fixed dodge roll
            damage_roll: Optional fixed damage roll
            damage_bonus: Damage bonus from strength

        Returns:
            Dict with attack and dodge results
        """
        attacker = self.db.query(Combatant).filter(Combatant.id == attacker_id).first()
        target = self.db.query(Combatant).filter(Combatant.id == target_id).first()
        combat = self.db.query(Combat).filter(Combat.id == combat_id).first()

        if not attacker or not target:
            raise ValueError("Attacker or target not found")

        attack_result = roll_check(skill=attack_skill, roll=attack_roll)

        result: Dict[str, Any] = {
            "attacker": attacker.name,
            "target": target.name,
            "attack_roll": attack_result.value,
            "attack_skill": attack_skill,
            "attack_success_level": attack_result.success_level.value,
            "dodge_attempted": True,
            "dodge_roll": None,
            "dodge_skill": target_dodge_skill,
            "dodge_success": False,
            "hit": False,
            "damage": 0,
            "target_hp_before": target.hp,
            "target_hp_after": target.hp,
        }

        if attack_result.success_level == SuccessLevel.FAILURE:
            result["hit"] = False
            result["dodge_attempted"] = False
            return result

        dodge_result = roll_check(skill=target_dodge_skill, roll=dodge_roll)
        result["dodge_roll"] = dodge_result.value
        result["dodge_success_level"] = dodge_result.success_level.value
        result["dodge_success"] = dodge_result.success_level != SuccessLevel.FAILURE

        if result["dodge_success"]:
            result["hit"] = False
            result["message"] = f"{target.name} dodges the attack!"
            return result

        damage = self._calculate_damage(
            attack_result.success_level,
            damage_roll,
            damage_bonus,
        )

        target.hp = max(0, target.hp - damage)
        result["damage"] = damage
        result["hit"] = True
        result["target_hp_after"] = target.hp

        self._check_combatant_status(target, result)
        self.db.commit()

        return result

    def resolve_attack_with_block(
        self,
        combat_id: uuid.UUID,
        attacker_id: uuid.UUID,
        target_id: uuid.UUID,
        attack_skill: int,
        target_fighting_skill: int,
        attack_roll: Optional[int] = None,
        block_roll: Optional[int] = None,
        damage_roll: Optional[int] = None,
        damage_bonus: int = 0,
    ) -> Dict[str, Any]:
        """Resolve an attack with block attempt.

        CoC 7e rules:
        - Fighting Back (block/counter) uses Fighting skill
        - Compare attack roll vs fighting roll
        - Lower roll wins
        - Winner deals damage

        Args:
            combat_id: Combat UUID
            attacker_id: Attacker combatant UUID
            target_id: Target combatant UUID
            attack_skill: Attacker's attack skill
            target_fighting_skill: Target's fighting skill
            attack_roll: Optional fixed attack roll
            block_roll: Optional fixed block roll
            damage_roll: Optional fixed damage roll
            damage_bonus: Damage bonus from strength

        Returns:
            Dict with attack and block results
        """
        attacker = self.db.query(Combatant).filter(Combatant.id == attacker_id).first()
        target = self.db.query(Combatant).filter(Combatant.id == target_id).first()
        combat = self.db.query(Combat).filter(Combat.id == combat_id).first()

        if not attacker or not target:
            raise ValueError("Attacker or target not found")

        attack_result = roll_check(skill=attack_skill, roll=attack_roll)
        block_result = roll_check(skill=target_fighting_skill, roll=block_roll)

        result: Dict[str, Any] = {
            "attacker": attacker.name,
            "target": target.name,
            "attack_roll": attack_result.value,
            "attack_skill": attack_skill,
            "attack_success": attack_result.success_level != SuccessLevel.FAILURE,
            "block_roll": block_result.value,
            "block_skill": target_fighting_skill,
            "block_success": block_result.success_level != SuccessLevel.FAILURE,
            "attacker_wins": False,
            "target_wins": False,
            "damage": 0,
            "damage_to": None,
        }

        attack_success = attack_result.success_level != SuccessLevel.FAILURE
        block_success = block_result.success_level != SuccessLevel.FAILURE

        if attack_success and not block_success:
            result["attacker_wins"] = True
            result["damage_to"] = "target"
            damage = self._calculate_damage(attack_result.success_level, damage_roll, damage_bonus)
            target.hp = max(0, target.hp - damage)
            result["damage"] = damage
            result["target_hp_after"] = target.hp
            self._check_combatant_status(target, result)

        elif block_success and not attack_success:
            result["target_wins"] = True
            result["damage_to"] = "attacker"
            damage = self._calculate_damage(block_result.success_level, damage_roll, damage_bonus)
            attacker.hp = max(0, attacker.hp - damage)
            result["damage"] = damage
            result["attacker_hp_after"] = attacker.hp
            self._check_combatant_status(attacker, result)

        elif attack_success and block_success:
            if attack_result.value < block_result.value:
                result["attacker_wins"] = True
                result["damage_to"] = "target"
                damage = self._calculate_damage(
                    attack_result.success_level, damage_roll, damage_bonus
                )
                target.hp = max(0, target.hp - damage)
                result["damage"] = damage
                result["target_hp_after"] = target.hp
                self._check_combatant_status(target, result)
            else:
                result["target_wins"] = True
                result["damage_to"] = "attacker"
                damage = self._calculate_damage(
                    block_result.success_level, damage_roll, damage_bonus
                )
                attacker.hp = max(0, attacker.hp - damage)
                result["damage"] = damage
                result["attacker_hp_after"] = attacker.hp
                self._check_combatant_status(attacker, result)
        else:
            result["message"] = "Both attacks fail!"

        self.db.commit()
        return result

    def resolve_attack_with_armor(
        self,
        combat_id: uuid.UUID,
        attacker_id: uuid.UUID,
        target_id: uuid.UUID,
        attack_skill: int,
        armor: ArmorType = ArmorType.NONE,
        attack_roll: Optional[int] = None,
        damage_roll: Optional[int] = None,
        damage_bonus: int = 0,
    ) -> Dict[str, Any]:
        """Resolve an attack with armor damage reduction.

        Args:
            combat_id: Combat UUID
            attacker_id: Attacker combatant UUID
            target_id: Target combatant UUID
            attack_skill: Attacker's attack skill
            armor: Target's armor type
            attack_roll: Optional fixed attack roll
            damage_roll: Optional fixed damage roll
            damage_bonus: Damage bonus from strength

        Returns:
            Dict with attack and armor results
        """
        attacker = self.db.query(Combatant).filter(Combatant.id == attacker_id).first()
        target = self.db.query(Combatant).filter(Combatant.id == target_id).first()

        if not attacker or not target:
            raise ValueError("Attacker or target not found")

        attack_result = roll_check(skill=attack_skill, roll=attack_roll)

        result: Dict[str, Any] = {
            "attacker": attacker.name,
            "target": target.name,
            "attack_roll": attack_result.value,
            "attack_skill": attack_skill,
            "success_level": attack_result.success_level.value,
            "hit": False,
            "raw_damage": 0,
            "armor": armor.value,
            "armor_value": ARMOR_VALUES[armor],
            "damage": 0,
            "target_hp_before": target.hp,
            "target_hp_after": target.hp,
        }

        if attack_result.success_level == SuccessLevel.FAILURE:
            return result

        result["hit"] = True
        raw_damage = self._calculate_damage(attack_result.success_level, damage_roll, damage_bonus)
        result["raw_damage"] = raw_damage

        armor_reduction = ARMOR_VALUES[armor]
        final_damage = max(0, raw_damage - armor_reduction)
        result["damage"] = final_damage

        target.hp = max(0, target.hp - final_damage)
        result["target_hp_after"] = target.hp

        self._check_combatant_status(target, result)
        self.db.commit()

        return result

    def resolve_aoe_attack(
        self,
        combat_id: uuid.UUID,
        attacker_id: uuid.UUID,
        target_ids: List[uuid.UUID],
        attack_skill: int,
        damage_dice: str = "1d6",
        damage_bonus: int = 0,
        attack_roll: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Resolve an area of effect attack.

        Args:
            combat_id: Combat UUID
            attacker_id: Attacker combatant UUID
            target_ids: List of target combatant UUIDs
            attack_skill: Attacker's attack skill
            damage_dice: Damage dice notation (e.g., "1d6", "2d6")
            damage_bonus: Damage bonus from strength
            attack_roll: Optional fixed attack roll

        Returns:
            Dict with AoE attack results
        """
        attacker = self.db.query(Combatant).filter(Combatant.id == attacker_id).first()
        targets = (
            self.db.query(Combatant)
            .filter(Combatant.id.in_(target_ids), Combatant.combat_id == combat_id)
            .all()
        )

        if not attacker:
            raise ValueError("Attacker not found")

        attack_result = roll_check(skill=attack_skill, roll=attack_roll)

        result: Dict[str, Any] = {
            "attacker": attacker.name,
            "attack_roll": attack_result.value,
            "attack_skill": attack_skill,
            "success_level": attack_result.success_level.value,
            "hit": attack_result.success_level != SuccessLevel.FAILURE,
            "targets": [],
        }

        if attack_result.success_level == SuccessLevel.FAILURE:
            return result

        base_damage = self._roll_dice_notation(damage_dice) + damage_bonus

        for target in targets:
            target_result = {
                "id": str(target.id),
                "name": target.name,
                "hp_before": target.hp,
                "damage": base_damage,
            }

            target.hp = max(0, target.hp - base_damage)
            target_result["hp_after"] = target.hp

            status = "active"
            if target.hp <= 0:
                target.is_dying = True
                target.is_active = False
                status = "dying"

            target_result["status"] = status
            result["targets"].append(target_result)

        self.db.commit()
        return result

    def check_combat_end(self, combat_id: uuid.UUID) -> Dict[str, Any]:
        """Check if combat should end.

        Combat ends when:
        - All enemies are defeated
        - All PCs are defeated
        - Combat manually ended

        Args:
            combat_id: Combat UUID

        Returns:
            Dict with end check results
        """
        combat = self.db.query(Combat).filter(Combat.id == combat_id).first()
        if not combat:
            raise ValueError(f"Combat {combat_id} not found")

        combatants = self.db.query(Combatant).filter(Combatant.combat_id == combat_id).all()

        active_pcs = [c for c in combatants if c.role == CombatantRole.PC.value and c.is_active]
        active_npcs = [
            c
            for c in combatants
            if c.role in [CombatantRole.NPC.value, CombatantRole.ALLY.value] and c.is_active
        ]

        pcs_defeated = len(active_pcs) == 0 and any(
            c.role == CombatantRole.PC.value for c in combatants
        )
        npcs_defeated = len(active_npcs) == 0 and any(
            c.role in [CombatantRole.NPC.value, CombatantRole.ALLY.value] for c in combatants
        )

        should_end = pcs_defeated or npcs_defeated
        winner = None

        if pcs_defeated:
            winner = "npcs"
        elif npcs_defeated:
            winner = "pcs"

        result = {
            "combat_id": str(combat_id),
            "should_end": should_end,
            "winner": winner,
            "active_pcs": len(active_pcs),
            "active_npcs": len(active_npcs),
            "pcs_defeated": pcs_defeated,
            "npcs_defeated": npcs_defeated,
        }

        if should_end:
            combat.state = CombatState.ENDED.value
            combat.ended_at = datetime.utcnow()
            self.db.commit()

        return result

    def generate_combat_report(self, combat_id: uuid.UUID) -> Dict[str, Any]:
        """Generate a detailed combat report.

        Args:
            combat_id: Combat UUID

        Returns:
            Dict with full combat report
        """
        combat = self.db.query(Combat).filter(Combat.id == combat_id).first()
        if not combat:
            raise ValueError(f"Combat {combat_id} not found")

        combatants = self.db.query(Combatant).filter(Combatant.combat_id == combat_id).all()

        actions = (
            self.db.query(CombatAction)
            .filter(CombatAction.combat_id == combat_id)
            .order_by(CombatAction.round, CombatAction.turn_order)
            .all()
        )

        rounds = {}
        for action in actions:
            round_num = action.round
            if round_num not in rounds:
                rounds[round_num] = []
            rounds[round_num].append(
                {
                    "turn": action.turn_order,
                    "actor_id": str(action.actor_id) if action.actor_id else None,
                    "target_id": str(action.target_id) if action.target_id else None,
                    "action_type": action.action_type,
                    "roll": action.roll_value,
                    "success": action.success_level,
                    "damage": action.damage_amount,
                }
            )

        casualties = {
            "pcs": [
                c.name for c in combatants if c.role == CombatantRole.PC.value and not c.is_active
            ],
            "npcs": [
                c.name
                for c in combatants
                if c.role in [CombatantRole.NPC.value, CombatantRole.ALLY.value] and not c.is_active
            ],
        }

        survivors = {
            "pcs": [c.name for c in combatants if c.role == CombatantRole.PC.value and c.is_active],
            "npcs": [
                c.name
                for c in combatants
                if c.role in [CombatantRole.NPC.value, CombatantRole.ALLY.value] and c.is_active
            ],
        }

        total_damage_dealt = sum(a.damage_amount or 0 for a in actions)

        return {
            "combat_id": str(combat_id),
            "location": combat.location,
            "description": combat.description,
            "started_at": combat.started_at.isoformat() if combat.started_at else None,
            "ended_at": combat.ended_at.isoformat() if combat.ended_at else None,
            "total_rounds": combat.current_round,
            "total_actions": len(actions),
            "total_damage_dealt": total_damage_dealt,
            "rounds": rounds,
            "combatants": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "role": c.role,
                    "hp_final": c.hp,
                    "hp_max": c.hp_max,
                    "is_active": c.is_active,
                }
                for c in combatants
            ],
            "casualties": casualties,
            "survivors": survivors,
        }

    def _calculate_damage(
        self,
        success_level: SuccessLevel,
        damage_roll: Optional[int],
        damage_bonus: int,
    ) -> int:
        """Calculate damage based on success level."""
        if damage_roll is None:
            damage_roll = randint(1, 6)

        base_damage = damage_roll + damage_bonus

        if success_level == SuccessLevel.EXTREME_SUCCESS:
            return base_damage + randint(1, 6)
        elif success_level == SuccessLevel.HARD_SUCCESS:
            return max(1, base_damage)
        else:
            return max(1, base_damage)

    def _roll_dice_notation(self, notation: str) -> int:
        """Roll dice from notation (e.g., '2d6')."""
        try:
            count, sides = notation.lower().split("d")
            count = int(count)
            sides = int(sides)
            return sum(randint(1, sides) for _ in range(count))
        except Exception:
            return randint(1, 6)

    def _check_combatant_status(self, combatant: Combatant, result: Dict[str, Any]) -> None:
        """Check and update combatant status."""
        if combatant.hp <= 0:
            combatant.is_dying = True
            combatant.is_active = False
            result["target_status"] = "dying"
        else:
            result["target_status"] = "active"
