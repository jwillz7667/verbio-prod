# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files from root and backend
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install all dependencies
RUN npm ci --workspace=backend --ignore-scripts

# Copy backend source code and config
COPY backend ./backend

# Build the backend
RUN npm run --workspace=backend build

# Production stage
FROM node:20-alpine

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm ci --workspace=backend --production --ignore-scripts

# Copy built application from builder stage
COPY --from=builder /app/backend/dist ./backend/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

# Run the application
CMD ["node", "backend/dist/index.js"]