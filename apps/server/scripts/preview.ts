/**
 * Запуск для локального превью UI: прод-режим раздачи статики + fake-авторизация.
 * PORT приходит от инструмента превью через окружение.
 */
process.env.ALLOW_FAKE_AUTH = '1';
process.env.SERVE_STATIC = '1';
// Чтобы OAuth-редиректы оставались на этом же порту, а не на дефолтном :5173.
process.env.PUBLIC_WEB_URL = `http://localhost:${process.env.PORT ?? 3000}`;

await import('../src/index');
