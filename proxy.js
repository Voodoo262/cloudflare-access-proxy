require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');

// Check for proper configuration of environment variables
const TARGET_URL = process.env.TARGET_URL;
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const LISTEN_PORT = process.env.LISTEN_PORT ?? 8080;

if (!TARGET_URL || !CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const proxy = httpProxy.createProxyServer({
    target: TARGET_URL,
    changeOrigin: true,
    secure: true,
});

let cachedAuthToken = '';
proxy.on('proxyReq', (proxyReq, req, res, options) => {
    if (cachedAuthToken) {
        proxyReq.setHeader('cookie', cachedAuthToken);
    } else {
        proxyReq.setHeader('CF-Access-Client-Id', CF_ACCESS_CLIENT_ID);
        proxyReq.setHeader('CF-Access-Client-Secret', CF_ACCESS_CLIENT_SECRET);
    }
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    const cookies = proxyRes.headers['set-cookie'] || [];
    const cfAuthCookie = cookies.find(c => c.startsWith('CF_Authorization='));
    if (cfAuthCookie) {
        cachedAuthToken = cfAuthCookie.split(';')[0];
    }
});

http.createServer((req, res) => {
    proxy.web(req, res);
}).listen(LISTEN_PORT, () => {
    console.log(`Cloudflare Access proxy listening on http://localhost:${LISTEN_PORT}`);
});
