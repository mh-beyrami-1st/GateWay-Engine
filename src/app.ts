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
app.use('/__p/:b64url', proxyHandler);

app.use(errorHandler);

export default app;