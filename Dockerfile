# Base image using Node 24 Alpine (lightweight and secure)
FROM node:24-alpine AS base

# Install system dependencies needed for some native builds (optional but safe)
RUN apk add --no-cache libc6-compat

# Set working directory inside the container
WORKDIR /app

# Install dependencies first (leverages Docker layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the application files
COPY . .

# Expose Next.js development port
EXPOSE 3000

# Set environment variables for development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=development

# Start Next.js in hot-reloading development mode
CMD ["npm", "run", "dev"]
