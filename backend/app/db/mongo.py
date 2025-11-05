import os
from pymongo import MongoClient
MONGO_URI = os.getenv("MONGO_URI","mongodb://127.0.0.1:27017/")
DB_NAME   = os.getenv("MONGO_DB","ai_assistant")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
users_col = db["users"]
chats_col = db["conversations"]
users_col.create_index("email", unique=True)
chats_col.create_index([("user_id",1),("created_at",-1)])
