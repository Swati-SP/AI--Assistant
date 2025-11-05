import os, time
from passlib.hash import bcrypt
from jose import jwt, JWTError

JWT_SECRET = os.getenv("JWT_SECRET","devsecret")
ALG = "HS256"
EXP = int(os.getenv("JWT_EXPIRE_MIN","43200"))*60

def hash_pw(p:str)->str: return bcrypt.hash(p)
def verify_pw(p,h)->bool: return bcrypt.verify(p,h)
def make_token(uid:str, email:str)->str:
    return jwt.encode({"sub":uid,"email":email,"exp":int(time.time())+EXP}, JWT_SECRET, algorithm=ALG)
def decode_token(t:str):
    try: return jwt.decode(t, JWT_SECRET, algorithms=[ALG])
    except JWTError: return None
