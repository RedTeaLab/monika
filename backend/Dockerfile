# Multi-stage build for backend
FROM python:3.11.14-alpine3.23 AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libpq \
    curl \
    && rm -rf /var/cache/apk/*

# Install uv for faster package management
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv

# Install dependencies
RUN uv pip install --system .

# Production stage
FROM python:3.11.14-alpine3.23

# Set working directory
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    libpq \
    curl \
    && rm -rf /var/cache/apk/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY ./src ./src
COPY ./alembic.ini ./
COPY ./alembic ./alembic

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
