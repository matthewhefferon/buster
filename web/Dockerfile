# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Only keep build-time public env vars as args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

# Set public env vars for build time
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Copy all necessary files first
COPY package*.json ./
COPY next.config.mjs ./
COPY tsconfig*.json ./
COPY public ./public
COPY . .

# Install dependencies with verbose logging
RUN npm ci

# Build with verbose output
RUN npm run build --verbose

# Production stage
FROM node:20-alpine

WORKDIR /app

# Set to production environment
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./

# Expose the port your app runs on
EXPOSE 3000

# Add tini for proper signal handling
RUN apk add --no-cache tini

# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["npm", "start"]
