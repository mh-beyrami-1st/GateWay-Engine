import { Request, Response } from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { envConfig } from '../config/env.config.js';

const proxiedPath = '/__p/';
const systemPrefixes = ['/__p/', '/__engine/', '/__static/'];
const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

const removedHeaders = [
    'content-security-policy',
    'content-security-policy-report-only',
    'x-frame-options',
    'x-content-type-options',
    'cross-origin-resource-policy',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'access-control-allow-origin',
    'attribution-reporting-register-source',
    'attribution-reporting-register-trigger',
    'attribution-reporting-info'
];

// لیست هدرهایی که ورسل اضافه می‌کند و باعث لو رفتن پروکسی می‌شود
const vercelProxyHeaders = [
    'x-forwarded-for', 
    'x-forwarded-host', 
    'x-forwarded-proto',
    'x-vercel-id', 
    'x-vercel-forwarded-for', 
    'x-real-ip', 
    'forwarded', 
    'via'
];

const getTargetUrl = (req: Request): URL | null => {
    const encodedTarget = (req.originalUrl || req.url || '').replace(/^\/__p\//, '');
    try {
        const target = new URL(encodedTarget);
        if (target.protocol === 'http:' || target.protocol === 'https:') return target;
    } catch {}
    
    const referer = req.headers.referer ?? '';
    const match = referer.match(/\/__p\/(https?:\/\/[^/\s?#]+)/i);
    if (!match) return null;
    
    try {
        return new URL(match[1]);
    } catch {
        return null;
    }
};

const getInjectedScript = (currentUrl: string): string => `
<script>
(function () {
    const currentUrl = ${JSON.stringify(currentUrl)};
    const systemPrefixes = ${JSON.stringify(systemPrefixes)};

    function resolveUrl(value) {
        try { return new URL(value, currentUrl).href; } catch { return null; }
    }

    function isIgnored(value) {
        return typeof value !== 'string' || /^(data:|blob:|javascript:|#)/i.test(value);
    }

    function proxify(value) {
        if (isIgnored(value) || systemPrefixes.some((prefix) => value.startsWith(prefix))) return value;
        if (value.startsWith('//')) return '/__p/https:' + value;
        const resolved = resolveUrl(value);
        return resolved ? '/__p/' + resolved : value;
    }

    function navigate(value) {
        const resolved = resolveUrl(value);
        if (resolved) window.parent.postMessage({ type: 'ENGINE_NAV', target: resolved }, '*');
    }

    document.addEventListener('click', function (event) {
        const link = event.target.closest('a');
        if (!link || !link.hasAttribute('href')) return;
        const href = link.getAttribute('href');
        if (isIgnored(href) || href.startsWith('/__p/')) return;
        
        event.preventDefault();
        event.stopImmediatePropagation();
        navigate(href);
    }, true);

    document.addEventListener('submit', function (event) {
        const form = event.target.closest('form');
        if (!form) return;
        
        event.preventDefault();
        event.stopImmediatePropagation();
        
        try {
            const action = new URL(form.getAttribute('action') || '', currentUrl);
            const params = new URLSearchParams(new FormData(form));
            params.forEach((value, key) => action.searchParams.set(key, value));
            navigate(action.href);
        } catch {}
    }, true);

    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        const nextValue = ['src', 'href', 'action', 'poster'].includes(name.toLowerCase())
            ? proxify(value)
            : value;
        return nativeSetAttribute.call(this, name, nextValue);
    };

    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
        const el = originalCreateElement(tagName, options);
        const tag = String(tagName).toLowerCase();
        
        if (['script', 'img', 'iframe', 'link', 'source', 'video', 'audio'].includes(tag)) {
            try {
                let srcVal = '', hrefVal = '';
                Object.defineProperty(el, 'src', {
                    configurable: true,
                    get: function() { return srcVal || this.getAttribute('src') || ''; },
                    set: function(v) { srcVal = proxify(v); nativeSetAttribute.call(this, 'src', srcVal); }
                });
                Object.defineProperty(el, 'href', {
                    configurable: true,
                    get: function() { return hrefVal || this.getAttribute('href') || ''; },
                    set: function(v) { hrefVal = proxify(v); nativeSetAttribute.call(this, 'href', hrefVal); }
                });
            } catch(err) {}
        }
        return el;
    };

    const originalPushState = history.pushState;
    history.pushState = function(state, unused, url) {
        if (url) url = proxify(url.toString());
        return originalPushState.call(this, state, unused, url);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(state, unused, url) {
        if (url) url = proxify(url.toString());
        return originalReplaceState.call(this, state, unused, url);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (typeof url === 'string') {
            url = proxify(url);
        }
        return originalXHROpen.call(this, method, url, ...rest);
    };

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        if (typeof args[0] === 'string') {
            args[0] = proxify(args[0]);
        } else if (args[0] && args[0] instanceof Request) {
            try {
                args[0] = new Request(proxify(args[0].url), args[0]);
            } catch(e) {}
        }
        return originalFetch.apply(this, args);
    };
})();
</script>`;

const rewriteCssUrls = (css: string, targetOrigin: string): string => css.replace(
    /url\(\s*(['"]?)(\/(?!\/\vert{}__p\/\vert{}__engine\/\vert{}__static\/)[^'")]*)\1\s*\)/gi,
    (_, quote: string, path: string) => `url(${quote}${proxiedPath}${targetOrigin}${path}${quote})`
);

const rewriteHtmlPaths = (html: string, targetOrigin: string): string => {
    let result = html
        .replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '')
        .replace(/<meta[^>]+name\s*=\s*["']?referrer["']?[^>]*>/gi, '')
        .replace(/\bping\s*=\s*(["']).*?\1/gi, '');
        
    result = result.replace(
        /(\s(?:src|href|action|poster|data-src)\s*=\s*)(["'])\/(?!\/|__p\/|__engine\/|__static\/)([^"']*)\2/gi,
        `$1$2${proxiedPath}${targetOrigin}/$3$2`
    );
    
    result = result.replace(
        /(\s(?:src|href|action|poster|data-src)\s*=\s*)(["'])\/\/([^"']+)\2/gi,
        `$1$2${proxiedPath}https://$3$2`
    );
    
    result = result.replace(
        /([;,\s]url\s*=\s*["']?)\/(?!\/|__p\/|__engine\/|__static\/)/gi,
        `$1${proxiedPath}${targetOrigin}/`
    );

    return result;
};

const rewriteResponse = (html: string, target: URL): string => {
    const rewritten = rewriteHtmlPaths(html.replace(/integrity=(['"]).*?\1/gi, ''), target.origin);
    const injection = getInjectedScript(target.href);

    if (/<head\b[^>]*>/i.test(rewritten)) return rewritten.replace(/(<head\b[^>]*>)/i, `$1\n${injection}`);
    if (/<html\b[^>]*>/i.test(rewritten)) return rewritten.replace(/(<html\b[^>]*>)/i, `$1\n<head>${injection}</head>`);
    return `${injection}\n${rewritten}`;
};

export const proxyHandler = createProxyMiddleware({
    router: (req: Request) => getTargetUrl(req)?.origin ?? envConfig.defaultEngine,
    changeOrigin: true,
    secure: false,
    selfHandleResponse: true,
    ws: true,
    pathRewrite: (path, req) => {
        const target = getTargetUrl(req);
        return target ? target.pathname + target.search : path;
    },
    on: {
        proxyReq: (proxyReq, req: Request) => {
            const target = getTargetUrl(req);
            if (!target) return;
            
            // خنثی کردن سیستم تشخیص ربات داک‌داک‌گو
            proxyReq.removeHeader('accept-encoding');
            vercelProxyHeaders.forEach(h => proxyReq.removeHeader(h));
            
            proxyReq.setHeader('Referer', `${target.origin}/`);
            proxyReq.setHeader('Origin', target.origin);
            proxyReq.setHeader('Host', target.host);
            proxyReq.setHeader('User-Agent', browserUserAgent);
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: Request, res) => {
            const target = getTargetUrl(req);
            if (!target) return responseBuffer;

            const expressRes = res as Response;
            
            removedHeaders.forEach((header) => expressRes.removeHeader(header));
            expressRes.setHeader('Access-Control-Allow-Origin', '*');

            const status = proxyRes.statusCode ?? 200;
            const location = proxyRes.headers.location;

            if (redirectStatuses.has(status) && location) {
                try {
                    const locStr = String(location);
                    if (!locStr.startsWith('/__p/')) {
                        expressRes.setHeader('location', `${proxiedPath}${new URL(locStr, target.origin).href}`);
                    }
                } catch {}
                return responseBuffer;
            }

            const contentType = String(proxyRes.headers['content-type'] ?? '').toLowerCase();
            const requestUrl = (req.originalUrl || '').toLowerCase();

            if (contentType.includes('text/html')) {
                return Buffer.from(rewriteResponse(responseBuffer.toString('utf8'), target), 'utf8');
            }
            if (contentType.includes('text/css') || requestUrl.endsWith('.css')) {
                return Buffer.from(rewriteCssUrls(responseBuffer.toString('utf8'), target.origin), 'utf8');
            }

            return responseBuffer;
        }),
        error: (_error, _req, res) => {
            const expressRes = res as Response;
            if (!expressRes.headersSent) expressRes.status(502).send(`Gateway Engine: target unreachable. Reason: ${_error.message}`);
        }
    }
});