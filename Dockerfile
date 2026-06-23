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
# Strip stray whitespace/CR — Windows .env values are CRLF, and a trailing \r in the key
# gets URL-encoded into the request (api_key=...%0D) and Giphy rejects it with 401.
ARG VITE_GIPHY_KEY
RUN VITE_GIPHY_KEY="$(printf '%s' "$VITE_GIPHY_KEY" | tr -d '[:space:]')" pnpm build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Потолок V8-кучи ниже лимита контейнера (на Render переопределяется через render.yaml).
ENV NODE_OPTIONS=--max-old-space-size=320
EXPOSE 3000

CMD ["pnpm", "--filter", "@tmw/server", "start"]
