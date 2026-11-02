# Worker: job queue, Overture search, crawling, Playwright audits & screenshots, email scheduler.
# The Playwright image ships Chromium + system deps matching playwright@1.63.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
CMD ["npx", "tsx", "src/worker/main.ts"]
