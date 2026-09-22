import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { Request, Response } from 'express';
import { envConfig } from '../config/env.config';

const getTargetUrl = (req: Request): URL | null => {
    const fromUrl = (req.originalUrl || req.url || '').replace(/^\/__p\//, '');
    try {
        const u = new URL(fromUrl);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u;
    } catch {}
    const referer = req.headers.referer || '';
    const m = referer.match(/\/__p\/(https?:\/\/[^\/\s?#]+)/);
    if (m) {
        try {
            return new URL(m[1] + req.originalUrl);
        } catch {}
    }
    return null;
};

const getInjectJS = (currentUrl: string) => `
<script>
(function() {
    const currentUrl = ${JSON.stringify(currentUrl)};
    
    function resolveUrl(url) {
        try { return new URL(url, currentUrl).href; } catch(err) { return null; }
    }
    
    function proxify(url) {
        if (typeof url !== 'string') return url;
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:')) return url;
        if (url.startsWith('/__p/') || url.startsWith('/__engine/') || url.startsWith('/__static/')) return url;
        
        if (url.startsWith('//')) {
            return '/__p/https:' + url;
        }
        
        try {
            let resolved = new URL(url, currentUrl).href;
            return '/__p/' + resolved;
        } catch(e) {
            return url;
        }
    }
    
    function sendNav(url) {
        if (typeof url !== 'string') return;
        if (url.startsWith('/__p/')) return;
        const finalUrl = resolveUrl(url);
        if (finalUrl) {
            window.parent.postMessage({ type: 'ENGINE_NAV', target: finalUrl }, '*');
        }
    }
    
    document.addEventListener('click', function(e) {
        let a = e.target.closest('a');
        if (a) {
            a.removeAttribute('target');
            if (a.hasAttribute('href')) {
                let href = a.getAttribute('href');
                if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;
                if (href.startsWith('/__p/')) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                sendNav(href);
            }
        }
    }, true);

    document.addEventListener('submit', function(e) {
        let form = e.target.closest('form');
        if (form) {
            form.removeAttribute('target');
            e.preventDefault();
            e.stopImmediatePropagation();
            try {
                let action = form.getAttribute('action') || '';
                let url = new URL(action, currentUrl);
                let formData = new FormData(form);
                let params = new URLSearchParams(formData);
                
                if (form.method && form.method.toUpperCase() === 'POST') {
                    const queryObj = Object.fromEntries(params.entries());
                    const nextUrl = url.href + (url.search ? '&' : '?') + new URLSearchParams(queryObj).toString();
                    sendNav(nextUrl);
                } else {
                    params.forEach((value, key) => {
                        url.searchParams.set(key, value);
                    });
                    sendNav(url.href);
                }
            } catch(err) {}
        }
    }, true);

    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if ((name === 'src' || name === 'href') && typeof value === 'string') {
            value = proxify(value);
        }
        return originalSetAttribute.call(this, name, value);
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
                    set: function(v) { srcVal = proxify(v); originalSetAttribute.call(this, 'src', srcVal); }
                });
                Object.defineProperty(el, 'href', {
                    configurable: true,
                    get: function() { return hrefVal || this.getAttribute('href') || ''; },
                    set: function(v) { hrefVal = proxify(v); originalSetAttribute.call(this, 'href', hrefVal); }
                });
            } catch(err) {}
        }
        return el;
    };
})();
</script>
`;

const rewriteCssUrls = (css: string, targetOrigin: string): string => {
    return css.replace(
        /url\(\s*(['"]?)(\/(?!\/\vert{}__p\/\vert{}__engine\/\vert{}__static\/)[^'")]*)\1\s*\)/gi,
        (match, quote, p) => `url(${quote}/__p/${targetOrigin}${p}${quote})`
    );
};

const rewriteHtmlPaths = (html: string, targetOrigin: string): string => {
    let replaced = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
    replaced = replaced.replace(/<meta[^>]+name\s*=\s*["']?referrer["']?[^>]*>/gi, '');
    replaced = replaced.replace(/\bping\s*=\s*(["']).*?\1/gi, '');

    replaced = replaced.replace(
        /(\s(?:src|href|action|poster|data-src|srcset)\s*=\s*)(["'])\/(?!\/|__p\/|__engine\/|__static\/)([^"']*)\2/gi,
        '$1$2/__p/' + targetOrigin + '/$3$2'
    );
    replaced = replaced.replace(
        /(\s(?:src|href|action|poster|data-src|srcset)\s*=\s*)(["'])\/\/([^"']+)\2/gi,
        '$1$2/__p/https://$3$2'
    );
    
    // شناسایی منعطف تمام Meta Refresh ها و URL های جاوااسکریپتی که به روت (/) اشاره می‌کنند
    replaced = replaced.replace(
        /([;,\s]url\s*=\s*['"]?)\/(?!\/|__p\/|__engine\/|__static\/)/gi,
        '$1/__p/' + targetOrigin + '/'
    );
    replaced = replaced.replace(
        /(window\.location(?:\.href|\.replace)?\s*(?:=|[(])\s*["'])\/(?!\/|__p\/|__engine\/|__static\/)/gi,
        '$1/__p/' + targetOrigin + '/'
    );
    replaced = replaced.replace(
        /([^a-zA-Z0-9_])(location(?:\.href|\.replace)?\s*(?:=|[(])\s*["'])\/(?!\/|__p\/|__engine\/|__static\/)/gi,
        '$1$2/__p/' + targetOrigin + '/'
    );

    return replaced;
};

export const proxyHandler = createProxyMiddleware({
    router: (req: Request) => {
        const target = getTargetUrl(req);
        return target ? target.origin : envConfig.DEFAULT_ENGINE;
    },
    changeOrigin: true,
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
            
            proxyReq.removeHeader('accept-encoding');
            proxyReq.setHeader('Referer', target.origin + '/');
            proxyReq.setHeader('Origin', target.origin);
            proxyReq.setHeader('Host', target.host);
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: Request, res) => {
            const expressRes = res as Response;
            const target = getTargetUrl(req);
            if (!target) return responseBuffer;

            const toxicHeaders = [
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
            toxicHeaders.forEach(h => expressRes.removeHeader(h));
            expressRes.setHeader('Access-Control-Allow-Origin', '*');

            const status = proxyRes.statusCode || 200;

            if ([301, 302, 303, 307, 308].includes(status) && proxyRes.headers['location']) {
                const loc = String(proxyRes.headers['location']);
                if (!loc.startsWith('/__p/')) {
                    try {
                        const next = new URL(loc, target.origin);
                        expressRes.setHeader('location', `/__p/${next.href}`);
                    } catch {}
                }
                return responseBuffer;
            }

            const ct = String(proxyRes.headers['content-type'] || '').toLowerCase();
            const urlLower = (req.originalUrl || '').toLowerCase();

            if (ct.includes('text/html')) {
                let html = responseBuffer.toString('utf8');
                html = html.replace(/integrity=(['"]).*?\1/gi, '');
                html = rewriteHtmlPaths(html, target.origin);
                
                const inject = getInjectJS(target.href);
                
                if (/<head\b[^>]*>/i.test(html)) {
                    html = html.replace(/(<head\b[^>]*>)/i, `$1\n${inject}`);
                } else if (/<html\b[^>]*>/i.test(html)) {
                    html = html.replace(/(<html\b[^>]*>)/i, `$1\n<head>${inject}</head>`);
                } else if (/<!doctype\b[^>]*>/i.test(html)) {
                    html = html.replace(/(<!doctype\b[^>]*>)/i, `$1\n${inject}`);
                } else {
                    html = inject + html;
                }

                return Buffer.from(html, 'utf8');
            }

            if (ct.includes('text/css') || urlLower.endsWith('.css')) {
                let css = responseBuffer.toString('utf8');
                css = rewriteCssUrls(css, target.origin);
                return Buffer.from(css, 'utf8');
            }

            return responseBuffer;
        }),
        error: (err, req, res) => {
            const expressRes = res as Response;
            if (!expressRes.headersSent) {
                expressRes.status(502).send('Gateway Core Error: Target unreachable.');
            }
        }
    }
});