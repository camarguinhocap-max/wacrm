# syntax=docker/dockerfile:1

# ---------------------------------------------------------------
# Stage 1 — install dependencies (cached until package*.json change)
# ---------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` is the fast, reproducible path and should handle the vast
# majority of builds. Fall back to `npm install` when it fails — this
# self-heals a package-lock.json that's drifted out of sync with
# package.json (npm ci refuses to proceed on any mismatch, however
# minor) without needing a human to regenerate and re-commit the lock
# file first. The fallback only affects this build's throwaway
# node_modules layer; it never writes back to the repo.
RUN npm ci || npm install

# ---------------------------------------------------------------
# Stage 2 — build
#
# NEXT_PUBLIC_* values are inlined into the client bundle at build
# time, so they must be provided as build args (docker-compose.yml
# forwards them from .env.local). Server-only secrets (service role
# key, ENCRYPTION_KEY, META_APP_SECRET, ...) are read at runtime and
# must NOT be baked into the image.
# ---------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_LOCALE=en
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_LOCALE=$NEXT_PUBLIC_APP_LOCALE \
    NEXT_TELEMETRY_DISABLED=1

# V8 auto-sizes its heap ceiling off the container's physical RAM alone
# (it can't see swap). On this VPS (954MB RAM) that works out to a
# ~490MB old-space limit — confirmed by a real build crash: "FATAL
# ERROR: Reached heap limit Allocation failed - JavaScript heap out of
# memory" after ~800s, well before the process actually ran out of
# addressable memory (the VPS has 2GB of swap sitting unused at the
# time of the crash). Raising the ceiling explicitly lets webpack use
# that swap instead of hitting a wall the OS never actually imposed.
# 2560MB leaves headroom under 954MB RAM + 2GB swap for the OS and
# npm/node's own non-heap overhead.
ENV NODE_OPTIONS=--max-old-space-size=2560

RUN npm run build

# ---------------------------------------------------------------
# Stage 3 — minimal runtime (standalone output)
# ---------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
