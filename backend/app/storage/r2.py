import boto3
from botocore.config import Config
from app.storage.base import BaseStorage
from app.core.config import settings


class R2Storage(BaseStorage):
    """
    Cloudflare R2 — drop-in replacement for local storage.
    Activate by setting STORAGE_BACKEND=r2 in .env
    """

    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT_URL,         # https://<account_id>.r2.cloudflarestorage.com
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        self.bucket = settings.R2_BUCKET_NAME
        self.public_url = settings.R2_PUBLIC_URL            # https://your-custom-domain.com or R2 public URL

    async def upload(self, file_bytes: bytes, destination: str, content_type: str) -> str:
        self.client.put_object(
            Bucket=self.bucket,
            Key=destination,
            Body=file_bytes,
            ContentType=content_type,
        )
        return f"{self.public_url}/{destination}"

    async def delete(self, destination: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=destination)