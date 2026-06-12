/**
 * Запуск для локального превью UI: прод-режим раздачи статики + fake-авторизация.
 * PORT приходит от инструмента превью через окружение.
 */
process.env.ALLOW_FAKE_AUTH = '1';
process.env.SERVE_STATIC = '1';

await import('../src/index');
