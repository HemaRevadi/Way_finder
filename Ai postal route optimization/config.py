import os
import secrets

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', secrets.token_hex(16))  # Generate a random key if not set in .env
    UPLOAD_FOLDER = './uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # Limit upload size to 16 MB