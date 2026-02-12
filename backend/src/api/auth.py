"""Authentication API routes.

简化的 API 响应格式：
{
  "code": int,     # 业务状态码：0=成功，1=失败
  "message": str  # 具体消息
}
"""

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.core.database import get_db
from src.core.security import get_password_hash, verify_password, create_access_token
from src.core.config import settings
from src.core.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["authentication"])


# ===== 请求模型 =====
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


# ===== 响应模型 =====
class ApiResponse(BaseModel):
    code: int  # 业务状态码：0=成功，1=失败
    message: str  # 具体消息


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int


class RegisterResponse(BaseModel):
    id: int
    username: str
    email: str


class UserInfo(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool


# ==================== 路由实现 ====================

@router.post("/register", response_model=ApiResponse)
def register(user_data: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user.
    成功：0
    失败：1（用户名/邮箱已存在）
    """
    # 查找用户名
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        return ApiResponse(code=1, message="用户名或邮箱已被注册")

    # 查找邮箱
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        return ApiResponse(code=1, message="邮箱已被注册")

    # 创建用户
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return ApiResponse(code=0, message="注册成功", data={"id": new_user.id})


@router.post("/login", response_model=ApiResponse)
def login(user_data: LoginRequest, db: Session = Depends(get_db)):
    """
    User login.
    成功：0（返回 access_token 和用户信息）
    失败：1（用户名或密码错误）
    失败：4（用户不存在）
    """
    # 查找用户
    user = db.query(User).filter(User.username == user_data.username).first()
    if not user:
        return ApiResponse(code=4, message="用户不存在")

    # 验证密码
    if not verify_password(user_data.password, user.hashed_password):
        return ApiResponse(code=1, message="用户名或密码错误")

    # 创建访问令牌
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=access_token_expires,
    )

    return ApiResponse(
        code=0,
        message="登录成功",
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES
        }
    )


@router.get("/me", response_model=ApiResponse)
def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """
    Get current user information.
    成功：0
    失败：1（未授权）
    """
    if not current_user:
        return ApiResponse(code=1, message="未登录")

    return ApiResponse(
        code=0,
        message="获取用户信息成功",
        data={
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "role": current_user.role,
            "is_active": current_user.is_active
        }
    )