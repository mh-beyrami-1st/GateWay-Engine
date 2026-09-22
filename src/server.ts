import app from './app.js';
import { envConfig } from './config/env.config.js';

if (process.env.NODE_ENV !== 'production') {
    app.listen(envConfig.port, envConfig.host, () => {
        console.log(`Gateway Engine listening on http://${envConfig.host}:${envConfig.port}`);
    });
}

export default app;