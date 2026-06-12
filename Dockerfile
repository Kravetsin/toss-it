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
RUN pnpm build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@tmw/server", "start"]
