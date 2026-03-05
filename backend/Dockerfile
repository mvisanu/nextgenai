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

# /workspace is the repo-level root so "from backend.app.*" imports resolve correctly.
# The backend source is copied into /workspace/backend/ matching the local dev structure.
WORKDIR /workspace

# Copy requirements first for Docker layer caching
COPY requirements.txt ./backend/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt

# Download spaCy English model
RUN python -m spacy download en_core_web_sm

# Pre-download sentence-transformers model to image layer
# This prevents cold-start delay on first embedding request
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); \
print('Model pre-loaded, dim:', model.get_sentence_embedding_dimension())"

# Copy application source into backend/ subdirectory
COPY . ./backend/

# Ensure entrypoint is executable
RUN chmod +x backend/entrypoint.sh

# FastAPI listens on 8000
EXPOSE 8000

ENTRYPOINT ["./backend/entrypoint.sh"]
