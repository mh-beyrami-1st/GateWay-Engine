import express from 'express';
import path from 'path';
import viewRoutes from './routes/view.routes';
import engineRoutes from './routes/engine.routes';
import { proxyHandler } from './proxy/proxy.handler';
import { errorHandler } from './middlewares/error.middleware';
import { envConfig } from './config/env.config';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

app.use('/__static', express.static(path.join(process.cwd(), 'public')));

app.use('/__p', proxyHandler);

// تور نجات (Escape Catcher): گرفتن درخواست‌های فراری از پروکسی
app.use((req, res, next) => {
    const referer = req.headers.referer || '';
    let targetOrigin = '';
    
    // ۱. شناسایی مبدا از طریق رفرر (اگر موجود بود)
    if (referer.includes('/__p/')) {
        const match = referer.match(/\/__p\/(https?:\/\/[^\/\s?#]+)/);
        if (match) targetOrigin = match[1];
    }
    
    // ۲. شناسایی از طریق پارامترهای سرچ (وقتی رفرر توسط داک‌داک‌گو پاک شده است)
    if (!targetOrigin && req.path === '/' && req.query.q) {
        targetOrigin = new URL(envConfig.DEFAULT_ENGINE).origin;
    }

    // اگر درخواست گم شده بود و متعلق به فایل‌های سیستمی ما نبود، به پروکسی برگردان
    const isSystemRoute = req.path.startsWith('/__engine') || req.path.startsWith('/__newtab');
    if (targetOrigin && !isSystemRoute && !req.originalUrl.startsWith('/__p/')) {
        // وضعیت 307 متدهای POST را حفظ می‌کند تا ریدایرکت‌های فیلتر نشکنند
        return res.redirect(307, `/__p/${targetOrigin}${req.originalUrl}`);
    }

    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/', viewRoutes);
app.use('/__engine', engineRoutes);

app.use(errorHandler);

export default app;