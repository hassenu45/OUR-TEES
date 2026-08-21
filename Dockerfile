# Railway Deployment - AZMA Store
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (for caching)
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

# Generate Prisma Client
RUN npx prisma generate

# Copy application code
COPY . .

# Build if needed (no build step for static + express)
# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]