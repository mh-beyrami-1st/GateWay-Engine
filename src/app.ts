import express from 'express';
import path from 'path';
import viewRoutes from './routes/view.routes.js';
import engineRoutes from './routes/engine.routes.js';
import { proxyHandler } from './proxy/proxy.handler.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { envConfig } from './config/env.config.js';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

app.use('/__static', express.static(path.join(process.cwd(), 'public')));

app.use('/__p', proxyHandler);

app.use((req, res, next) => {
    const referer = req.headers.referer || '';
    let targetOrigin = '';
    
    if (referer.includes('/__p/')) {
        const match = referer.match(/\/__p\/(https?:\/\/[^\/\s?#]+)/);
        if (match) targetOrigin = match[1];
    }
    
    if (!targetOrigin && req.path === '/' && req.query.q) {
        targetOrigin = new URL(envConfig.defaultEngine).origin;
    }

    const isSystemRoute = req.path.startsWith('/__engine') || req.path.startsWith('/__newtab');
    if (targetOrigin && !isSystemRoute && !req.originalUrl.startsWith('/__p/')) {
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