FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required by psycopg2-binary
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source code (no venv — Docker IS the environment)
COPY app/ ./app/

# Create static files directory
RUN mkdir -p static

# Expose FastAPI port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
