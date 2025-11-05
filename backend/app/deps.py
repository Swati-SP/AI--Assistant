from fastapi import Header, HTTPException
from app.utils.auth import decode_token

async def get_current_user(authorization: str | None = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    data = decode_token(authorization.split(" ",1)[1])
    if not data: raise HTTPException(401,"Invalid or expired token")
    return {"user_id": data["sub"], "email": data["email"]}
