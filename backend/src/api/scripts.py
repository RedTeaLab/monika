"""Scripts API routes for scenario/module management."""

import json
import logging
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from src.core.database import get_db
from src.core.auth import get_current_user
from src.models.script import Script, ScriptVersion, ScriptScene, ScriptStatus, ScriptType
from src.models.user import User
from src.services.script_parser import (
    ScriptParser,
    ScriptValidator,
    calculate_file_hash,
    check_injection,
)
from src.schemas.script import (
    ScriptCreate,
    ScriptUpdate,
    ScriptResponse,
    ScriptListResponse,
    ScriptDetailResponse,
    ScriptVersionResponse,
    UploadResponse,
    ValidationResultResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scripts", tags=["scripts"])


@router.post("/upload", response_model=UploadResponse)
async def upload_script(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and validate a JSON script file."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only JSON files are supported"
        )

    try:
        content = await file.read()

        injection_issues = check_injection(content.decode("utf-8"))
        if injection_issues:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Security check failed", "issues": injection_issues},
            )

        parser = ScriptParser()
        script_data, parse_error = parser.parse(content)

        if parse_error:
            return UploadResponse(
                success=False,
                message=parse_error,
                validation_result=None,
                script_id=None,
            )

        validator = ScriptValidator()
        validation_result = validator.validate(script_data)

        metadata = parser.extract_metadata(script_data)
        stats = parser.calculate_stats(script_data)

        script = Script(
            owner_id=current_user.id,
            name=metadata.get("title", file.filename),
            description=metadata.get("description"),
            script_type=ScriptType.SCENARIO.value,
            status=ScriptStatus.VALID.value
            if validation_result.is_valid
            else ScriptStatus.INVALID.value,
            metadata_json=metadata,
            tags=metadata.get("tags", []),
            scene_count=stats["scene_count"],
            npc_count=stats["npc_count"],
            clue_count=stats["clue_count"],
            validation_errors=[e.model_dump() for e in validation_result.errors]
            if validation_result.errors
            else None,
            validation_warnings=[w.model_dump() for w in validation_result.warnings]
            if validation_result.warnings
            else None,
        )
        db.add(script)
        db.flush()

        file_hash = calculate_file_hash(content)
        version = ScriptVersion(
            script_id=script.id,
            version_number=1,
            content_json=script_data.model_dump(),
            file_size_bytes=len(content),
            file_hash=file_hash,
            validation_status=script.status,
            validation_errors=script.validation_errors,
        )
        db.add(version)

        scenes = parser.extract_scenes(script_data)
        for scene_data in scenes:
            scene = ScriptScene(
                script_id=script.id,
                name=scene_data["name"],
                description=scene_data.get("description"),
                location=scene_data.get("location"),
                time_of_day=scene_data.get("time_of_day"),
                atmosphere=scene_data.get("atmosphere"),
                order_index=scene_data["order_index"],
                npcs=scene_data.get("npcs", []),
                clues=scene_data.get("clues", []),
                handouts=scene_data.get("handouts", []),
                estimated_duration_minutes=scene_data.get("estimated_duration_minutes"),
            )
            db.add(scene)

        db.commit()
        db.refresh(script)

        return UploadResponse(
            success=True,
            message="Script uploaded successfully",
            validation_result=ValidationResultResponse(
                is_valid=validation_result.is_valid,
                errors=validation_result.errors,
                warnings=validation_result.warnings,
                stats=validation_result.stats,
            ),
            script_id=str(script.id),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {str(e)}"
        )


