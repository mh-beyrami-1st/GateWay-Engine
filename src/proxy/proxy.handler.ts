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
    const _url = '${currentUrl}';
    document.addEventListener('click', function(e) {
        let a = e.target.closest('a');
        if (a && a.hasAttribute('href')) {
            let href = a.getAttribute('href');
            if (href.startsWith('javascript:') || href.startsWith('#')) return;
            e.preventDefault();
            try {
                let finalUrl = new URL(href, _url).href;
                window.parent.postMessage({ type: 'ENGINE_NAV', target: finalUrl }, '*');
            } catch(err) {}
        }
    }, true);

    document.addEventListener('submit', function(e) {
        let form = e.target.closest('form');
        if (form) {
            e.preventDefault();
            try {
                let action = form.getAttribute('action') || _url;
                let url = new URL(action, _url);
                let formData = new FormData(form);
                let params = new URLSearchParams(formData);
                
                if (form.method && form.method.toUpperCase() === 'POST') {
                    window.parent.postMessage({ type: 'ENGINE_NAV', target: url.href + (url.search ? '&' : '?') + params.toString() }, '*');
                } else {
                    url.search = params.toString();
                    window.parent.postMessage({ type: 'ENGINE_NAV', target: url.href }, '*');
                }
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
            
            proxyReq.removeHeader('accept-encoding');
            proxyReq.setHeader('Referer', target.origin + '/');
            proxyReq.setHeader('Origin', target.origin);
            proxyReq.setHeader('Host', target.host);
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
                'access-control-allow-origin'
            ];
            toxicHeaders.forEach(header => expressRes.removeHeader(header));
            expressRes.setHeader('Access-Control-Allow-Origin', '*');

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
                
                html = html.replace(/(href|src)=["']\/\//gi, '$1="/__p/https://');

                const injectCode = getInjectJS(target.href);
                
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