export const envConfig = {
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    HOST: process.env.HOST || 'localhost',
    DEFAULT_ENGINE: process.env.DEFAULT_ENGINE || 'https://duckduckgo.com/?q=',
    USER_AGENT: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    SPOOF_UA: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.179 Mobile Safari/537.36',
    SPOOF_IP: '66.249.66.1',
    BLACKLIST_DOMAINS: ['duckduckgo.com', 'wikipedia.org']
};