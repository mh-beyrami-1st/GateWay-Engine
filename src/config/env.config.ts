const port = Number.parseInt(process.env.PORT ?? '3000', 10);

export const envConfig = {
    port: Number.isFinite(port) ? port : 3000,
    host: process.env.HOST ?? 'localhost',
    defaultEngine: process.env.DEFAULT_ENGINE ?? 'https://duckduckgo.com/?q='
} as const;
