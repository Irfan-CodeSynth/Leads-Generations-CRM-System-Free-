# Playwright base image ships Node + Chromium with all system deps.
# Tag MUST match the pinned playwright version in apps/worker/package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/

RUN npm ci --omit=dev

COPY packages ./packages
COPY apps/worker ./apps/worker

# Render injects PORT for web services; the health endpoint listens on it.
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@leads/worker"]
