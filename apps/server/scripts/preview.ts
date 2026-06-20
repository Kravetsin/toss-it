/**
 * Local UI preview: prod static serving + fake auth. PORT comes from the preview tool via env.
 */
process.env.ALLOW_FAKE_AUTH = '1';
process.env.SERVE_STATIC = '1';
// Keep OAuth redirects on this port instead of the default :5173.
process.env.PUBLIC_WEB_URL = `http://localhost:${process.env.PORT ?? 3000}`;

await import('../src/index');
