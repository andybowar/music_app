import { NextResponse } from 'next/server';

import { isDevGalleryEnabled } from '@/lib/devGallery';
import { NOT_CONFIGURED, readSupabaseConfig } from './supabaseConfig';

export const dynamic = 'force-dynamic';

const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

/** JSON for embedding inside a <script>, safe against `</script>` in values. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Swagger UI for the Supabase REST API, with a sign-in box so requests run as a
 * real user (row-level security applies). Dev and preview only.
 */
export function GET() {
  if (!isDevGalleryEnabled()) return new NextResponse('Not found', { status: 404 });

  const supabase = readSupabaseConfig();
  if (!supabase) return new NextResponse(NOT_CONFIGURED, { status: 503 });
  const config = { supabaseUrl: supabase.url, anonKey: supabase.anonKey };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dev · API explorer</title>
<link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css">
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #fff; color: #1b1b1f; }
  .auth { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 16px;
          border-bottom: 1px solid #ddd; background: #f6f6f8; font-size: 14px; }
  .auth input { padding: 6px 8px; border: 1px solid #bbb; border-radius: 6px; font: inherit; min-width: 0; }
  .auth button { padding: 6px 12px; border: 1px solid #555; border-radius: 6px; background: #fff; font: inherit; cursor: pointer; }
  .auth a { color: inherit; }
  #status { flex-basis: 100%; }
  #status.error { color: #b00020; }
  /* Swagger UI doesn't wrap long tag names or paths, which overflows phones. */
  .swagger-ui .wrapper { padding: 0 12px; }
  .swagger-ui .opblock-tag { flex-wrap: wrap; }
  .swagger-ui .opblock-tag a.nostyle, .swagger-ui .opblock-tag small { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
  .swagger-ui .opblock .opblock-summary-path { overflow-wrap: anywhere; }
  .swagger-ui table, .swagger-ui pre { max-width: 100%; overflow-x: auto; }
</style>
</head>
<body>
<form class="auth" id="signin">
  <a href="/dev">← Dev index</a>
  <strong>Run requests as:</strong>
  <input id="email" type="email" placeholder="email" autocomplete="username" aria-label="Email">
  <input id="password" type="password" placeholder="password" autocomplete="current-password" aria-label="Password">
  <button type="submit">Sign in</button>
  <button type="button" id="signout">Use anon</button>
  <span id="status" role="status">Signed out: requests run as <code>anon</code>. Seeded users use the password <code>music-app-dev-password</code>.</span>
</form>
<div id="swagger"></div>
<script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
<script>
(function () {
  var config = ${embed(config)};
  var token = null;
  var status = document.getElementById('status');

  function show(text, isError) {
    status.textContent = text;
    status.className = isError ? 'error' : '';
  }

  document.getElementById('signin').addEventListener('submit', async function (e) {
    e.preventDefault();
    show('Signing in…');
    try {
      var res = await fetch(config.supabaseUrl + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: config.anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        }),
      });
      var body = await res.json();
      if (!res.ok) throw new Error(body.error_description || body.msg || 'Sign-in failed');
      token = body.access_token;
      show('Signed in as ' + body.user.email + ': requests run as this user.');
    } catch (err) {
      token = null;
      show(String(err.message || err), true);
    }
  });

  document.getElementById('signout').addEventListener('click', function () {
    token = null;
    show('Signed out: requests run as anon.');
  });

  SwaggerUIBundle({
    url: '/dev/api/spec',
    dom_id: '#swagger',
    deepLinking: true,
    tryItOutEnabled: true,
    requestInterceptor: function (req) {
      if (req.url.indexOf(config.supabaseUrl) === 0) {
        req.headers.apikey = config.anonKey;
        req.headers.Authorization = 'Bearer ' + (token || config.anonKey);
      }
      return req;
    },
  });
})();
</script>
</body>
</html>`;

  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
