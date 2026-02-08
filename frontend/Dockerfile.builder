# Multi-stage build for frontend

# Build stage - creates static files
FROM node:latest AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Clear Vite cache and build the application
RUN rm -rf node_modules/.vite && npm run build

# Runtime stage - minimal image just for building
FROM node:latest

WORKDIR /app

# Copy build output
COPY --from=builder /app/dist ./dist

# This stage is used only to extract build artifacts
# The actual serving is done by nginx container
CMD ["sh", "-c", "echo 'Frontend build complete'"]
