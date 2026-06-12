# Деплой на Render (бесплатно)

Схема: один Docker-сервис на Render free. БД — в Turso (бесплатно), потому что
у Render free диск стирается при каждом деплое. Чтобы сервис не засыпал —
бесплатный пинг от UptimeRobot.

## Все env-переменные: что это и откуда брать

### Локальная разработка — файл `apps/server/.env`

| Переменная | Откуда взять |
|---|---|
| `TWITCH_CLIENT_ID` | [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → твоё приложение → «Идентификатор клиента» |
| `TWITCH_CLIENT_SECRET` | Там же → кнопка «Новый секрет» |
| `COOKIE_SECRET` | Придумай сам: любая длинная случайная строка (можно сгенерить: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

Больше для локалки ничего не нужно. БД — файл `apps/server/data/app.db`,
создаётся сама. Все остальные переменные имеют дефолты под localhost.

### Прод — вводятся в интерфейсе Render (Environment), НЕ в .env

| Переменная | Откуда взять |
|---|---|
| `TWITCH_CLIENT_ID` | Тот же, что локально (одно и то же Twitch-приложение) |
| `TWITCH_CLIENT_SECRET` | Тот же, что локально |
| `COOKIE_SECRET` | Ничего не делать: render.yaml говорит Render сгенерировать его самому (`generateValue: true`) |
| `TURSO_DATABASE_URL` | Из Turso после создания базы, шаг 2 ниже. Выглядит как `libsql://<имя-базы>-<юзернейм>.turso.io` |
| `TURSO_AUTH_TOKEN` | Там же, кнопка генерации токена, шаг 2 ниже |
| `PUBLIC_WEB_URL` | Адрес твоего сервиса на Render: `https://<имя-сервиса>.onrender.com`. Имя сервиса ты сам выбираешь на шаге 3 — значит URL известен сразу |
| `TWITCH_REDIRECT_URI` | Тот же адрес + путь: `https://<имя-сервиса>.onrender.com/api/auth/callback` |

`NODE_ENV`, `HOST`, `PORT` задаёт Dockerfile — руками не трогать.

## Пошагово

### 1. GitHub
Запушить репозиторий на GitHub (Render деплоит из него).

### 2. Turso — база данных
1. Зарегистрируйся на [turso.tech](https://turso.tech) (можно через GitHub).
2. Create Database → имя например `twitch-widget`, регион ближе к региону Render.
3. На странице базы скопируй **URL** (`libsql://...`) → это `TURSO_DATABASE_URL`.
4. Там же **Create Token** (read & write) → это `TURSO_AUTH_TOKEN`.

### 3. Render — сервис
1. Зарегистрируйся на [render.com](https://render.com), подключи GitHub.
2. New → **Blueprint** → выбери репозиторий. Render прочитает `render.yaml`.
3. Имя сервиса — оно станет частью URL: `https://<имя>.onrender.com`.
4. Заполни запрошенные env-переменные по таблице выше.
5. Deploy. Первая сборка ~5–10 минут (Docker + ffmpeg + pnpm install + build).

### 4. Twitch-консоль — второй redirect
[dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → твоё приложение →
**добавь** OAuth Redirect URL: `https://<имя>.onrender.com/api/auth/callback`
(localhost-овый оставь — он нужен для разработки).

### 5. UptimeRobot — чтобы не засыпал
1. Зарегистрируйся на [uptimerobot.com](https://uptimerobot.com) (free).
2. New Monitor → HTTP(s) → URL: `https://<имя>.onrender.com/api/ping`,
   интервал 5 минут.

## Проверка после деплоя

1. Открой `https://<имя>.onrender.com` → «Войти через Twitch» → настоящий OAuth.
2. Создай канал, скопируй overlay-URL (`https://<имя>.onrender.com/overlay/?token=...`)
   → вставь в OBS как Browser Source.
3. Страница зрителя: `https://<имя>.onrender.com/c/<твой-логин>`.

## Ограничения Render free (знать и не удивляться)

- 512 МБ RAM, слабый CPU — обрезка больших видео медленнее, чем локально.
- Без пинга сервис засыпает через ~15 минут тишины (просыпается ~30–60 с).
- Диск эфемерный: при деплое теряются недопроигранные медиафайлы (но не данные —
  они в Turso). Для нашего эфемерного хранения это приемлемо.
