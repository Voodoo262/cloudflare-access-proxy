require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const { validateConfig, createProxyReqHandler, createProxyResHandler } = require('./handlers');

const TARGET_URL = process.env.TARGET_URL;
const CF_ACCESS_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET;
const LISTEN_PORT = process.env.LISTEN_PORT || 8080;

const configError = validateConfig();
if (configError) {
    console.error(configError);
    process.exit(1);
}

const proxy = httpProxy.createProxyServer({
    target: TARGET_URL,
    changeOrigin: true,
    secure: true,
});

const state = { cachedAuthToken: '' };
proxy.on('proxyReq', createProxyReqHandler({ clientId: CF_ACCESS_CLIENT_ID, clientSecret: CF_ACCESS_CLIENT_SECRET }, state));
proxy.on('proxyRes', createProxyResHandler(state));

http.createServer((req, res) => {
    proxy.web(req, res);
}).listen(LISTEN_PORT, () => {
    console.log(`Cloudflare Access proxy listening on http://localhost:${LISTEN_PORT}`);
});
