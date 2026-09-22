import express from 'express';
import path from 'path';
import viewRoutes from './routes/view.routes';
import engineRoutes from './routes/engine.routes';
import { proxyHandler } from './proxy/proxy.handler';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

app.use(express.json());
app.use('/__static', express.static(path.join(process.cwd(), 'public')));

app.use('/', viewRoutes);
app.use('/__engine', engineRoutes);

app.use('/__p', proxyHandler);

app.use((req, res, next) => {
    const referer = req.headers.referer;
    if (referer && referer.includes('/__p/')) {
        const targetMatch = referer.match(/\/__p\/(https?:\/\/[^\/]+)/);
        if (targetMatch) {
            return res.redirect(`/__p/${targetMatch[1]}${req.originalUrl}`);
        }
    }
    next();
});

app.use(errorHandler);

export default app;