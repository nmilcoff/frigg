require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('42matters API Tests', () => {
    /* eslint-disable camelcase */
    const apiParams = {
        access_token: process.env.MATTERS_ACCESS_TOKEN,
    };
    /* eslint-enable camelcase */

    const api = new Api(apiParams);

    //Disabling auth flow for speed (access tokens expire after ten years)
    describe('Test Auth', () => {
        it('Should retrieve account status', async () => {
            const status = await api.getAccountStatus();
            expect(status.status).toBe('OK');
        });
    });

    describe('API requests', () => {
        describe('People requests', () => {
            it('Should retrieve an android app', async () => {
                const appData = await api.getGoogleAppData('com.facebook.katana');
                expect(appData).toBeDefined();
                expect(appData.title).toBe('Facebook');
            });
            it('Should retrieve an android app', async () => {
                const appData = await api.searchGoogleApps('Facebook');
                expect(appData).toBeDefined();
                expect(appData.results).toHaveProperty('length');
                expect(appData.results[0].title).toBe('Facebook');
            });
            it('Should retrieve an apple app', async () => {
                const appData = await api.getAppleAppData('284882215');
                expect(appData).toBeDefined();
                expect(appData.trackCensoredName).toBe('Facebook');
            });
            it('Should retrieve an apple app', async () => {
                const appData = await api.searchAppleApps('Facebook');
                expect(appData).toBeDefined();
                expect(appData.results).toHaveProperty('length');
                expect(appData.results[0].trackCensoredName).toBe('Facebook');
            })
        });
    });
});