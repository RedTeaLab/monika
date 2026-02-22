"""Authentication dependencies."""
from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.database import get_db
from src.core.security import decode_access_token
from src.models.user import User
from src.schemas.user import TokenData

# 使用 HTTPBearer 进行 JWT 认证
bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    username: str = payload.get("sub")
    user_id: int = payload.get("user_id")

    if username is None:
        raise credentials_exception

    token_data = TokenData(username=username, user_id=user_id)

    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db),
) -> User | None:
    """Get the current authenticated user from JWT token, or None if not authenticated."""
    if credentials is None:
        return None

    try:
        token = credentials.credentials
        payload = decode_access_token(token)
        if payload is None:
            return None

        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")

        if username is None:
            return None

        user = db.query(User).filter(User.username == username).first()
        return user
    except (JWTError, Exception):
        return None
