import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { Request, Response } from 'express';
import { decodeTargetUrl } from '../utils/url.parser';
import { envConfig } from '../config/env.config';

const INJECT_JS = `
<script>
document.addEventListener('click', function(e) {
    let a = e.target.closest('a');
    if (a && a.href && !a.href.startsWith('javascript:')) {
        e.preventDefault();
        window.parent.postMessage({ type: 'ENGINE_NAV', target: a.href }, '*');
    }
}, true);
</script>
`;

export const proxyHandler = createProxyMiddleware({
    router: (req: Request) => {
        const decoded = decodeTargetUrl(req.params.b64url);
        return decoded ? new URL(decoded).origin : envConfig.DEFAULT_ENGINE;
    },
    changeOrigin: true,
    selfHandleResponse: true,
    ws: true,
    pathRewrite: (path, req) => {
        const b64 = req.params?.b64url;
        if (!b64) return path;
        
        const decoded = decodeTargetUrl(b64);
        if (!decoded) return path;
        
        const targetUrl = new URL(decoded);
        const originalPath = path.replace(`/__p/${b64}`, '');
        return originalPath === '' ? targetUrl.pathname + targetUrl.search : originalPath;
    },
    on: {
        proxyReq: (proxyReq, req: Request) => {
            const b64 = req.params?.b64url;
            if (!b64) return;
            
            const decodedUrl = new URL(decodeTargetUrl(b64) || envConfig.DEFAULT_ENGINE);
            const domain = decodedUrl.hostname.toLowerCase();
            const isBlacklisted = envConfig.BLACKLIST_DOMAINS.some(bd => domain.includes(bd));
            
            proxyReq.removeHeader('accept-encoding');

            if (isBlacklisted) {
                proxyReq.setHeader('User-Agent', envConfig.USER_AGENT);
            } else {
                proxyReq.setHeader('User-Agent', envConfig.SPOOF_UA);
                proxyReq.setHeader('X-Forwarded-For', envConfig.SPOOF_IP);
                proxyReq.setHeader('Referer', decodedUrl.origin + '/');
            }
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: Request, res) => {
            const expressRes = res as Response;
            const b64 = req.params?.b64url;
            if (!b64) return responseBuffer;

            const toxicHeaders = [
                'content-security-policy', 'content-security-policy-report-only',
                'x-frame-options', 'x-content-type-options',
                'cross-origin-resource-policy', 'cross-origin-embedder-policy'
            ];
            toxicHeaders.forEach(header => expressRes.removeHeader(header));

            const status = proxyRes.statusCode || 200;
            const currentOrigin = new URL(decodeTargetUrl(b64) || envConfig.DEFAULT_ENGINE).origin;

            if ([301, 302, 303, 307, 308].includes(status) && proxyRes.headers['location']) {
                let nextUrl = new URL(proxyRes.headers['location'], currentOrigin);
                const nextB64 = Buffer.from(nextUrl.href).toString('base64');
                expressRes.setHeader('location', `/__p/${nextB64}`);
                return responseBuffer;
            }

            const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
            if (contentType.includes('text/html')) {
                let html = responseBuffer.toString('utf8');
                html = html.replace(/integrity=(['"]).*?\1/gi, '');
                const baseTag = `<base href="/__p/${b64}/">`;
                html = html.replace(/<head>/i, `<head>${baseTag}${INJECT_JS}`);
                return Buffer.from(html, 'utf8');
            }

            return responseBuffer;
        }),
        error: (err, req, res) => {
            const expressRes = res as Response;
            if (!expressRes.headersSent) {
                expressRes.status(502).send(`Gateway Core Error: Target unreachable.`);
            }
        }
    }
});