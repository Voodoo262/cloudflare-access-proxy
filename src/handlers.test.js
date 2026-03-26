'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, createProxyReqHandler, createProxyResHandler } = require('./handlers');

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------
describe('validateConfig', () => {
    const FULL = {
        TARGET_URL: 'https://example.cloudflareaccess.com',
        CF_ACCESS_CLIENT_ID: 'client-id',
        CF_ACCESS_CLIENT_SECRET: 'client-secret',
    };

    it('returns null when all required variables are present', () => {
        assert.equal(validateConfig(FULL), null);
    });

    it('returns an error message when TARGET_URL is missing', () => {
        const { TARGET_URL: _, ...env } = FULL;
        const msg = validateConfig(env);
        assert.ok(msg, 'expected a non-null error message');
        assert.ok(msg.includes('TARGET_URL'), `message should mention TARGET_URL, got: ${msg}`);
    });

    it('returns an error message when CF_ACCESS_CLIENT_ID is missing', () => {
        const { CF_ACCESS_CLIENT_ID: _, ...env } = FULL;
        const msg = validateConfig(env);
        assert.ok(msg.includes('CF_ACCESS_CLIENT_ID'));
    });

    it('returns an error message when CF_ACCESS_CLIENT_SECRET is missing', () => {
        const { CF_ACCESS_CLIENT_SECRET: _, ...env } = FULL;
        const msg = validateConfig(env);
        assert.ok(msg.includes('CF_ACCESS_CLIENT_SECRET'));
    });

    it('lists all missing variables in a single message', () => {
        const msg = validateConfig({});
        assert.ok(msg.includes('TARGET_URL'));
        assert.ok(msg.includes('CF_ACCESS_CLIENT_ID'));
        assert.ok(msg.includes('CF_ACCESS_CLIENT_SECRET'));
    });
});

// ---------------------------------------------------------------------------
// createProxyReqHandler
// ---------------------------------------------------------------------------
describe('createProxyReqHandler', () => {
    const config = { clientId: 'my-client-id', clientSecret: 'my-client-secret' };

    /** Minimal fake proxyReq that records setHeader calls */
    function makeProxyReq() {
        const headers = {};
        return {
            setHeader(name, value) { headers[name.toLowerCase()] = value; },
            headers,
        };
    }

    it('sets CF-Access service-token headers when no cached token is present', () => {
        const state = { cachedAuthToken: '' };
        const handler = createProxyReqHandler(config, state);
        const proxyReq = makeProxyReq();

        handler(proxyReq);

        assert.equal(proxyReq.headers['cf-access-client-id'], 'my-client-id');
        assert.equal(proxyReq.headers['cf-access-client-secret'], 'my-client-secret');
        assert.equal(proxyReq.headers['cookie'], undefined);
    });

    it('sets the cookie header when a cached token is present', () => {
        const state = { cachedAuthToken: 'CF_Authorization=tok123' };
        const handler = createProxyReqHandler(config, state);
        const proxyReq = makeProxyReq();

        handler(proxyReq);

        assert.equal(proxyReq.headers['cookie'], 'CF_Authorization=tok123');
        assert.equal(proxyReq.headers['cf-access-client-id'], undefined);
        assert.equal(proxyReq.headers['cf-access-client-secret'], undefined);
    });

    it('switches to the cookie header after the cached token is updated', () => {
        const state = { cachedAuthToken: '' };
        const handler = createProxyReqHandler(config, state);

        // First request – no token yet
        const req1 = makeProxyReq();
        handler(req1);
        assert.equal(req1.headers['cf-access-client-id'], 'my-client-id');

        // Token is cached externally (simulating proxyRes updating state)
        state.cachedAuthToken = 'CF_Authorization=newtoken';

        // Second request – token now available
        const req2 = makeProxyReq();
        handler(req2);
        assert.equal(req2.headers['cookie'], 'CF_Authorization=newtoken');
        assert.equal(req2.headers['cf-access-client-id'], undefined);
    });
});

// ---------------------------------------------------------------------------
// createProxyResHandler
// ---------------------------------------------------------------------------
describe('createProxyResHandler', () => {
    /** Minimal fake proxyRes with set-cookie header */
    function makeProxyRes(cookies = []) {
        return { headers: { 'set-cookie': cookies } };
    }

    it('caches the CF_Authorization cookie from a Set-Cookie header', () => {
        const state = { cachedAuthToken: '' };
        const handler = createProxyResHandler(state);

        handler(makeProxyRes(['CF_Authorization=abc123; Path=/; Secure']));

        assert.equal(state.cachedAuthToken, 'CF_Authorization=abc123');
    });

    it('strips attributes after the first semicolon', () => {
        const state = { cachedAuthToken: '' };
        const handler = createProxyResHandler(state);

        handler(makeProxyRes(['CF_Authorization=xyz; HttpOnly; SameSite=Lax']));

        assert.equal(state.cachedAuthToken, 'CF_Authorization=xyz');
    });

    it('does not change the cached token when no CF_Authorization cookie is present', () => {
        const state = { cachedAuthToken: 'CF_Authorization=existing' };
        const handler = createProxyResHandler(state);

        handler(makeProxyRes(['session=abc; Path=/']));

        assert.equal(state.cachedAuthToken, 'CF_Authorization=existing');
    });

    it('handles a missing set-cookie header gracefully', () => {
        const state = { cachedAuthToken: '' };
        const handler = createProxyResHandler(state);

        handler({ headers: {} });

        assert.equal(state.cachedAuthToken, '');
    });

    it('picks the CF_Authorization cookie when multiple cookies are present', () => {
        const state = { cachedAuthToken: '' };
        const handler = createProxyResHandler(state);

        handler(makeProxyRes([
            'session=sess1; Path=/',
            'CF_Authorization=mytoken; Path=/; Secure',
            'other=val',
        ]));

        assert.equal(state.cachedAuthToken, 'CF_Authorization=mytoken');
    });
});

