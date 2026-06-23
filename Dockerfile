# Один сервис: Fastify раздаёт API, Socket.IO и собранные фронты (web + overlay).
FROM node:24-slim

# ffmpeg/ffprobe нужны для валидации и обрезки медиа.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

# VITE_* vars are inlined into the web bundle at build time, not read at runtime.
# Pass via --build-arg; the runtime --env-file only reaches the server (too late for the build).
# The Giphy web key is a public client key (ships in the bundle), so a build-arg is fine.
ARG VITE_GIPHY_KEY
# Sanitize (Windows .env values are CRLF — a trailing \r → api_key=...%0D → Giphy 401) and
# fail loudly if the key is empty, instead of silently shipping a "GIFs unavailable" bundle.
RUN set -e; \
  VITE_GIPHY_KEY="$(printf '%s' "$VITE_GIPHY_KEY" | tr -d '[:space:]')"; \
  if [ -z "$VITE_GIPHY_KEY" ]; then \
    echo "ERROR: VITE_GIPHY_KEY build-arg is empty. Build with: docker build --build-arg VITE_GIPHY_KEY=<key> ."; \
    exit 1; \
  fi; \
  export VITE_GIPHY_KEY; \
  pnpm build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Потолок V8-кучи ниже лимита контейнера (на Render переопределяется через render.yaml).
ENV NODE_OPTIONS=--max-old-space-size=320
EXPOSE 3000

CMD ["pnpm", "--filter", "@tmw/server", "start"]
