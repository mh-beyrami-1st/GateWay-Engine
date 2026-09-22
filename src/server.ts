import app from './app';
import { envConfig } from './config/env.config';

app.listen(envConfig.PORT, envConfig.HOST, () => {
    console.log(`[+] Gateway Core Active on http://${envConfig.HOST}:${envConfig.PORT}/`);
});