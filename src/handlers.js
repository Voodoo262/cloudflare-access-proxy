/**
 * Validates that all required environment variables are present.
 * @param {object} env - An object with the env vars to check (defaults to process.env).
 * @returns {string|null} An error message if validation fails, or null if all good.
 */
function validateConfig(env = process.env) {
    const missing = ['TARGET_URL', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'].filter(k => !env[k]);
    if (missing.length > 0) {
        return `Missing required environment variables: ${missing.join(', ')}`;
    }
    return null;
}

/**
 * Creates the proxy request handler that injects Cloudflare Access credentials.
 * Uses a cached CF_Authorization cookie when available, falling back to service token headers.
 * @param {{ clientId: string, clientSecret: string }} config
 * @param {{ cachedAuthToken: string }} state - Shared mutable state for the cached token.
 * @returns {Function} Handler suitable for http-proxy's 'proxyReq' event.
 */
function createProxyReqHandler(config, state) {
    return function onProxyReq(proxyReq) {
        if (state.cachedAuthToken) {
            proxyReq.setHeader('cookie', state.cachedAuthToken);
        } else {
            proxyReq.setHeader('CF-Access-Client-Id', config.clientId);
            proxyReq.setHeader('CF-Access-Client-Secret', config.clientSecret);
        }
    };
}

/**
 * Creates the proxy response handler that caches the CF_Authorization cookie.
 * @param {{ cachedAuthToken: string }} state - Shared mutable state for the cached token.
 * @returns {Function} Handler suitable for http-proxy's 'proxyRes' event.
 */
function createProxyResHandler(state) {
    return function onProxyRes(proxyRes) {
        const cookies = proxyRes.headers['set-cookie'] || [];
        const cfAuthCookie = cookies.find(c => c.startsWith('CF_Authorization='));
        if (cfAuthCookie) {
            state.cachedAuthToken = cfAuthCookie.split(';')[0];
        }
    };
}

module.exports = { validateConfig, createProxyReqHandler, createProxyResHandler };

