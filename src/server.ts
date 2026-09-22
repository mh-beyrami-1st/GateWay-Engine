import app from './app';
import { envConfig } from './config/env.config';

app.listen(envConfig.port, envConfig.host, () => {
    console.log(`Gateway Engine listening on http://${envConfig.host}:${envConfig.port}`);
});
