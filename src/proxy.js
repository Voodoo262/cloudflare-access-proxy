const http = require('http');
const httpProxy = require('http-proxy');

let CF_ACCESS_CLIENT_ID;
let CF_ACCESS_CLIENT_SECRET;
let TARGET_URL;
let LISTEN_PORT;

// Step 1: Detect environment
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

if (isGitHubActions) {
    // Use @actions/core for GitHub Actions input
    const core = require('@actions/core');
    CF_ACCESS_CLIENT_ID = core.getInput('cf-access-client-id');
    CF_ACCESS_CLIENT_SECRET = core.getInput('cf-access-client-secret');
    TARGET_URL = core.getInput('target-url');
    LISTEN_PORT = core.getInput('listen-port');
} else {
    // Use dotenv for local development
    require('dotenv').config();
    CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
    CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
    TARGET_URL = process.env.TARGET_URL;
    LISTEN_PORT = process.env.LISTEN_PORT;
}
LISTEN_PORT = LISTEN_PORT || 8080;

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
