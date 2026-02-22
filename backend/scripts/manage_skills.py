"""
Skill management utility for adding and updating skills.

Usage:
    python scripts/manage_skills.py add <json_file>
    python scripts/manage_skills.py update <skill_id> <json_file>
    python scripts/manage_skills.py list [--era <modern|1920s>] [--category <category>]
    python scripts manage_skills.py export <json_file>

Example:
    python scripts/manage_skills.py add skills.json
    python scripts/manage_skills.py update 1 update_skill.json
    python scripts/manage_skills.py list --era modern --category combat
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.core.database import get_db, engine
from src.models.skill import Skill, SkillCategory


def load_json_file(file_path: str) -> dict:
    """Load JSON data from file."""
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def create_skill_from_data(session, skill_data: dict, parent_skill_id: int = None) -> Skill:
    """Create a Skill object from data dictionary."""
    skill = Skill(
        name=skill_data["name"],
        name_en=skill_data["name_en"],
        base_value=skill_data["base_value"],
        category=skill_data["category"],
        available_modern=skill_data.get("available_modern", True),
        available_1920s=skill_data.get("available_1920s", True),
        description=skill_data.get("description"),
        difficulty_levels=skill_data.get("difficulty_levels"),
        push_examples=skill_data.get("push_examples"),
        push_failure_examples=skill_data.get("push_failure_examples"),
        opposing_skills=skill_data.get("opposing_skills"),
        has_specializations=skill_data.get("has_specializations", False),
        parent_skill_id=parent_skill_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    return skill


def add_skills_from_file(json_file: str):
    """Add skills from JSON file to database."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    try:
        skills_data = load_json_file(json_file)
        added_count = 0

        for skill_key, skill_data in skills_data.items():
            # Check if skill already exists
            existing = session.query(Skill).filter(Skill.name == skill_data["name"]).first()
            if existing:
                print(f"⚠️  Skill '{skill_data['name']}' already exists, skipping...")
                continue

            # Create base skill
            skill = create_skill_from_data(session, skill_data)
            session.add(skill)
            session.flush()  # Get the ID

            added_count += 1
            print(f"✅ Added skill: {skill_data['name']}")

            # Create specializations if any
            if skill_data.get("has_specializations") and "specializations" in skill_data:
                for spec_name in skill_data["specializations"]:
                    spec_data = skill_data.copy()
                    spec_data["name"] = spec_name
                    spec_data["name_en"] = spec_name  # Could be translated
                    spec_data["has_specializations"] = False

                    spec = create_skill_from_data(session, spec_data, parent_skill_id=skill.id)
                    session.add(spec)
                    session.commit()
                    print(f"   └─ Added specialization: {spec_name}")

        session.commit()
        print(f"\n✅ Successfully added {added_count} skill(s) from {json_file}")

    except Exception as e:
        session.rollback()
        print(f"❌ Error adding skills: {e}")
        raise
    finally:
        session.close()


def list_skills(era: str = None, category: str = None):
    """List skills with optional filters."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    try:
        query = session.query(Skill).filter(Skill.parent_skill_id == None)

        if era:
            if era == "modern":
                query = query.filter(Skill.available_modern == True)
            elif era == "1920s":
                query = query.filter(Skill.available_1920s == True)

        if category:
            query = query.filter(Skill.category == category)

        skills = query.order_by(Skill.category, Skill.name).all()

        if not skills:
            print("No skills found.")
            return

        print(
            f"\n{'Name':<20} {'English':<20} {'Base':<5} {'Category':<12} {'Modern':<7} {'1920s':<5}"
        )
        print("-" * 80)

        for skill in skills:
            print(
                f"{skill.name:<20} {skill.name_en:<20} {skill.base_value:<5} "
                f"{skill.category:<12} {'✓' if skill.available_modern else '✗':<7} "
                f"{'✓' if skill.available_1920s else '✗':<5}"
            )

            if skill.has_specializations:
                specs = session.query(Skill).filter(Skill.parent_skill_id == skill.id).all()
                for spec in specs:
                    print(f"  └─ {spec.name:<18} {spec.name_en:<20} {spec.base_value:<5}")

        print(f"\nTotal: {len(skills)} skill(s)")

    finally:
        session.close()


def export_skills(output_file: str):
    """Export all skills to JSON file."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    try:
        skills = session.query(Skill).filter(Skill.parent_skill_id == None).all()
        export_data = {}

        for skill in skills:
            skill_data = {
                "name": skill.name,
                "name_en": skill.name_en,
                "base_value": skill.base_value,
                "category": skill.category,
                "available_modern": skill.available_modern,
                "available_1920s": skill.available_1920s,
                "has_specializations": skill.has_specializations,
            }

            if skill.description:
                skill_data["description"] = skill.description
            if skill.difficulty_levels:
                skill_data["difficulty_levels"] = skill.difficulty_levels
            if skill.push_examples:
                skill_data["push_examples"] = skill.push_examples
            if skill.push_failure_examples:
                skill_data["push_failure_examples"] = skill.push_failure_examples
            if skill.opposing_skills:
                skill_data["opposing_skills"] = skill.opposing_skills

            if skill.has_specializations:
                specs = session.query(Skill).filter(Skill.parent_skill_id == skill.id).all()
                skill_data["specializations"] = [s.name for s in specs]

            export_data[skill.name_en.lower().replace(" ", "_")] = skill_data

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

        print(f"✅ Exported {len(skills)} skill(s) to {output_file}")

    finally:
        session.close()


def main():
    parser = argparse.ArgumentParser(description="Skill management utility")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Add command
    add_parser = subparsers.add_parser("add", help="Add skills from JSON file")
    add_parser.add_argument("json_file", help="Path to JSON file containing skill data")

    # List command
    list_parser = subparsers.add_parser("list", help="List skills")
    list_parser.add_argument("--era", choices=["modern", "1920s"], help="Filter by era")
    list_parser.add_argument("--category", help="Filter by category")

    # Export command
    export_parser = subparsers.add_parser("export", help="Export skills to JSON file")
    export_parser.add_argument("output_file", help="Output JSON file path")

    args = parser.parse_args()

    if args.command == "add":
        add_skills_from_file(args.json_file)
    elif args.command == "list":
        list_skills(args.era, args.category)
    elif args.command == "export":
        export_skills(args.output_file)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
