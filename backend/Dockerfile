# =============================================================
# NextAgentAI Backend Dockerfile
# Used for both local Docker Compose and Render deployment.
# Base: python:3.11-slim
# Pre-downloads sentence-transformers model during build so
# first request is not blocked on a 90MB model download.
# =============================================================

FROM python:3.11-slim

# System dependencies for psycopg2-binary and spaCy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Download spaCy English model
RUN python -m spacy download en_core_web_sm

# Pre-download sentence-transformers model to image layer
# This prevents cold-start delay on first embedding request
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); \
print('Model pre-loaded, dim:', model.get_sentence_embedding_dimension())"

# Copy application source
COPY . .

# Copy demo seed data and config
# (config.yaml and demo/ are mounted as volumes in docker-compose,
#  but copied here for Render where volumes are not available)

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

# FastAPI listens on 8000
EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
