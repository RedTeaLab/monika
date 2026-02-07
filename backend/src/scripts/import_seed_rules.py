"""Script to import seed rules data into the database."""
import json
import logging
import sys
import os
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from src.core.database import SessionLocal, engine, Base
from src.models.rule import Rule, RuleFAQ
from src.schemas.rule import RuleCreate, FAQCreate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def import_rules_from_json(file_path: str, db: Session) -> dict:
    """
    Import rules and FAQs from a JSON file.

    Args:
        file_path: Path to the JSON file containing seed data
        db: Database session

    Returns:
        Dictionary with import statistics
    """
    # Load JSON data
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        logger.error(f"File not found: {file_path}")
        error_list = [f"File not found: {file_path}"]
        return {"imported": 0, "failed": 0, "errors": error_list}
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON: {e}")
        error_list = [f"Invalid JSON: {e}"]
        return {"imported": 0, "failed": 0, "errors": error_list}

    imported = 0
    failed = 0
    errors = []

    # Clear existing data (optional - comment out if you want to keep existing data)
    logger.info("Clearing existing rules and FAQs...")
    db.query(Rule).delete()
    db.query(RuleFAQ).delete()
    db.commit()

    # Import rules
    rules_count = len(data.get("rules", []))
    logger.info(f"Importing {rules_count} rules...")
    for rule_data in data.get("rules", []):
        try:
            rule = Rule(
                title=rule_data["title"],
                category=rule_data["category"],
                subcategory=rule_data.get("subcategory"),
                content=rule_data["content"],
                example=rule_data.get("example"),
                mechanics=rule_data.get("mechanics"),
                aliases=rule_data.get("aliases", []),
                tags=rule_data.get("tags", []),
                related_rule_ids=rule_data.get("related_rule_ids", [])
            )
            db.add(rule)
            imported += 1
            logger.debug(f"Imported rule: {rule_data['title']}")
        except Exception as e:
            failed += 1
            title = rule_data.get("title", "Unknown")
            error_msg = f"Failed to import rule '{title}': {str(e)}"
            errors.append(error_msg)
            logger.error(error_msg)

    # Import FAQs
    faqs_count = len(data.get("faqs", []))
    logger.info(f"Importing {faqs_count} FAQs...")
    for faq_data in data.get("faqs", []):
        try:
            faq = RuleFAQ(
                question=faq_data["question"],
                answer=faq_data["answer"],
                category=faq_data.get("category"),
                related_rule_ids=faq_data.get("related_rule_ids", [])
            )
            db.add(faq)
            imported += 1
            question_preview = faq_data["question"][:50]
            logger.debug(f"Imported FAQ: {question_preview}...")
        except Exception as e:
            failed += 1
            error_msg = f"Failed to import FAQ: {str(e)}"
            errors.append(error_msg)
            logger.error(error_msg)

    # Commit all changes
    try:
        db.commit()
        logger.info("Successfully committed all changes to database.")
    except Exception as e:
        db.rollback()
        error_msg = f"Failed to commit import: {str(e)}"
        logger.error(error_msg)
        errors.append(error_msg)
        return {"imported": imported, "failed": failed, "errors": errors}

    return {
        "imported": imported,
        "failed": failed,
        "errors": errors
    }


def main():
    """Main entry point for the import script."""
    # Get the file path
    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / "data"
    default_file = data_dir / "seed_rules.json"

    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = str(default_file)

    logger.info(f"Importing rules from: {file_path}")

    # Create database session
    db = SessionLocal()

    try:
        # Ensure tables exist
        Base.metadata.create_all(bind=engine)

        # Import data
        result = import_rules_from_json(file_path, db)

        # Print results
        logger.info("=" * 50)
        logger.info("Import Results:")
        logger.info(f"  Imported: {result['imported']}")
        logger.info(f"  Failed: {result['failed']}")
        if result['errors']:
            logger.info(f"  Errors: {len(result['errors'])}")
            for error in result['errors']:
                logger.info(f"    - {error}")
        logger.info("=" * 50)

        if result['failed'] == 0:
            logger.info("✓ Import completed successfully!")
        else:
            logger.warning("⚠ Import completed with some failures.")

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
