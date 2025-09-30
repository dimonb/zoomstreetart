// Minimal first-party proxy for GA4:
//  - /gtag/js → www.googletagmanager.com/gtag/js
//  - /(g|j|r)/collect → region1.google-analytics.com/<path>
//  - /mp/collect → www.google-analytics.com/mp/collect  (Measurement Protocol pass-through)
//  - Ставит HttpOnly first-party cookie (FPID) если нет, и пробрасывает IP/UA

// 2 года
const TWO_YEARS = 60 * 60 * 24 * 730;

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      // Resolve env-based config safely (no top-level globals)
      const allowedOrigins = Array.isArray(env.ALLOW_ORIGINS)
        ? env.ALLOW_ORIGINS
        : (typeof env.ALLOW_ORIGINS === 'string' && env.ALLOW_ORIGINS.length
            ? env.ALLOW_ORIGINS.split(',').map(s => s.trim())
            : []);
      const cookieName = env.FPID_COOKIE || 'fpid';
      const cookieDomain = env.COOKIE_DOMAIN || undefined;

      // CORS (узкий allow-list)
      const origin = req.headers.get('Origin');
      const allow = origin && allowedOrigins.includes(origin) ? origin : null;
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(allow, req),
        });
      }

      // 1) Проксируем gtag.js
      if (path === '/gtag/js') {
        const upstream = 'https://www.googletagmanager.com/gtag/js' + (url.search || '');
        const res = await fetch(upstream, {
          headers: forwardHeaders(req, true),
          cf: { cacheTtl: 3600, cacheEverything: true }, // кэшируем скрипт на edge
        });

        // Добавим строгие заголовки
        const h = new Headers(res.headers);
        setSecurityHeaders(h);
        if (allow) setCorsHeaders(h, allow);

        return new Response(res.body, { status: res.status, headers: h });
      }

      // 2) Проксируем GA4 browser hits: /g/collect, /j/collect, /r/collect
      const m = path.match(/^\/([gjr])\/collect$/);
      if (m) {
        // region1 предпочтительнее для GDPR/latency
        const base = (env.FORCE_REGION1 ? 'https://region1.google-analytics.com' : 'https://www.google-analytics.com');
        const upstream = base + path + (url.search || '');

        // Выставим/прочитаем FPID (первосторонний идентификатор)
        const cookies = parseCookie(req.headers.get('Cookie') || '');
        let fpid = cookies[cookieName];
        let setCookieHeader = null;

        if (!fpid) {
          fpid = cryptoRandomHex(16); // 128-bit
          setCookieHeader = buildSetCookie(cookieName, fpid, {
            domain: cookieDomain,
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            maxAge: TWO_YEARS,
          });
        }

        // Пробрасываем реальный IP/UA для атрибуции
        const h = forwardHeaders(req, false);
        // У Google работают X-Forwarded-For/UA — не гарантируется, но полезно
        h.set('X-Forwarded-For', req.headers.get('CF-Connecting-IP') || '');
        h.set('User-Agent', req.headers.get('User-Agent') || '');
        h.set('Referer', req.headers.get('Referer') || '');

        // Не ломаем query — просто прокидываем как есть
        const res = await fetch(upstream, { method: 'POST', body: await req.text(), headers: h });

        // Ответ
        const outHeaders = new Headers(res.headers);
        setSecurityHeaders(outHeaders);
        if (allow) setCorsHeaders(outHeaders, allow);
        if (setCookieHeader) outHeaders.append('Set-Cookie', setCookieHeader);

        return new Response(res.body, { status: res.status, headers: outHeaders });
      }

      // 3) Measurement Protocol proxy: /mp/collect → GA4 MP endpoint
      if (path === '/mp/collect') {
        const upstream = 'https://www.google-analytics.com/mp/collect' + (url.search || '');
        const h = forwardHeaders(req, false);
        h.set('User-Agent', req.headers.get('User-Agent') || '');
        h.set('X-Forwarded-For', req.headers.get('CF-Connecting-IP') || '');

        const res = await fetch(upstream, { method: req.method, body: req.body, headers: h });
        const outHeaders = new Headers(res.headers);
        setSecurityHeaders(outHeaders);
        if (allow) setCorsHeaders(outHeaders, allow);
        return new Response(res.body, { status: res.status, headers: outHeaders });
      }

      // 404 для всего прочего
      return new Response('Not found', { status: 404, headers: basicHeaders(allow) });
    } catch (e) {
      return new Response('proxy error', { status: 502 });
    }
  }
};

function forwardHeaders(req, stripCache) {
  const h = new Headers(req.headers);
  // чистим hop-by-hop/кэш/accept-encoding (Cloudflare сам сделает brotli)
  ['host','content-length','cf-connecting-ip','x-forwarded-proto','accept-encoding'].forEach(k => h.delete(k));
  if (stripCache) {
    ['if-none-match','if-modified-since','cache-control'].forEach(k => h.delete(k));
  }
  return h;
}

function setSecurityHeaders(h) {
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Caching только для js
  const ct = h.get('content-type') || '';
  if (ct.includes('javascript')) {
    h.set('Cache-Control', 'public, max-age=3600, s-maxage=3600, immutable');
  } else {
    h.set('Cache-Control', 'no-store');
  }
}

function corsHeaders(origin, req) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': req?.headers?.get('Access-Control-Request-Headers') || '*',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function setCorsHeaders(h, origin) {
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Vary', 'Origin');
}
function basicHeaders(origin) {
  const h = new Headers();
  if (origin) setCorsHeaders(h, origin);
  setSecurityHeaders(h);
  return h;
}

function parseCookie(s) {
  return Object.fromEntries(s.split(/;\s*/).filter(Boolean).map(kv => {
    const i = kv.indexOf('=');
    return i < 0 ? [kv, ''] : [decodeURIComponent(kv.slice(0,i)), decodeURIComponent(kv.slice(i+1))];
  }));
}
function buildSetCookie(name, value, opts = {}) {
  const p = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${opts.path || '/'}`,
    opts.domain ? `Domain=${opts.domain}` : null,
    opts.maxAge ? `Max-Age=${opts.maxAge}` : null,
    opts.httpOnly ? 'HttpOnly' : null,
    opts.secure ? 'Secure' : null,
    `SameSite=${opts.sameSite || 'Lax'}`
  ].filter(Boolean);
  return p.join('; ');
}
function cryptoRandomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2,'0')).join('');
}