@router.get("", response_model=ScriptListResponse)
async def list_scripts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    script_type: Optional[str] = Query(None, alias="type"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List scripts with pagination and filtering."""
    query = select(Script).where(Script.owner_id == current_user.id)

    if status_filter:
        query = query.where(Script.status == status_filter)

    if script_type:
        query = query.where(Script.script_type == script_type)

    if search:
        query = query.where(Script.name.ilike(f"%{search}%"))

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    query = query.order_by(Script.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    scripts = db.scalars(query).all()

    return ScriptListResponse(
        scripts=[ScriptResponse.model_validate(s) for s in scripts],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/public", response_model=ScriptListResponse)
async def list_public_scripts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List public scripts."""
    query = select(Script).where(
        Script.is_public == True, Script.status == ScriptStatus.PUBLISHED.value
    )

    if search:
        query = query.where(Script.name.ilike(f"%{search}%"))

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    query = query.order_by(Script.download_count.desc(), Script.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    scripts = db.scalars(query).all()

    return ScriptListResponse(
        scripts=[ScriptResponse.model_validate(s) for s in scripts],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{script_id}", response_model=ScriptDetailResponse)
async def get_script(
    script_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get script details with scenes."""
    script = db.scalar(select(Script).where(Script.id == script_id))

    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    if script.owner_id != current_user.id and not script.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    scenes = db.scalars(
        select(ScriptScene)
        .where(ScriptScene.script_id == script_id)
        .order_by(ScriptScene.order_index)
    ).all()

    return ScriptDetailResponse(
        script=ScriptResponse.model_validate(script),
        scenes=[s.to_dict() for s in scenes],
        versions=[v.to_dict() for v in script.versions[:5]],
    )


@router.put("/{script_id}", response_model=ScriptResponse)
async def update_script(
    script_id: str,
    update_data: ScriptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update script metadata."""
    script = db.scalar(
        select(Script).where(Script.id == script_id, Script.owner_id == current_user.id)
    )

    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    if update_data.name is not None:
        script.name = update_data.name
    if update_data.description is not None:
        script.description = update_data.description
    if update_data.tags is not None:
        script.tags = update_data.tags
    if update_data.is_public is not None:
        if update_data.is_public and script.status != ScriptStatus.VALID.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot publish invalid script"
            )
        script.is_public = update_data.is_public
        if update_data.is_public:
            script.status = ScriptStatus.PUBLISHED.value

    db.commit()
    db.refresh(script)

    return ScriptResponse.model_validate(script)


@router.delete("/{script_id}")
async def delete_script(
    script_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a script."""
    script = db.scalar(
        select(Script).where(Script.id == script_id, Script.owner_id == current_user.id)
    )

    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    db.delete(script)
    db.commit()

    return {"message": "Script deleted successfully"}


@router.get("/{script_id}/versions", response_model=List[ScriptVersionResponse])
async def get_script_versions(
    script_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get version history for a script."""
    script = db.scalar(select(Script).where(Script.id == script_id))

    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    if script.owner_id != current_user.id and not script.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    versions = db.scalars(
        select(ScriptVersion)
        .where(ScriptVersion.script_id == script_id)
        .order_by(ScriptVersion.version_number.desc())
    ).all()

    return [ScriptVersionResponse.model_validate(v) for v in versions]


@router.get("/{script_id}/versions/{version_number}", response_model=ScriptVersionResponse)
async def get_script_version(
    script_id: str,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific version of a script."""
    version = db.scalar(
        select(ScriptVersion).where(
            ScriptVersion.script_id == script_id, ScriptVersion.version_number == version_number
        )
    )

    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    if version.script.owner_id != current_user.id and not version.script.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return ScriptVersionResponse.model_validate(version)


@router.post("/{script_id}/validate", response_model=ValidationResultResponse)
async def validate_script(
    script_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-validate a script."""
    script = db.scalar(
        select(Script).where(Script.id == script_id, Script.owner_id == current_user.id)
    )

    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    latest_version = db.scalar(
        select(ScriptVersion)
        .where(ScriptVersion.script_id == script_id)
        .order_by(ScriptVersion.version_number.desc())
    )

    if not latest_version or not latest_version.content_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No content to validate"
        )

    from src.services.script_parser import ScriptJSON

    try:
        script_data = ScriptJSON(**latest_version.content_json)
    except Exception as e:
        return ValidationResultResponse(
            is_valid=False,
            errors=[{"field": "content", "message": str(e), "code": "PARSE_ERROR"}],
            warnings=[],
            stats={},
        )

    validator = ScriptValidator()
    result = validator.validate(script_data)

    script.status = ScriptStatus.VALID.value if result.is_valid else ScriptStatus.INVALID.value
    script.validation_errors = [e.model_dump() for e in result.errors] if result.errors else None
    script.validation_warnings = (
        [w.model_dump() for w in result.warnings] if result.warnings else None
    )

    latest_version.validation_status = script.status
    latest_version.validation_errors = script.validation_errors

    db.commit()

    return ValidationResultResponse(
        is_valid=result.is_valid,
        errors=result.errors,
        warnings=result.warnings,
        stats=result.stats,
    )
