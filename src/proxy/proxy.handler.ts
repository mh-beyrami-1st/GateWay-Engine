import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { Request, Response } from 'express';
import { envConfig } from '../config/env.config';

const getTargetUrl = (req: Request): URL | null => {
    const pathWithoutPrefix = req.originalUrl.replace(/^\/__p\//, '');
    try {
        return new URL(pathWithoutPrefix);
    } catch {
        return null;
    }
};

const getInjectJS = (currentUrl: string) => `
<script>
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
        if (url && /^https?:/i.test(url)) {
            if (typeof input === 'string') {
                input = '/__p/' + url;
            } else {
                input = new Request('/__p/' + url, input);
            }
        }
        return originalFetch.apply(this, arguments);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && /^https?:/i.test(url)) {
            url = '/__p/' + url;
        }
        return originalOpen.call(this, method, url, ...rest);
    };

    document.addEventListener('click', function(e) {
        let a = e.target.closest('a');
        if (a && a.hasAttribute('href')) {
            let href = a.getAttribute('href');
            if (href.startsWith('javascript:') || href.startsWith('#')) return;
            e.preventDefault();
            try {
                let finalUrl = new URL(href, '${currentUrl}').href;
                window.parent.postMessage({ type: 'ENGINE_NAV', target: finalUrl }, '*');
            } catch(err) {}
        }
    }, true);

    document.addEventListener('submit', function(e) {
        let form = e.target.closest('form');
        if (form && (!form.method || form.method.toUpperCase() === 'GET')) {
            e.preventDefault();
            let action = form.getAttribute('action') || '';
            try {
                let url = new URL(action, '${currentUrl}');
                let params = new URLSearchParams(new FormData(form));
                url.search = params.toString();
                window.parent.postMessage({ type: 'ENGINE_NAV', target: url.href }, '*');
            } catch(err) {}
        }
    }, true);
})();
</script>
`;

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
            
            proxyReq.setHeader('accept-encoding', 'identity');
            proxyReq.setHeader('Referer', target.origin + '/');
            proxyReq.setHeader('Origin', target.origin);
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
                'cross-origin-embedder-policy'
            ];
            toxicHeaders.forEach(header => expressRes.removeHeader(header));

            const status = proxyRes.statusCode || 200;

            if ([301, 302, 303, 307, 308].includes(status) && proxyRes.headers['location']) {
                let nextUrl = new URL(proxyRes.headers['location'], target.origin);
                expressRes.setHeader('location', `/__p/${nextUrl.href}`);
                return responseBuffer;
            }

            const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
            if (contentType.includes('text/html')) {
                let html = responseBuffer.toString('utf8');
                html = html.replace(/integrity=(['"]).*?\1/gi, '');
                
                const baseHref = `/__p/${target.origin}${target.pathname}`;
                const baseTag = `<base href="${baseHref}">`;
                const injectCode = `${baseTag}${getInjectJS(target.href)}`;
                
                if (/<head>/i.test(html)) {
                    html = html.replace(/<head>/i, `<head>${injectCode}`);
                } else {
                    html = injectCode + html;
                }
                
                return Buffer.from(html, 'utf8');
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