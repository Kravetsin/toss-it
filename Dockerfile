# Один сервис: Fastify раздаёт API, Socket.IO и собранные фронты (web + overlay).
FROM node:24-slim

# ffmpeg/ffprobe нужны для валидации и обрезки медиа; curl fetches Piper below.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Piper TTS (linux x86_64) + voices: own layer BEFORE COPY so code changes
# don't re-download ~200MB. Voice list must match TTS_VOICES in tts.ts.
ENV PIPER_DIR=/opt/piper
RUN set -e; \
  mkdir -p $PIPER_DIR/voices; cd $PIPER_DIR; \
  curl -fsSL -o piper.tgz https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz; \
  tar -xzf piper.tgz && mv piper bin && rm piper.tgz; \
  cd voices; \
  for v in ru/ru_RU/irina/medium/ru_RU-irina-medium \
           ru/ru_RU/denis/medium/ru_RU-denis-medium \
           ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium \
           ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium \
           uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium \
           en/en_US/amy/medium/en_US-amy-medium \
           en/en_US/ryan/medium/en_US-ryan-medium; do \
    n=$(basename $v); \
    curl -fsSL -o $n.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/$v.onnx?download=true"; \
    curl -fsSL -o $n.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/$v.onnx.json?download=true"; \
  done

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
