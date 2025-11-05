from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.db.mongo import users_col
from app.utils.auth import hash_pw, verify_pw, make_token

router = APIRouter(prefix="/auth", tags=["auth"])

class Signup(BaseModel):
    name:str; email:EmailStr; password:str
class Login(BaseModel):
    email:EmailStr; password:str

@router.post("/signup")
def signup(b: Signup):
    if users_col.find_one({"email": b.email}):
        raise HTTPException(400,"Email already registered")
    res = users_col.insert_one({"name":b.name,"email":b.email,"password":hash_pw(b.password)})
    return {"token": make_token(str(res.inserted_id), b.email)}

@router.post("/login")
def login(b: Login):
    u = users_col.find_one({"email": b.email})
    if not u or not verify_pw(b.password, u["password"]):
        raise HTTPException(401,"Invalid credentials")
    return {"token": make_token(str(u["_id"]), u["email"]), "name": u.get("name","")}
