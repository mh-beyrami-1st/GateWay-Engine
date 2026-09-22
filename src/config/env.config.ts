export const envConfig = {
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    HOST: process.env.HOST || 'localhost',
    DEFAULT_ENGINE: process.env.DEFAULT_ENGINE || 'https://html.duckduckgo.com/html/?q='
};