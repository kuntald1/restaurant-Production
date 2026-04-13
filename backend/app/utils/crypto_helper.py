from Crypto.Cipher import AES
from dotenv import load_dotenv
import base64
import hashlib
import os

load_dotenv()

SECRET_KEY = os.getenv("CRYPTO_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("CRYPTO_SECRET_KEY is not set in .env file")


def decrypt_password(encrypted_text: str) -> str:
    try:
        secret_key = SECRET_KEY.encode("utf-8")

        # CryptoJS uses MD5 to derive key and IV from passphrase
        encrypted_bytes = base64.b64decode(encrypted_text)

        # Extract salt (bytes 8-16)
        salt = encrypted_bytes[8:16]
        encrypted_data = encrypted_bytes[16:]

        # Derive key and IV using OpenSSL EVP_BytesToKey (MD5 based)
        derived = b""
        last = b""
        while len(derived) < 48:  # 32 bytes key + 16 bytes IV
            last = hashlib.md5(last + secret_key + salt).digest()
            derived += last

        key = derived[:32]
        iv = derived[32:48]

        # Decrypt
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(encrypted_data)

        # Remove PKCS7 padding
        pad_len = decrypted[-1]
        decrypted = decrypted[:-pad_len]

        return decrypted.decode("utf-8")

    except Exception as e:
        raise ValueError(f"Decryption failed: {str(e)}")