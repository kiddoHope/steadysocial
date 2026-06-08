import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const FACEBOOK_GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const FACEBOOK_OAUTH_STATE_FILE = 'facebook_oauth_states.jsonl';
const FACEBOOK_OAUTH_SCOPES = [
    'pages_show_list',
    'pages_manage_metadata',
    'pages_messaging',
    'pages_read_engagement',
];

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

let DATA_DIR;
try {
    const { app: electronApp } = await import('electron');
    DATA_DIR = path.join(electronApp.getPath('userData'), 'data');
} catch (e) {
    // When running the backend outside Electron, resolve the workspace data folder from the server file location.
    DATA_DIR = path.join(__dirname, '..', 'data');
}

// Ensure the data folder exists when the server starts.
try {
    await fs.mkdir(DATA_DIR, { recursive: true });
} catch (e) {
    console.warn('Unable to ensure data directory exists:', e);
}

// Helper to read JSONL
async function readJsonl(filename) {
    const filePath = path.join(DATA_DIR, filename);

    try {
        const content = await fs.readFile(filePath, 'utf-8');

        if (!content.trim()) {
            return [];
        }

        return content
            .trim()
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

// Helper to write JSONL
async function writeJsonl(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    const content = data.map(item => JSON.stringify(item)).join('\n') + '\n';

    await fs.writeFile(filePath, content, 'utf-8');
}

// Helper to append to JSONL
async function appendJsonl(filename, item) {
    const filePath = path.join(DATA_DIR, filename);
    const content = JSON.stringify(item) + '\n';

    await fs.appendFile(filePath, content, 'utf-8');
}

// Helper to read .env values
async function readEnvValue(key) {
    const possibleEnvPaths = [
        path.join(__dirname, '../../.env'),
        path.join(__dirname, '../.env'),
        path.join(process.cwd(), '.env'),
    ];

    for (const envPath of possibleEnvPaths) {
        try {
            const envContent = await fs.readFile(envPath, 'utf-8');
            const regex = new RegExp(`${key}=["']?([^"'\\n\\r]+)["']?`);
            const match = envContent.match(regex);

            if (match && match[1]) {
                return match[1];
            }
        } catch (e) {
            // Ignore missing .env files
        }
    }

    return null;
}

// --- Facebook Helpers ---

async function getStoredFacebookSettings() {
    const settings = await readJsonl('settings.jsonl');

    const facebookSettings =
        settings.find(s => s.type === 'facebook') ||
        { type: 'facebook', isEnabled: false };

    if (!facebookSettings.accessToken) {
        const envAccessToken = await readEnvValue('APP_ACCESS_TOKEN');

        if (envAccessToken) {
            facebookSettings.accessToken = envAccessToken;
        }
    }

    if (!facebookSettings.pageAccessToken) {
        const envPageAccessToken = await readEnvValue('FACEBOOK_PAGE_ACCESS_TOKEN');

        if (envPageAccessToken) {
            facebookSettings.pageAccessToken = envPageAccessToken;
        }
    }

    if (!facebookSettings.pageId) {
        const envPageId = await readEnvValue('FACEBOOK_PAGE_ID');

        if (envPageId) {
            facebookSettings.pageId = envPageId;
        }
    }

    return facebookSettings;
}


async function saveStoredFacebookSettings(newSettings) {
    const settings = await readJsonl('settings.jsonl');
    const index = settings.findIndex(s => s.type === 'facebook');

    if (index !== -1) {
        settings[index] = {
            ...settings[index],
            ...newSettings,
            type: 'facebook',
        };
    } else {
        settings.push({
            type: 'facebook',
            ...newSettings,
        });
    }

    await writeJsonl('settings.jsonl', settings);
    return settings.find(s => s.type === 'facebook');
}

function getBackendBaseUrl(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
    return `${protocol}://${host}`;
}

function normalizeOAuthRedirectUri(req, redirectUri) {
    return String(redirectUri || `${getBackendBaseUrl(req)}/facebook/oauth/callback`).trim();
}

function getFacebookAppCredentials(reqBody = {}, settings = {}) {
    const appId = String(
        reqBody.appId ||
        settings.appId ||
        process.env.FB_APP_ID ||
        ''
    ).trim();

    const appSecret = String(
        reqBody.appSecret ||
        settings.appSecret ||
        process.env.FB_APP_SECRET ||
        ''
    ).trim();

    return { appId, appSecret };
}

async function saveFacebookOAuthState(stateRecord) {
    const existingStates = await readJsonl(FACEBOOK_OAUTH_STATE_FILE);
    const now = Date.now();
    const activeStates = existingStates
        .filter(item => item && item.expiresAt && item.expiresAt > now && item.state !== stateRecord.state)
        .slice(-25);

    activeStates.push(stateRecord);
    await writeJsonl(FACEBOOK_OAUTH_STATE_FILE, activeStates);
}

async function consumeFacebookOAuthState(state) {
    const existingStates = await readJsonl(FACEBOOK_OAUTH_STATE_FILE);
    const now = Date.now();
    const matchingState = existingStates.find(item => item.state === state);
    const remainingStates = existingStates.filter(item => item.state !== state && item.expiresAt && item.expiresAt > now);

    await writeJsonl(FACEBOOK_OAUTH_STATE_FILE, remainingStates);

    if (!matchingState) {
        throw Object.assign(new Error('Invalid or expired Facebook OAuth state.'), { status: 400 });
    }

    if (!matchingState.expiresAt || matchingState.expiresAt <= now) {
        throw Object.assign(new Error('Facebook OAuth state expired. Please start the login again.'), { status: 400 });
    }

    return matchingState;
}

function renderFacebookOAuthCallbackPage(payload) {
    const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Facebook Connection</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; line-height: 1.5; background: #f7f7f7; color: #111; }
    .card { max-width: 640px; margin: 10vh auto; padding: 24px; background: #fff; border: 2px solid #111; box-shadow: 8px 8px 0 #111; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 8px 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${payload.success ? 'Facebook Page connected' : 'Facebook connection failed'}</h1>
    <p>${payload.message || ''}</p>
    <p>You can close this window and return to SteadySocial.</p>
  </div>
  <script>
    (function () {
      var payload = ${safePayload};
      if (window.opener) {
        window.opener.postMessage(Object.assign({ source: 'steadysocial-facebook-oauth' }, payload), '*');
      }
      setTimeout(function () { window.close(); }, 800);
    })();
  </script>
</body>
</html>`;
}

async function exchangeFacebookOAuthCode({ appId, appSecret, redirectUri, code }) {
    const shortTokenUrl =
        `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?` +
        new URLSearchParams({
            client_id: appId,
            redirect_uri: redirectUri,
            client_secret: appSecret,
            code,
        }).toString();

    const shortTokenData = await fetchFacebookJson(shortTokenUrl);

    const longTokenUrl =
        `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?` +
        new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortTokenData.access_token,
        }).toString();

    const longTokenData = await fetchFacebookJson(longTokenUrl);

    return {
        shortLivedUserToken: shortTokenData.access_token,
        longLivedUserToken: longTokenData.access_token,
        longLivedUserTokenExpiresIn: longTokenData.expires_in,
    };
}

async function fetchFacebookManagedPages(longLivedUserToken) {
    const query = new URLSearchParams({
        fields: 'id,name,access_token,picture{url},category,tasks,perms',
        access_token: longLivedUserToken,
        limit: '100',
    });

    const pages = [];
    let nextUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts?${query.toString()}`;

    while (nextUrl) {
        const pageData = await fetchFacebookJson(nextUrl);
        pages.push(...(pageData.data || []));
        nextUrl = pageData.paging?.next || null;
    }

    return pages;
}

async function subscribeFacebookPageToMessenger(pageId, pageAccessToken) {
    const subscribedFields = 'messages,messaging_postbacks,messaging_optins';

    const body = new URLSearchParams({
        subscribed_fields: subscribedFields,
        access_token: pageAccessToken,
    });

    const subscribeUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/subscribed_apps`;
    const data = await fetchFacebookJson(subscribeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    return {
        success: Boolean(data.success),
        subscribedFields: subscribedFields.split(','),
        response: data,
    };
}

function normalizeFacebookOAuthPages(rawPages = [], existingSettings = {}) {
    const existingPages = Array.isArray(existingSettings.pages) ? existingSettings.pages : [];
    const existingContexts = existingSettings.pageContexts || {};

    return rawPages
        .filter(page => page?.id && page?.access_token)
        .map((page, index) => {
            const existingPage = existingPages.find(item => item.id === page.id) || {};

            return {
                ...existingPage,
                id: page.id,
                name: page.name || existingPage.name || '',
                accessToken: page.access_token,
                access_token: page.access_token,
                category: page.category || existingPage.category || '',
                pictureUrl: page.picture?.data?.url || existingPage.pictureUrl || '',
                tasks: page.tasks || page.perms || existingPage.tasks || [],
                permissions: existingPage.permissions || [],
                features: existingPage.features,
                isDefault: existingSettings.defaultPageId
                    ? page.id === existingSettings.defaultPageId
                    : index === 0,
                status: 'connected',
                lastTestedAt: new Date().toISOString(),
                aiAgentContext: existingContexts[page.id] || existingPage.aiAgentContext || '',
            };
        });
}


function getFacebookErrorMessage(fbData) {
    return (
        fbData?.error?.message ||
        fbData?.error?.error_user_msg ||
        fbData?.message ||
        'Facebook request failed.'
    );
}

function parseDataImage(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return null;

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    return {
        mimeType: matches[1],
        base64: matches[2],
    };
}

function resolveAccessToken(req, settings) {
    return (
        req.headers['x-access-token'] ||
        req.body?.accessToken ||
        req.body?.access_token ||
        settings.pageAccessToken ||
        settings.accessToken ||
        ''
    );
}

function resolvePageId(req, settings) {
    return (
        req.body?.pageId ||
        req.params?.pageId ||
        settings.pageId ||
        settings.selectedPageId ||
        ''
    );
}

function buildGraphQueryFromRequest(req, accessToken) {
    const query = new URLSearchParams();

    Object.entries(req.query || {}).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            key !== 'access_token' &&
            key !== 'accessToken'
        ) {
            query.set(key, String(value));
        }
    });

    query.set('access_token', accessToken);

    return query;
}

function normalizeGraphFields(query, fallbackFields) {
    if (!query.has('fields') && fallbackFields) {
        query.set('fields', fallbackFields);
    }

    const fields = query.get('fields');

    if (fields) {
        query.set(
            'fields',
            fields
                .replace(/\?+$/g, '')
                .replace(/^fields=/i, '')
                .trim()
        );
    }

    return query;
}

async function fetchFacebookJson(url, options = {}) {
    const fbResponse = await fetch(url, options);
    const fbData = await fbResponse.json().catch(() => ({}));

    if (!fbResponse.ok || fbData.error) {
        const error = new Error(getFacebookErrorMessage(fbData));
        error.status = fbResponse.status || 400;
        error.facebook = fbData.error || fbData;
        throw error;
    }

    return fbData;
}

function sendFacebookError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);

    return res.status(error.status || 500).json({
        success: false,
        message: error.message || fallbackMessage,
        error: error.facebook || null,
    });
}

function isNetworkError(error) {
    const msg = String(error.message || '').toLowerCase();
    const name = String(error.name || '').toLowerCase();
    const code = String(error.code || '').toLowerCase();
    return (
        msg.includes('fetch failed') ||
        msg.includes('timeout') ||
        msg.includes('enotfound') ||
        msg.includes('econnrefused') ||
        msg.includes('connect timeout') ||
        code.includes('timeout') ||
        code === 'und_err_connect_timeout' ||
        name.includes('timeout') ||
        name.includes('typeerror')
    );
}

// --- Health Endpoint ---

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Local backend server is running.',
    });
});

// --- User Endpoints ---

app.get('/users', async (req, res) => {
    try {
        const users = await readJsonl('users.jsonl');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/users', async (req, res) => {
    try {
        const newUser = {
            ...req.body,
            id: req.body.id || `user-${Date.now()}`,
        };

        await appendJsonl('users.jsonl', newUser);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readJsonl('users.jsonl');

        const user = users.find(
            u => u.username === username && u.password === password
        );

        if (user) {
            const { password, ...userWithoutPassword } = user;

            res.json({
                user: userWithoutPassword,
                token: `fake-jwt-${user.id}`,
            });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/users/:id/profile', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const users = await readJsonl('users.jsonl');
        const index = users.findIndex(u => u.id === id);

        if (index !== -1) {
            users[index] = {
                ...users[index],
                ...updates,
                id: users[index].id,
            };

            await writeJsonl('users.jsonl', users);

            const { password, ...userWithoutPassword } = users[index];
            res.json(userWithoutPassword);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/users/:id/role', async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const users = await readJsonl('users.jsonl');
        const index = users.findIndex(u => u.id === id);

        if (index !== -1) {
            users[index] = {
                ...users[index],
                role,
            };

            await writeJsonl('users.jsonl', users);

            const { password, ...userWithoutPassword } = users[index];
            res.json(userWithoutPassword);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/users/:id/password', async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        const users = await readJsonl('users.jsonl');
        const index = users.findIndex(u => u.id === id);

        if (index !== -1) {
            users[index] = {
                ...users[index],
                password,
            };

            await writeJsonl('users.jsonl', users);
            res.json({ success: true });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:id/theme', async (req, res) => {
    try {
        const { id } = req.params;
        const users = await readJsonl('users.jsonl');
        const user = users.find(u => u.id === id);

        if (user) {
            res.json({ theme: user.theme || 'light' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/users/:id/theme', async (req, res) => {
    try {
        const { id } = req.params;
        const { theme } = req.body;
        const users = await readJsonl('users.jsonl');
        const index = users.findIndex(u => u.id === id);

        if (index !== -1) {
            users[index] = {
                ...users[index],
                theme,
            };

            await writeJsonl('users.jsonl', users);
            res.json({ success: true });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const users = await readJsonl('users.jsonl');
        const filteredUsers = users.filter(u => u.id !== id);

        await writeJsonl('users.jsonl', filteredUsers);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/users/forgot-password', async (req, res) => {
    res.json({
        success: true,
        message: 'Password reset instructions sent (simulated).',
    });
});

// --- Settings Endpoints ---

app.get('/settings/facebook', async (req, res) => {
    try {
        const facebookSettings = await getStoredFacebookSettings();
        res.json(facebookSettings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/settings/facebook', async (req, res) => {
    try {
        const savedSettings = await saveStoredFacebookSettings(req.body);
        res.json(savedSettings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Facebook OAuth Login Flow ---

app.post('/facebook/oauth/start', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const { appId, appSecret } = getFacebookAppCredentials(req.body || {}, settings);
        const redirectUri = normalizeOAuthRedirectUri(req, req.body?.redirectUri);
        const clientId = String(req.body?.clientId || 'settings-page');

        if (!appId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook App ID is required.',
            });
        }

        if (!appSecret) {
            return res.status(400).json({
                success: false,
                message: 'Facebook App Secret is required.',
            });
        }

        const state = crypto.randomBytes(32).toString('hex');

        await saveFacebookOAuthState({
            state,
            appId,
            appSecret,
            redirectUri,
            clientId,
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        await saveStoredFacebookSettings({
            appId,
            appSecret,
            oauthRedirectUri: redirectUri,
            oauthScopes: FACEBOOK_OAUTH_SCOPES,
            isEnabled: settings.isEnabled ?? true,
        });

        const loginUrl =
            `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?` +
            new URLSearchParams({
                client_id: appId,
                redirect_uri: redirectUri,
                state,
                response_type: 'code',
                auth_type: 'rerequest',
                scope: FACEBOOK_OAUTH_SCOPES.join(','),
            }).toString();

        return res.json({
            success: true,
            loginUrl,
            redirectUri,
            scopes: FACEBOOK_OAUTH_SCOPES,
        });
    } catch (error) {
        console.error('[facebook/oauth/start] Failed:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Could not start Facebook OAuth.',
        });
    }
});

app.get('/facebook/oauth/callback', async (req, res) => {
    try {
        if (req.query.error) {
            const errorMessage = req.query.error_description || req.query.error_reason || req.query.error;
            return res
                .status(400)
                .send(renderFacebookOAuthCallbackPage({
                    success: false,
                    message: String(errorMessage || 'Facebook authorization was cancelled.'),
                }));
        }

        const code = String(req.query.code || '');
        const state = String(req.query.state || '');

        if (!code) {
            return res
                .status(400)
                .send(renderFacebookOAuthCallbackPage({
                    success: false,
                    message: 'Facebook did not return an authorization code.',
                }));
        }

        if (!state) {
            return res
                .status(400)
                .send(renderFacebookOAuthCallbackPage({
                    success: false,
                    message: 'Missing OAuth state. Please start the login again.',
                }));
        }

        const stateRecord = await consumeFacebookOAuthState(state);

        const tokenData = await exchangeFacebookOAuthCode({
            appId: stateRecord.appId,
            appSecret: stateRecord.appSecret,
            redirectUri: stateRecord.redirectUri,
            code,
        });

        const rawPages = await fetchFacebookManagedPages(tokenData.longLivedUserToken);
        const existingSettings = await getStoredFacebookSettings();
        const pages = normalizeFacebookOAuthPages(rawPages, existingSettings);

        if (pages.length === 0) {
            return res
                .status(400)
                .send(renderFacebookOAuthCallbackPage({
                    success: false,
                    message: 'Facebook Login succeeded, but no manageable Pages were returned. Make sure pages_show_list is approved and the Facebook user has Page access.',
                }));
        }

        const subscriptionResults = [];

        for (const page of pages) {
            try {
                const subscription = await subscribeFacebookPageToMessenger(page.id, page.accessToken);
                subscriptionResults.push({
                    pageId: page.id,
                    pageName: page.name,
                    success: true,
                    subscribedFields: subscription.subscribedFields,
                });
            } catch (subscribeError) {
                console.warn(`[facebook/oauth/callback] Webhook subscription failed for page ${page.id}:`, subscribeError.message);
                subscriptionResults.push({
                    pageId: page.id,
                    pageName: page.name,
                    success: false,
                    message: subscribeError.message,
                });
            }
        }

        const defaultPage = pages.find(page => page.isDefault) || pages[0];
        const pageContexts = pages.reduce((acc, page) => {
            if (page.aiAgentContext) acc[page.id] = page.aiAgentContext;
            return acc;
        }, { ...(existingSettings.pageContexts || {}) });

        await saveStoredFacebookSettings({
            isEnabled: true,
            appId: stateRecord.appId,
            appSecret: stateRecord.appSecret,
            oauthRedirectUri: stateRecord.redirectUri,
            oauthConnectedAt: new Date().toISOString(),
            oauthScopes: FACEBOOK_OAUTH_SCOPES,
            longLivedUserAccessToken: tokenData.longLivedUserToken,
            longLivedUserTokenExpiresIn: tokenData.longLivedUserTokenExpiresIn,
            accessToken: defaultPage.accessToken,
            pageAccessToken: defaultPage.accessToken,
            pageId: defaultPage.id,
            selectedPageId: defaultPage.id,
            pageName: defaultPage.name || '',
            defaultPageId: defaultPage.id,
            pages,
            pageContexts,
            aiAgentContext: defaultPage.aiAgentContext || existingSettings.aiAgentContext || '',
            subscriptionResults,
        });

        const failedSubscriptions = subscriptionResults.filter(item => !item.success);
        const message = failedSubscriptions.length > 0
            ? `Connected ${pages.length} Facebook Page(s). ${failedSubscriptions.length} Page webhook subscription(s) need review in Meta App Dashboard.`
            : `Connected ${pages.length} Facebook Page(s) and subscribed Messenger webhooks.`;

        return res.send(renderFacebookOAuthCallbackPage({
            success: true,
            message,
            pageCount: pages.length,
            pages: pages.map(page => ({ id: page.id, name: page.name })),
            subscriptionResults,
        }));
    } catch (error) {
        console.error('[facebook/oauth/callback] Failed:', error);
        return res
            .status(error.status || 500)
            .send(renderFacebookOAuthCallbackPage({
                success: false,
                message: error.message || 'Facebook OAuth callback failed.',
            }));
    }
});

app.post('/facebook/oauth/disconnect', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();

        const savedSettings = await saveStoredFacebookSettings({
            isEnabled: false,
            appId: settings.appId || '',
            appSecret: settings.appSecret || '',
            oauthRedirectUri: settings.oauthRedirectUri || '',
            oauthDisconnectedAt: new Date().toISOString(),
            longLivedUserAccessToken: '',
            longLivedUserTokenExpiresIn: '',
            accessToken: '',
            pageAccessToken: '',
            pageId: '',
            selectedPageId: '',
            pageName: '',
            defaultPageId: '',
            pages: [],
            subscriptionResults: [],
        });

        return res.json({
            success: true,
            settings: savedSettings,
        });
    } catch (error) {
        console.error('[facebook/oauth/disconnect] Failed:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Could not disconnect Facebook.',
        });
    }
});

app.post('/facebook/subscribe-page', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const pageId = req.body?.pageId || settings.pageId || settings.selectedPageId;
        const accessToken = req.body?.accessToken || req.body?.access_token || resolveAccessToken(req, settings);

        if (!pageId) {
            return res.status(400).json({ success: false, message: 'pageId is required.' });
        }

        if (!accessToken) {
            return res.status(400).json({ success: false, message: 'Page access token is required.' });
        }

        const subscription = await subscribeFacebookPageToMessenger(pageId, accessToken);
        return res.json({ success: true, ...subscription });
    } catch (error) {
        return sendFacebookError(res, error, 'Facebook page webhook subscription failed.');
    }
});

app.get('/settings/ai', async (req, res) => {
    try {
        const settings = await readJsonl('settings.jsonl');

        const aiSettings =
            settings.find(s => s.type === 'ai') ||
            { type: 'ai', provider: 'local' };

        res.json(aiSettings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/settings/ai', async (req, res) => {
    try {
        const newSettings = req.body;
        const settings = await readJsonl('settings.jsonl');
        const index = settings.findIndex(s => s.type === 'ai');

        if (index !== -1) {
            settings[index] = {
                ...settings[index],
                ...newSettings,
                type: 'ai',
            };
        } else {
            settings.push({
                type: 'ai',
                ...newSettings,
            });
        }

        await writeJsonl('settings.jsonl', settings);
        res.json(settings.find(s => s.type === 'ai'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Facebook Token Debug Endpoint ---

/**
 * POST /facebook/debug-token
 * Inspects a Page Access Token using the Facebook Graph API debug_token endpoint.
 * App ID and App Secret can come from the saved Settings page, request body,
 * process.env, or .env fallback.
 *
 * Body: { inputToken: string, appId?: string, appSecret?: string }
 */
app.post('/facebook/debug-token', async (req, res) => {
    try {
        const { inputToken } = req.body || {};

        if (!inputToken) {
            return res.status(400).json({ success: false, message: 'inputToken is required.' });
        }

        const settings = await getStoredFacebookSettings();

        const appId = String(
            req.body?.appId ||
            settings.appId ||
            process.env.FB_APP_ID ||
            await readEnvValue('FB_APP_ID') ||
            ''
        ).trim();

        const appSecret = String(
            req.body?.appSecret ||
            settings.appSecret ||
            process.env.FB_APP_SECRET ||
            await readEnvValue('FB_APP_SECRET') ||
            ''
        ).trim();

        if (!appId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook App ID is not configured in Settings.',
            });
        }

        if (!appSecret) {
            return res.status(400).json({
                success: false,
                message: 'Facebook App Secret is not configured in Settings.',
            });
        }

        const appAccessToken = `${appId}|${appSecret}`;
        const debugUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appAccessToken)}`;

        const debugResponse = await fetch(debugUrl);
        const debugData = await debugResponse.json().catch(() => ({}));

        if (!debugResponse.ok || debugData.error) {
            const errMsg = debugData?.error?.message || `Facebook debug_token returned HTTP ${debugResponse.status}`;
            console.error('[debug-token] Error from Facebook:', errMsg);
            return res.status(debugResponse.status || 400).json({
                success: false,
                message: errMsg,
                error: debugData?.error || debugData,
            });
        }

        const tokenData = debugData?.data || {};

        return res.json({
            success: true,
            data: {
                is_valid: tokenData.is_valid ?? false,
                app_id: tokenData.app_id,
                user_id: tokenData.user_id,
                type: tokenData.type,
                expires_at: tokenData.expires_at,
                scopes: tokenData.scopes || [],
                granular_scopes: tokenData.granular_scopes || [],
                error: tokenData.error,
            },
        });
    } catch (error) {
        console.error('[debug-token] Unexpected error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to inspect token.',
        });
    }
});

// --- Lead Core (CRM) Endpoints ---

app.get('/leads', async (req, res) => {
    try {
        const leads = await readJsonl('leads.jsonl');
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/leads', async (req, res) => {
    try {
        const leads = await readJsonl('leads.jsonl');

        // Dedup: if a lead with the same messengerConversationId already exists, return it
        const messengerConvId = req.body.messengerConversationId;
        if (messengerConvId) {
            const existing = leads.find(l => l.messengerConversationId === messengerConvId);
            if (existing) {
                return res.status(200).json(existing);
            }
        }

        const newLead = {
            ...req.body,
            id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            createdAt: Date.now(),
        };

        await appendJsonl('leads.jsonl', newLead);
        res.status(201).json(newLead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/leads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const leads = await readJsonl('leads.jsonl');
        const index = leads.findIndex(l => l.id === id);

        if (index === -1) {
            return res.status(404).json({ message: 'Lead not found.' });
        }

        leads[index] = { ...leads[index], ...req.body, id };
        await writeJsonl('leads.jsonl', leads);
        res.json(leads[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/leads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const leads = await readJsonl('leads.jsonl');
        const filtered = leads.filter(l => l.id !== id);
        await writeJsonl('leads.jsonl', filtered);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Facebook Lead Ads ---

/**
 * Helper: parse raw field_data array from Graph API into a flat object.
 * field_data: [{ name: 'full_name', values: ['John Doe'] }, ...]
 */
function parseLeadFieldData(fieldData = []) {
    const result = {};
    for (const field of fieldData) {
        const key = (field.name || '').toLowerCase().replace(/\s+/g, '_');
        result[key] = Array.isArray(field.values) ? field.values[0] : field.values;
    }
    return result;
}

/**
 * Helper: fetch a single leadgen record from Graph API and upsert into leads.jsonl
 */
async function fetchAndStoreFbLead(leadgenId, accessToken) {
    const fbRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${leadgenId}?fields=field_data,created_time,ad_id,form_id&access_token=${encodeURIComponent(accessToken)}`
    );
    const fbData = await fbRes.json();

    if (!fbRes.ok || fbData.error) {
        throw new Error(fbData?.error?.message || 'Failed to fetch leadgen details.');
    }

    const parsed = parseLeadFieldData(fbData.field_data || []);

    const name =
        parsed.full_name ||
        parsed.name ||
        [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') ||
        'Unknown Lead';

    const phone = parsed.phone_number || parsed.phone || parsed.contact_number || '';
    const email = parsed.email || parsed.email_address || '';
    const address = [parsed.street_address, parsed.city, parsed.province, parsed.zip_code]
        .filter(Boolean).join(', ');

    const leads = await readJsonl('leads.jsonl');
    const alreadyExists = leads.find(l => l.fbLeadId === leadgenId);
    if (alreadyExists) return alreadyExists;

    const newLead = {
        id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        fbLeadId: leadgenId,
        fbAdId: fbData.ad_id || '',
        fbFormId: fbData.form_id || '',
        fbSubmittedAt: fbData.created_time || '',
        fbRawFields: parsed,
        name,
        email: email || undefined,
        phone: phone || undefined,
        notes: address ? `Address: ${address}` : undefined,
        source: 'FACEBOOK_ADS',
        status: 'NEW',
    };

    await appendJsonl('leads.jsonl', newLead);
    return newLead;
}

// GET /facebook/webhook — FB webhook verification (hub.challenge handshake)
app.get('/facebook/webhook', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const verifyToken = settings.webhookVerifyToken || process.env.FB_WEBHOOK_VERIFY_TOKEN || 'steadysocial_verify';

        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('[Webhook] Facebook webhook verified successfully.');
            return res.status(200).send(challenge);
        }
        return res.status(403).json({ message: 'Webhook verification failed. Token mismatch.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /facebook/webhook — receives real-time leadgen events
app.post('/facebook/webhook', async (req, res) => {
    // Respond immediately so Facebook doesn't retry
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;
        if (body.object !== 'page') return;

        const settings = await getStoredFacebookSettings();
        const accessToken = settings.pageAccessToken || settings.accessToken || '';
        if (!accessToken) {
            console.warn('[Webhook] No access token configured — cannot fetch lead details.');
            return;
        }

        for (const entry of (body.entry || [])) {
            for (const change of (entry.changes || [])) {
                if (change.field === 'leadgen') {
                    const leadgenId = change.value?.leadgen_id;
                    if (!leadgenId) continue;

                    try {
                        const lead = await fetchAndStoreFbLead(leadgenId, accessToken);
                        console.log(`[Webhook] Lead stored from real-time event: ${lead.name} (${leadgenId})`);
                    } catch (fetchErr) {
                        console.error(`[Webhook] Failed to fetch/store lead ${leadgenId}:`, fetchErr.message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[Webhook] Error processing webhook event:', error);
    }
});

// GET /facebook/lead-forms/:pageId — list all lead forms for a page
app.get('/facebook/lead-forms/:pageId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const { pageId } = req.params;

        if (!accessToken) {
            return res.status(400).json({ message: 'Access token required.' });
        }

        const fbRes = await fetch(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/leadgen_forms?fields=id,name,status,leads_count,created_time&access_token=${encodeURIComponent(accessToken)}`
        );
        const fbData = await fbRes.json();

        if (!fbRes.ok || fbData.error) {
            return res.status(fbRes.status || 400).json({
                message: fbData?.error?.message || 'Failed to fetch lead forms.',
            });
        }

        return res.json(fbData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /facebook/leads/bulk-import — paginated bulk fetch of leads from a form
app.post('/facebook/leads/bulk-import', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = req.body.accessToken || resolveAccessToken(req, settings);
        const { formId, since } = req.body; // since = unix timestamp (optional)

        if (!accessToken) {
            return res.status(400).json({ message: 'Access token required.' });
        }
        if (!formId) {
            return res.status(400).json({ message: 'formId is required.' });
        }

        let url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${formId}/leads?fields=field_data,created_time,ad_id,form_id&limit=100&access_token=${encodeURIComponent(accessToken)}`;
        if (since) {
            url += `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${Number(since)}}]`;
        }

        const importedLeads = [];
        const skippedCount = { count: 0 };
        let nextUrl = url;

        // Paginate through all results
        while (nextUrl) {
            const fbRes = await fetch(nextUrl);
            const fbData = await fbRes.json();

            if (!fbRes.ok || fbData.error) {
                return res.status(fbRes.status || 400).json({
                    message: fbData?.error?.message || 'Failed to fetch leads from form.',
                    imported: importedLeads.length,
                });
            }

            const existingLeads = await readJsonl('leads.jsonl');
            const existingFbIds = new Set(existingLeads.map(l => l.fbLeadId).filter(Boolean));

            for (const rawLead of (fbData.data || [])) {
                if (existingFbIds.has(rawLead.id)) {
                    skippedCount.count++;
                    continue;
                }

                const parsed = parseLeadFieldData(rawLead.field_data || []);
                const name =
                    parsed.full_name ||
                    parsed.name ||
                    [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') ||
                    'Unknown Lead';

                const phone = parsed.phone_number || parsed.phone || parsed.contact_number || '';
                const email = parsed.email || parsed.email_address || '';
                const address = [parsed.street_address, parsed.city, parsed.province, parsed.zip_code]
                    .filter(Boolean).join(', ');

                const newLead = {
                    id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    createdAt: Date.now(),
                    fbLeadId: rawLead.id,
                    fbAdId: rawLead.ad_id || '',
                    fbFormId: rawLead.form_id || formId,
                    fbSubmittedAt: rawLead.created_time || '',
                    fbRawFields: parsed,
                    name,
                    email: email || undefined,
                    phone: phone || undefined,
                    notes: address ? `Address: ${address}` : undefined,
                    source: 'FACEBOOK_ADS',
                    status: 'NEW',
                };

                await appendJsonl('leads.jsonl', newLead);
                importedLeads.push(newLead);
                existingFbIds.add(rawLead.id); // prevent intra-batch dupes
            }

            // Follow pagination cursor
            nextUrl = fbData.paging?.next || null;
        }

        return res.json({
            success: true,
            imported: importedLeads.length,
            skipped: skippedCount.count,
            leads: importedLeads,
        });
    } catch (error) {
        console.error('[BulkImport] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Facebook Backend Routes ---

app.post('/facebook/messages', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();

        const accessToken =
            req.body?.accessToken ||
            req.body?.access_token ||
            settings.pageAccessToken ||
            settings.accessToken ||
            '';

        const pageId =
            req.body?.pageId ||
            settings.pageId ||
            settings.selectedPageId ||
            '';

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook page access token is required.',
            });
        }

        if (!pageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        const recipient =
            typeof req.body.recipient === 'string'
                ? JSON.parse(req.body.recipient)
                : req.body.recipient;

        const message =
            typeof req.body.message === 'string'
                ? JSON.parse(req.body.message)
                : req.body.message;

        if (!recipient?.id) {
            return res.status(400).json({
                success: false,
                message: 'Recipient PSID is required.',
            });
        }

        if (!message?.text) {
            return res.status(400).json({
                success: false,
                message: 'Message text is required.',
            });
        }

        const fbResponse = await fetch(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_type: req.body.messaging_type || 'RESPONSE',
                    recipient,
                    message,
                    access_token: accessToken,
                }),
            }
        );

        const fbData = await fbResponse.json().catch(() => ({}));

        if (!fbResponse.ok || fbData.error) {
            const isDummyToken = !accessToken || accessToken.startsWith('dummy') || !accessToken.startsWith('EA');
            if (isDummyToken || (recipient && recipient.id === 'psid_john')) {
                console.warn('[Facebook API] Real Graph API request failed or dummy token used. Simulating successful message transmission.');
                return res.json({
                    message_id: `sim_msg_${Date.now()}`,
                    recipient_id: recipient?.id || 'psid_john',
                    success: true,
                    simulated: true
                });
            }

            return res.status(fbResponse.status || 400).json({
                success: false,
                message:
                    fbData?.error?.message ||
                    fbData?.error?.error_user_msg ||
                    'Facebook message send failed.',
                error: fbData.error || fbData,
            });
        }

        return res.json(fbData);
    } catch (error) {
        console.error('Facebook message send failed:', error);

        if (isNetworkError(error)) {
            console.warn('[Facebook API] Messages connection failed. Simulating message response.');
            return res.json({
                message_id: `sim_msg_${Date.now()}`,
                recipient_id: req.body?.recipient?.id || 'psid_john',
                success: true,
                simulated: true
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || 'Facebook message send failed.',
        });
    }
});

app.get('/facebook/test', (req, res) => {
    res.json({
        success: true,
        message: 'Facebook backend routes are loaded.',
        supportedRoutes: [
            'GET /facebook/pages',
            'GET /facebook/page-info/:pageId',
            'GET /facebook/page-posts/:pageId',
            'POST /facebook/feed',
            'POST /facebook/photo',
            'POST /facebook/uploads',
            'POST /facebook/debug-token',
        ],
    });
});

app.get('/facebook/conversations/:pageId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const pageId = req.params.pageId;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        if (!pageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        let query = buildGraphQueryFromRequest(req, accessToken);

        query = normalizeGraphFields(
            query,
            'participants,snippet,unread_count,updated_time'
        );

        if (!query.has('limit')) {
            query.set('limit', '25');
        }

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/conversations?${query.toString()}`
        );

        return res.json(fbData);
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] conversations get connection failed. Simulating conversations list.');
            return res.json({
                data: [
                    {
                        id: "t_mid.12345",
                        snippet: "Hello! I had a quick question about your new autonomous generation feature.",
                        unread_count: 1,
                        updated_time: new Date().toISOString(),
                        participants: {
                            data: [
                                { name: "John Doe", id: "psid_john" },
                                { name: "SteadySocial Sandbox Page", id: req.params.pageId || "1234567890" }
                            ]
                        }
                    },
                    {
                        id: "t_mid.67890",
                        snippet: "Thanks for the swift support response! It works perfectly now.",
                        unread_count: 0,
                        updated_time: new Date(Date.now() - 86400000).toISOString(),
                        participants: {
                            data: [
                                { name: "Jane Smith", id: "psid_jane" },
                                { name: "SteadySocial Sandbox Page", id: req.params.pageId || "1234567890" }
                            ]
                        }
                    }
                ]
            });
        }
        return sendFacebookError(res, error, 'Facebook conversations request failed.');
    }
});

app.get('/facebook/conversation-messages/:conversationId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const conversationId = req.params.conversationId;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Conversation ID is required.',
            });
        }

        let query = buildGraphQueryFromRequest(req, accessToken);

        query = normalizeGraphFields(
            query,
            'id,created_time,message,from{id,name,email}'
        );

        if (!query.has('limit')) {
            query.set('limit', '25');
        }

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${conversationId}/messages?${query.toString()}`
        );

        return res.json(fbData);
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] conversation-messages get connection failed. Simulating message list.');
            return res.json({
                data: [
                    {
                        id: "m_2",
                        created_time: new Date().toISOString(),
                        message: "Hello! I had a quick question about your new autonomous generation feature.",
                        from: { name: "John Doe", id: "psid_john" }
                    },
                    {
                        id: "m_1",
                        created_time: new Date(Date.now() - 120000).toISOString(),
                        message: "Hi, is this page managed by an AI agent?",
                        from: { name: "John Doe", id: "psid_john" }
                    }
                ]
            });
        }
        return sendFacebookError(res, error, 'Facebook conversation messages request failed.');
    }
});

app.get('/facebook/pages', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        let query = buildGraphQueryFromRequest(req, accessToken);

        query = normalizeGraphFields(
            query,
            'id,name,access_token,picture{url},category,tasks,perms'
        );

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts?${query.toString()}`
        );

        return res.json(fbData);
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] pages get connection failed. Simulating pages list.');
            return res.json({
                data: [
                    {
                        id: settings.pageId || "1234567890",
                        name: "SteadySocial Sandbox Page",
                        access_token: "mock_page_access_token_123456",
                        category: "Social Media OS",
                        picture: {
                            data: {
                                url: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&h=150&fit=crop"
                            }
                        },
                        tasks: ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MANAGE"],
                        perms: ["ADMINISTER"]
                    }
                ]
            });
        }
        return sendFacebookError(res, error, 'Facebook pages request failed.');
    }
});

app.get('/facebook/page-info/:pageId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const pageId = req.params.pageId;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        if (!pageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        let query = buildGraphQueryFromRequest(req, accessToken);

        query = normalizeGraphFields(
            query,
            'id,name,picture{url},followers_count,fan_count,category'
        );

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}?${query.toString()}`
        );

        return res.json(fbData);
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] page-info get connection failed. Simulating page info.');
            return res.json({
                id: req.params.pageId || "1234567890",
                name: "SteadySocial Sandbox Page",
                picture: {
                    data: {
                        url: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&h=150&fit=crop"
                    }
                },
                followers_count: 1420,
                fan_count: 1395,
                category: "Social Media OS"
            });
        }
        return sendFacebookError(res, error, 'Facebook page info request failed.');
    }
});

app.get('/facebook/page-posts/:pageId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const pageId = req.params.pageId;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        if (!pageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        let query = buildGraphQueryFromRequest(req, accessToken);

        query = normalizeGraphFields(
            query,
            'id,message,created_time,permalink_url,full_picture,attachments,shares,comments.summary(true),likes.summary(true),reactions.summary(true)'
        );

        if (!query.has('limit')) {
            query.set('limit', '25');
        }

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/posts?${query.toString()}`
        );

        return res.json(fbData);
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] page-posts get connection failed. Simulating page posts.');
            return res.json({
                data: [
                    {
                        id: "post_101",
                        message: "Welcome to SteadySocial! Your all-in-one autonomous marketing platform. 🚀",
                        created_time: new Date().toISOString(),
                        permalink_url: "https://facebook.com/posts/post_101",
                        full_picture: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop",
                        shares: { count: 12 },
                        comments: {
                            data: [
                                { id: "comment_1", message: "This UI looks premium! 🔥", created_time: new Date().toISOString(), from: { name: "Sarah Miller", id: "user_201" } }
                            ],
                            summary: { total_count: 1, can_comment: true }
                        },
                        likes: {
                            summary: { total_count: 48, viewer_reaction: "NONE" }
                        },
                        reactions: {
                            summary: { total_count: 52 }
                        }
                    },
                    {
                        id: "post_102",
                        message: "Automating social calendars just got ten times faster. How are you optimizing your marketing workflows today?",
                        created_time: new Date(Date.now() - 86400000).toISOString(),
                        permalink_url: "https://facebook.com/posts/post_102",
                        full_picture: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=400&fit=crop",
                        shares: { count: 4 },
                        comments: {
                            data: [],
                            summary: { total_count: 0, can_comment: true }
                        },
                        likes: {
                            summary: { total_count: 29, viewer_reaction: "NONE" }
                        },
                        reactions: {
                            summary: { total_count: 31 }
                        }
                    }
                ]
            });
        }
        return sendFacebookError(res, error, 'Facebook page posts request failed.');
    }
});

app.get('/facebook/promotable-posts/:pageId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const pageId = req.params.pageId;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        if (!pageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        let query = buildGraphQueryFromRequest(req, accessToken);

        query = normalizeGraphFields(
            query,
            'id,message,scheduled_publish_time'
        );

        if (!query.has('limit')) {
            query.set('limit', '25');
        }

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/scheduled_posts?${query.toString()}`
        );

        return res.json(fbData);
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] promotable-posts get connection failed. Simulating scheduled posts.');
            return res.json({
                data: [
                    {
                        id: "sched_post_201",
                        message: "This post is scheduled to go live tomorrow! Stay tuned for some exciting new updates. 🎉",
                        scheduled_publish_time: Math.floor(Date.now() / 1000) + 86400
                    }
                ]
            });
        }
        return sendFacebookError(res, error, 'Facebook page scheduled posts request failed.');
    }
});

app.delete('/facebook/scheduled-posts/:postId', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = resolveAccessToken(req, settings);
        const { postId } = req.params;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook access token is required.',
            });
        }

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${postId}?access_token=${accessToken}`,
            {
                method: 'DELETE',
            }
        );

        return res.json({ success: true, data: fbData });
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] delete scheduled-post connection failed. Simulating successful deletion.');
            return res.json({ success: true, simulated: true });
        }
        return sendFacebookError(res, error, 'Facebook delete scheduled post failed.');
    }
});

app.post('/facebook/feed', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();

        const finalPageId = resolvePageId(req, settings);
        const finalAccessToken = resolveAccessToken(req, settings);

        const {
            message,
            link,
            published = true,
            scheduled_publish_time,
        } = req.body;

        if (!finalPageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        if (!finalAccessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page access token is required.',
            });
        }

        if (!message && !link) {
            return res.status(400).json({
                success: false,
                message: 'Message or link is required.',
            });
        }

        const body = new URLSearchParams();

        body.set('access_token', finalAccessToken);
        
        const finalPublished = scheduled_publish_time ? false : published;
        body.set('published', String(finalPublished));

        if (scheduled_publish_time) {
            body.set('scheduled_publish_time', String(scheduled_publish_time));
        }

        if (message) {
            body.set('message', message);
        }

        if (link) {
            body.set('link', link);
        }

        const fbData = await fetchFacebookJson(
            `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/feed`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body,
            }
        );

        return res.json({
            success: true,
            data: fbData,
        });
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] post feed connection failed. Simulating successful feed post.');
            return res.json({
                success: true,
                data: {
                    id: `sim_post_${Date.now()}`,
                    post_id: `${finalPageId}_sim_post_${Date.now()}`
                },
                message: "Post simulated in sandbox fallback mode."
            });
        }
        return sendFacebookError(res, error, 'Facebook feed post failed.');
    }
});

async function handleFacebookPhotoPost(req, res) {
    try {
        const settings = await getStoredFacebookSettings();

        const finalPageId = resolvePageId(req, settings);
        const finalAccessToken = resolveAccessToken(req, settings);

        const {
            message,
            imageDataUrl,
            imageUrl,
            published = true,
            scheduled_publish_time,
        } = req.body;

        if (!finalPageId) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page ID is required.',
            });
        }

        if (!finalAccessToken) {
            return res.status(400).json({
                success: false,
                message: 'Facebook Page access token is required.',
            });
        }

        if (!imageDataUrl && !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Image data or image URL is required for photo posting.',
            });
        }

        const finalPublished = scheduled_publish_time ? false : published;

        if (imageUrl) {
            if (scheduled_publish_time) {
                // Two-step process for scheduling with image URL
                // 1. Upload unpublished photo
                const uploadBody = new URLSearchParams();
                uploadBody.set('access_token', finalAccessToken);
                uploadBody.set('url', imageUrl);
                uploadBody.set('published', 'false');
                uploadBody.set('temporary', 'true');

                const uploadData = await fetchFacebookJson(
                    `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/photos`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: uploadBody,
                    }
                );

                const photoId = uploadData.id;
                if (!photoId) {
                    throw new Error("Failed to upload temporary photo to Facebook.");
                }

                // 2. Schedule feed post with attached photo
                const feedBody = new URLSearchParams();
                feedBody.set('access_token', finalAccessToken);
                feedBody.set('published', 'false');
                feedBody.set('scheduled_publish_time', String(scheduled_publish_time));
                if (message) {
                    feedBody.set('message', message);
                }
                feedBody.set('attached_media', JSON.stringify([{ media_fbid: photoId }]));

                const fbData = await fetchFacebookJson(
                    `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/feed`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: feedBody,
                    }
                );

                return res.json({
                    success: true,
                    data: fbData,
                });
            } else {
                // Single-step direct post
                const body = new URLSearchParams();
                body.set('access_token', finalAccessToken);
                body.set('url', imageUrl);
                body.set('published', 'true');
                if (message) {
                    body.set('caption', message);
                }

                const fbData = await fetchFacebookJson(
                    `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/photos`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body,
                    }
                );

                return res.json({
                    success: true,
                    data: fbData,
                });
            }
        }

        const parsedImage = parseDataImage(imageDataUrl);

        if (!parsedImage?.base64) {
            return res.status(400).json({
                success: false,
                message: 'Invalid image data.',
            });
        }

        const imageBuffer = Buffer.from(parsedImage.base64, 'base64');
        const blob = new Blob([imageBuffer], {
            type: parsedImage.mimeType || 'image/png',
        });
        const extension =
            parsedImage.mimeType
                ?.split('/')[1]
                ?.replace('+xml', '')
                ?.replace('jpeg', 'jpg') || 'png';

        if (scheduled_publish_time) {
            // Two-step process for scheduling with uploaded image buffer
            // 1. Upload unpublished photo
            const uploadFormData = new FormData();
            uploadFormData.append('access_token', finalAccessToken);
            uploadFormData.append('published', 'false');
            uploadFormData.append('temporary', 'true');
            uploadFormData.append('source', blob, `steadysocial-post.${extension}`);

            const uploadData = await fetchFacebookJson(
                `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/photos`,
                {
                    method: 'POST',
                    body: uploadFormData,
                }
            );

            const photoId = uploadData.id;
            if (!photoId) {
                throw new Error("Failed to upload temporary photo to Facebook.");
            }

            // 2. Schedule feed post with attached photo
            const feedBody = new URLSearchParams();
            feedBody.set('access_token', finalAccessToken);
            feedBody.set('published', 'false');
            feedBody.set('scheduled_publish_time', String(scheduled_publish_time));
            if (message) {
                feedBody.set('message', message);
            }
            feedBody.set('attached_media', JSON.stringify([{ media_fbid: photoId }]));

            const fbData = await fetchFacebookJson(
                `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/feed`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: feedBody,
                }
            );

            return res.json({
                success: true,
                data: fbData,
            });
        } else {
            // Single-step direct post
            const formData = new FormData();
            formData.append('access_token', finalAccessToken);
            formData.append('published', 'true');
            if (message) {
                formData.append('caption', message);
            }
            formData.append('source', blob, `steadysocial-post.${extension}`);

            const fbData = await fetchFacebookJson(
                `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${finalPageId}/photos`,
                {
                    method: 'POST',
                    body: formData,
                }
            );

            return res.json({
                success: true,
                data: fbData,
            });
        }
    } catch (error) {
        if (isNetworkError(error)) {
            console.warn('[Facebook API] post photo connection failed. Simulating successful photo post.');
            return res.json({
                success: true,
                data: {
                    id: `sim_photo_${Date.now()}`,
                    post_id: `${finalPageId}_sim_photo_${Date.now()}`
                },
                message: "Photo post simulated in sandbox fallback mode."
            });
        }
        return sendFacebookError(res, error, 'Facebook photo post failed.');
    }
}

app.post('/facebook/photo', handleFacebookPhotoPost);
app.post('/facebook/uploads', handleFacebookPhotoPost);

// --- Canvases Endpoints ---

app.get('/canvases', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        res.json(canvases);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/canvases/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const canvases = await readJsonl('canvases.jsonl');
        const canvas = canvases.find(c => c.id === id);

        if (canvas) {
            res.json(canvas);
        } else {
            res.status(404).json({ message: 'Canvas not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/canvases', async (req, res) => {
    try {
        const canvasData = req.body;

        const newCanvas = {
            ...canvasData,
            id: canvasData.id || `canvas-${Date.now()}`,
            createdAt: canvasData.createdAt || Date.now(),
            status: canvasData.status || 'draft',
            items: canvasData.initialItems || canvasData.items || [],
        };

        delete newCanvas.initialItems;

        await appendJsonl('canvases.jsonl', newCanvas);
        res.status(201).json(newCanvas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/canvases/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedCanvasData = req.body;
        const canvases = await readJsonl('canvases.jsonl');
        const index = canvases.findIndex(c => c.id === id);

        if (index !== -1) {
            canvases[index] = {
                ...canvases[index],
                ...updatedCanvasData,
                id: canvases[index].id,
            };

            await writeJsonl('canvases.jsonl', canvases);
            res.json(canvases[index]);
        } else {
            res.status(404).json({ message: 'Canvas not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/presentations', async (req, res) => {
    try {
        const presentations = await readJsonl('presentations.jsonl');
        res.json(presentations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/presentations', async (req, res) => {
    try {
        const presentationData = req.body;
        await appendJsonl('presentations.jsonl', presentationData);
        res.status(201).json(presentationData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/presentations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedPresentation = req.body;
        const presentations = await readJsonl('presentations.jsonl');
        const index = presentations.findIndex((p) => p.id === id);

        if (index === -1) {
            return res.status(404).json({ message: 'Presentation not found' });
        }

        presentations[index] = {
            ...presentations[index],
            ...updatedPresentation,
            id: presentations[index].id,
        };

        await writeJsonl('presentations.jsonl', presentations);
        res.json(presentations[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/presentations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const presentations = await readJsonl('presentations.jsonl');
        const filteredPresentations = presentations.filter((p) => p.id !== id);

        await writeJsonl('presentations.jsonl', filteredPresentations);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/canvases/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const canvases = await readJsonl('canvases.jsonl');
        const filteredCanvases = canvases.filter(c => c.id !== id);

        await writeJsonl('canvases.jsonl', filteredCanvases);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/canvases/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminFeedback } = req.body;
        const canvases = await readJsonl('canvases.jsonl');
        const index = canvases.findIndex(c => c.id === id);

        if (index !== -1) {
            canvases[index] = {
                ...canvases[index],
                status,
                adminFeedback,
            };

            await writeJsonl('canvases.jsonl', canvases);
            res.json(canvases[index]);
        } else {
            res.status(404).json({ message: 'Canvas not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/canvases/:canvasId/items/:itemId/adaptations', async (req, res) => {
    try {
        const { canvasId, itemId } = req.params;
        const { platform, adaptedText } = req.body;
        const canvases = await readJsonl('canvases.jsonl');
        const canvasIndex = canvases.findIndex(c => c.id === canvasId);

        if (canvasIndex === -1) {
            return res.status(404).json({ message: 'Canvas not found' });
        }

        const itemIndex = canvases[canvasIndex].items.findIndex(
            item => item.id === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Item not found' });
        }

        if (!canvases[canvasIndex].items[itemIndex].adaptations) {
            canvases[canvasIndex].items[itemIndex].adaptations = {};
        }

        canvases[canvasIndex].items[itemIndex].adaptations[platform] = {
            text: adaptedText,
        };

        await writeJsonl('canvases.jsonl', canvases);
        res.json(canvases[canvasIndex]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/canvases/:canvasId/items/:itemId/notes', async (req, res) => {
    try {
        const { canvasId, itemId } = req.params;
        const { notes } = req.body;
        const canvases = await readJsonl('canvases.jsonl');
        const canvasIndex = canvases.findIndex(c => c.id === canvasId);

        if (canvasIndex === -1) {
            return res.status(404).json({ message: 'Canvas not found' });
        }

        const itemIndex = canvases[canvasIndex].items.findIndex(
            item => item.id === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Item not found' });
        }

        canvases[canvasIndex].items[itemIndex].notes = notes;

        await writeJsonl('canvases.jsonl', canvases);
        res.json(canvases[canvasIndex]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Campaigns Endpoints ---

app.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await readJsonl('campaigns.jsonl');
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/campaigns', async (req, res) => {
    try {
        const campaignData = req.body;

        const newCampaign = {
            ...campaignData,
            id: campaignData.id || `camp-${Date.now()}`,
            createdAt: campaignData.createdAt || Date.now(),
        };

        await appendJsonl('campaigns.jsonl', newCampaign);
        res.status(201).json(newCampaign);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/campaigns/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const campaigns = await readJsonl('campaigns.jsonl');
        const index = campaigns.findIndex(c => c.id === id);

        if (index !== -1) {
            campaigns[index] = {
                ...campaigns[index],
                ...updatedData,
                id: campaigns[index].id,
            };

            await writeJsonl('campaigns.jsonl', campaigns);
            res.json(campaigns[index]);
        } else {
            res.status(404).json({ message: 'Campaign not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/campaigns/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const campaigns = await readJsonl('campaigns.jsonl');
        const filtered = campaigns.filter(c => c.id !== id);

        await writeJsonl('campaigns.jsonl', filtered);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- Automations Endpoints ---

app.get('/automations', async (req, res) => {
    try {
        const automations = await readJsonl('automations.jsonl');
        res.json(automations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/automations', async (req, res) => {
    try {
        const ruleData = req.body;
        const newRule = {
            ...ruleData,
            id: ruleData.id || `rule-${Date.now()}`,
            createdAt: ruleData.createdAt || Date.now(),
            runCount: ruleData.runCount || 0,
        };
        await appendJsonl('automations.jsonl', newRule);
        res.status(201).json(newRule);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/automations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const automations = await readJsonl('automations.jsonl');
        const index = automations.findIndex(a => a.id === id);

        if (index !== -1) {
            automations[index] = {
                ...automations[index],
                ...updatedData,
                id: automations[index].id,
            };
            await writeJsonl('automations.jsonl', automations);
            res.json(automations[index]);
        } else {
            res.status(404).json({ message: 'Automation rule not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/automations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const automations = await readJsonl('automations.jsonl');
        const filtered = automations.filter(a => a.id !== id);

        await writeJsonl('automations.jsonl', filtered);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- Task Extraction Utility ---
/**
 * Extract tasks from markdown content
 * Supports formats:
 * - [ ] Task Name
 * - [ ] Task Name | due: 2026-05-30 | priority: HIGH | milestones: Step1,Step2,Step3
 */
function extractTasksFromMarkdown(content) {
    const tasks = [];
    if (!content) return tasks;

    // Regex for checkbox items: - [ ] or - [x]
    const taskRegex = /^[\s]*-\s+\[([xX\s])\]\s+(.+)$/gm;
    let match;

    while ((match = taskRegex.exec(content)) !== null) {
        const isCompleted = match[1].toLowerCase() === 'x';
        const taskLine = match[2].trim();

        // Parse task line for metadata separated by |
        const parts = taskLine.split('|').map(p => p.trim());
        const taskName = parts[0];

        // Parse metadata
        let dueDate = null;
        let priority = 'MEDIUM';
        let milestones = [];
        let description = '';

        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (part.startsWith('due:')) {
                dueDate = part.replace('due:', '').trim();
            } else if (part.startsWith('priority:')) {
                priority = part.replace('priority:', '').trim().toUpperCase();
                if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
                    priority = 'MEDIUM';
                }
            } else if (part.startsWith('milestones:')) {
                const milestonesStr = part.replace('milestones:', '').trim();
                milestones = milestonesStr.split(',').map((m, idx) => ({
                    label: m.trim(),
                    completed: false,
                    order: idx
                }));
            } else if (part.startsWith('desc:')) {
                description = part.replace('desc:', '').trim();
            }
        }

        tasks.push({
            text: taskName,
            description: description || '',
            type: 'TASK',
            priority: priority,
            status: 'SCHEDULED',
            dueDate: dueDate,
            milestones: milestones,
            completed: isCompleted,
            page: 'PLANNING_MODULE'
        });
    }

    return tasks;
}

// --- Scheduler History Endpoints ---

app.get('/scheduler/history', async (req, res) => {
    try {
        const history = await readJsonl('scheduler_history.jsonl');
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/planning/extract-tasks', async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'File path is required.' });
        }

        const planningDir = getPlanningDir();
        const targetFile = path.resolve(planningDir, filePath);

        if (!targetFile.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const exists = await fs.access(targetFile).then(() => true).catch(() => false);
        if (!exists) {
            return res.status(404).json({ error: 'File not found.' });
        }

        const content = await fs.readFile(targetFile, 'utf8');
        const tasks = extractTasksFromMarkdown(content);

        res.json({ 
            success: true, 
            taskCount: tasks.length,
            tasks: tasks,
            sourceFile: filePath
        });
    } catch (error) {
        console.error('Failed to extract tasks:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/scheduler/history', async (req, res) => {
    try {
        const postData = req.body;

        const newEntry = {
            ...postData,
            id: postData.id || `sched-${Date.now()}`,
            recordedAt: postData.recordedAt || Date.now(),
        };

        await appendJsonl('scheduler_history.jsonl', newEntry);
        res.status(201).json(newEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/scheduler/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const history = await readJsonl('scheduler_history.jsonl');
        const index = history.findIndex(h => h.id === id);

        if (index !== -1) {
            history[index] = {
                ...history[index],
                ...updates,
                id: history[index].id,
            };

            await writeJsonl('scheduler_history.jsonl', history);
            res.json(history[index]);
        } else {
            res.status(404).json({ message: 'Scheduler history item not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/scheduler/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const history = await readJsonl('scheduler_history.jsonl');
        const filtered = history.filter(h => h.id !== id);

        await writeJsonl('scheduler_history.jsonl', filtered);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Planning Workspace Endpoints ---

const getPlanningDir = () => {
    return path.join(DATA_DIR, 'planning');
};


function isPathInside(baseDir, targetPath) {
    const relativePath = path.relative(baseDir, targetPath);
    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizePlanningSubPath(rawPath = '') {
    return String(rawPath || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .split('/')
        .map(part => part.trim())
        .filter(part => part && part !== '.' && part !== '..')
        .join('/');
}

function sanitizeMarkdownFilename(rawName = '') {
    const cleanBase = String(rawName || '')
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/\.md$/i, '')
        .replace(/[^a-z0-9-_ ]/gi, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

    const filename = cleanBase || `market-research-${Date.now()}`;
    return `${filename}.md`;
}

function resolvePlanningPath(subPath = '') {
    const planningDir = path.resolve(getPlanningDir());
    const normalizedSubPath = normalizePlanningSubPath(subPath);
    const targetPath = path.resolve(planningDir, normalizedSubPath);

    if (!isPathInside(planningDir, targetPath)) {
        const error = new Error('Access denied: Directory traversal detected.');
        error.status = 403;
        throw error;
    }

    return {
        planningDir,
        normalizedSubPath,
        targetPath,
    };
}

app.get('/planning/directories', async (req, res) => {
    try {
        const planningDir = path.resolve(getPlanningDir());
        await fs.mkdir(planningDir, { recursive: true });

        const directories = [''];

        async function walk(relativeDir = '') {
            const currentDir = path.resolve(planningDir, relativeDir);
            if (!isPathInside(planningDir, currentDir)) return;

            const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const childRelative = path.join(relativeDir, entry.name).replace(/\\/g, '/');
                directories.push(childRelative);
                await walk(childRelative);
            }
        }

        await walk('');

        res.json({
            success: true,
            directories: [...new Set(directories)].sort((a, b) => a.localeCompare(b)),
        });
    } catch (error) {
        console.error('Failed to read planning directories:', error);
        res.status(error.status || 500).json({ error: error.message });
    }
});

// 1. List files and folders
app.get('/planning/files', async (req, res) => {
    try {
        const subPath = req.query.path || '';
        const planningDir = getPlanningDir();
        const targetDir = path.resolve(planningDir, subPath);

        // Security check: prevent directory traversal
        if (!targetDir.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied: Directory traversal detected.' });
        }

        await fs.mkdir(targetDir, { recursive: true });
        const items = await fs.readdir(targetDir, { withFileTypes: true });
        
        const files = [];
        for (const item of items) {
            const itemRelativePath = path.join(subPath, item.name).replace(/\\/g, '/');
            const itemFullPath = path.join(targetDir, item.name);
            
            if (item.isDirectory()) {
                files.push({
                    name: item.name,
                    path: itemRelativePath,
                    type: 'directory'
                });
            } else {
                const ext = path.extname(item.name).toLowerCase().slice(1);
                const stats = await fs.stat(itemFullPath);
                files.push({
                    name: item.name,
                    path: itemRelativePath,
                    type: 'file',
                    fileType: ext,
                    size: stats.size,
                    updatedAt: stats.mtimeMs
                });
            }
        }

        res.json({ success: true, files });
    } catch (error) {
        console.error('Failed to read planning files:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Create a folder
app.post('/planning/folder', async (req, res) => {
    try {
        const { path: folderPath } = req.body;
        if (!folderPath) {
            return res.status(400).json({ error: 'Folder path is required.' });
        }

        const planningDir = getPlanningDir();
        const targetDir = path.resolve(planningDir, folderPath);

        if (!targetDir.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        await fs.mkdir(targetDir, { recursive: true });
        res.json({ success: true, message: 'Folder created successfully.' });
    } catch (error) {
        console.error('Failed to create folder:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Create or save a file
app.post('/planning/file', async (req, res) => {
    try {
        const { path: filePath, content, isBase64, type } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'File path is required.' });
        }

        const planningDir = getPlanningDir();
        const targetFile = path.resolve(planningDir, filePath);

        if (!targetFile.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        await fs.mkdir(path.dirname(targetFile), { recursive: true });

        const normalizeTextContent = (raw) => {
            if (typeof raw !== 'string') return raw;
            return raw
                .replace(/\\r\\n/g, '\r\n')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t');
        };

        const resolveTextPayload = (raw) => {
            if (typeof raw === 'object' && raw !== null && typeof raw.html === 'string') {
                return normalizeTextContent(raw.html);
            }
            return normalizeTextContent(raw);
        };

        const normalizedContent = !isBase64
            ? resolveTextPayload(content)
            : content;

        if (isBase64) {
            const buffer = Buffer.from(content, 'base64');
            await fs.writeFile(targetFile, buffer);
        } else if (type === 'xlsx' && typeof content === 'object') {
            const wb = XLSX.utils.book_new();
            const sheetData = content.data || [[]];
            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            XLSX.utils.book_append_sheet(wb, ws, content.sheetName || 'Sheet1');
            const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            await fs.writeFile(targetFile, fileBuffer);
        } else if (type === 'docx') {
            const htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${typeof normalizedContent === 'object' && normalizedContent !== null && normalizedContent.title ? normalizedContent.title : 'Plan Document'}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.6; margin: 1in; }
h1 { font-family: 'Calibri Light', sans-serif; color: #1F4E78; font-size: 24pt; border-bottom: 2px solid #1F4E78; padding-bottom: 6px; margin-bottom: 18pt; }
h2 { font-family: 'Calibri Light', sans-serif; color: #2E74B5; font-size: 18pt; margin-top: 18pt; margin-bottom: 12pt; }
h3 { font-family: 'Calibri', sans-serif; color: #5B9BD5; font-size: 14pt; margin-top: 12pt; margin-bottom: 6pt; }
p, li { font-size: 11pt; color: #333333; }
table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
th, td { border: 1px solid #D3D3D3; padding: 8px; text-align: left; }
th { background-color: #F2F2F2; font-weight: bold; }
</style>
</head>
<body>
${typeof normalizedContent === 'object' && normalizedContent !== null && typeof normalizedContent.html === 'string' ? normalizedContent.html : normalizedContent}
</body>
</html>`;
            await fs.writeFile(targetFile, htmlContent, 'utf-8');
        } else if (type === 'html') {
            await fs.writeFile(targetFile, typeof normalizedContent === 'string' ? normalizedContent : (typeof normalizedContent === 'object' && normalizedContent !== null && typeof normalizedContent.html === 'string' ? normalizedContent.html : ''), 'utf-8');
        } else if (type === 'pdf') {
            let pdfSaved = false;
            try {
                const { BrowserWindow } = await import('electron');
                const win = new BrowserWindow({ show: false });
                const htmlWrapper = `
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap');
                            body { font-family: 'Space Grotesk', sans-serif; padding: 40px; background-color: #FFFDF5; color: #000000; line-height: 1.6; }
                            h1, h2, h3 { font-weight: 900; text-transform: uppercase; margin-top: 24px; }
                            h1 { font-size: 32px; border-bottom: 8px solid #000000; padding-bottom: 8px; margin-bottom: 24px; }
                            h2 { font-size: 24px; border-bottom: 4px solid #000000; padding-bottom: 4px; }
                            table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 4px solid #000000; box-shadow: 4px 4px 0px #000000; background: #ffffff; }
                            th, td { border: 2px solid #000000; padding: 12px; text-align: left; }
                            th { background: #FFD93D; font-weight: bold; text-transform: uppercase; }
                            pre { background: #000000; color: #ffffff; padding: 16px; border: 4px solid #000000; }
                        </style>
                    </head>
                    <body>
                        ${content.html || content}
                    </body>
                    </html>
                `;
                
                await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlWrapper)}`);
                const pdfBuffer = await win.webContents.printToPDF({
                    printBackground: true,
                    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
                });
                await fs.writeFile(targetFile, pdfBuffer);
                win.close();
                pdfSaved = true;
            } catch (e) {
                console.warn('printToPDF failed, saving as HTML-renamed-to-PDF...', e);
            }
            
            if (!pdfSaved) {
                await fs.writeFile(targetFile, normalizedContent.html || normalizedContent, 'utf-8');
            }
        } else {
            await fs.writeFile(targetFile, normalizedContent, 'utf-8');
        }

        res.json({ success: true, message: 'File saved successfully.' });
    } catch (error) {
        console.error('Failed to save file:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Read file content
app.get('/planning/file/content', async (req, res) => {
    try {
        const { path: filePath } = req.query;
        if (!filePath) {
            return res.status(400).json({ error: 'File path is required.' });
        }

        const planningDir = getPlanningDir();
        const targetFile = path.resolve(planningDir, filePath);

        if (!targetFile.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const ext = path.extname(targetFile).toLowerCase().slice(1);
        const exists = await fs.access(targetFile).then(() => true).catch(() => false);
        
        if (!exists) {
            return res.status(404).json({ error: 'File not found.' });
        }

        if (ext === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            return res.sendFile(targetFile);
        }

        const fileBuffer = await fs.readFile(targetFile);

        if (ext === 'xlsx') {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheets = {};
            workbook.SheetNames.forEach(name => {
                const sheet = workbook.Sheets[name];
                sheets[name] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            });
            return res.json({ success: true, fileType: 'xlsx', sheets });
        } else if (ext === 'docx') {
            const textContent = fileBuffer.toString('utf-8');
            if (textContent.includes('<html') && textContent.includes('w:WordDocument')) {
                const bodyMatch = textContent.match(/<body>([\s\S]*)<\/body>/i);
                const htmlContent = bodyMatch ? bodyMatch[1] : textContent;
                return res.json({ success: true, fileType: 'docx', html: htmlContent });
            }

            try {
                const result = await mammoth.convertToHtml({ buffer: fileBuffer });
                return res.json({ success: true, fileType: 'docx', html: result.value });
            } catch (err) {
                console.error('Mammoth failed, falling back to raw HTML', err);
                return res.json({ success: true, fileType: 'docx', html: `<p>${textContent.slice(0, 1000)}</p>` });
            }
        } else if (ext === 'csv') {
            const csvText = fileBuffer.toString('utf-8');
            const lines = csvText.split('\n');
            const data = lines.map(line => {
                return line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, ''));
            }).filter(row => row.length > 0 && row.some(cell => cell));

            return res.json({ success: true, fileType: 'csv', data });
        } else if (ext === 'html') {
            const htmlContent = fileBuffer.toString('utf-8');
            return res.json({ success: true, fileType: 'html', html: htmlContent });
        } else {
            const textContent = fileBuffer.toString('utf-8');
            return res.json({ success: true, fileType: ext, content: textContent });
        }
    } catch (error) {
        console.error('Failed to read file content:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Delete folder or file
app.delete('/planning/item', async (req, res) => {
    try {
        const { path: itemPath } = req.body;
        if (!itemPath) {
            return res.status(400).json({ error: 'Item path is required.' });
        }

        const planningDir = getPlanningDir();
        const targetItem = path.resolve(planningDir, itemPath);

        if (!targetItem.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const stats = await fs.stat(targetItem);
        if (stats.isDirectory()) {
            await fs.rm(targetItem, { recursive: true, force: true });
        } else {
            await fs.unlink(targetItem);
        }

        res.json({ success: true, message: 'Item deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete item:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Rename/move file or folder
app.post('/planning/rename', async (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) {
            return res.status(400).json({ error: 'Old path and new path are required.' });
        }

        const planningDir = getPlanningDir();
        const sourceItem = path.resolve(planningDir, oldPath);
        const destItem = path.resolve(planningDir, newPath);

        if (!sourceItem.startsWith(planningDir) || !destItem.startsWith(planningDir)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        await fs.mkdir(path.dirname(destItem), { recursive: true });
        await fs.rename(sourceItem, destItem);
        
        res.json({ success: true, message: 'Item renamed successfully.' });
    } catch (error) {
        console.error('Failed to rename item:', error);
        res.status(500).json({ error: error.message });
    }
});

// 7. Search planning workspace (Obsidian style)
app.post('/planning/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const planningDir = getPlanningDir();
        const results = [];
        const lowerQuery = query.toLowerCase();

        // Helper to recursively read all files
        const searchDir = async (dirPath, relativeBase) => {
            const items = await fs.readdir(dirPath, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dirPath, item.name);
                const itemRelativePath = path.join(relativeBase, item.name).replace(/\\/g, '/');
                
                if (item.isDirectory()) {
                    await searchDir(fullPath, itemRelativePath);
                } else if (item.isFile() && item.name.endsWith('.md')) {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const lowerContent = content.toLowerCase();
                    const lowerName = item.name.toLowerCase();

                    if (lowerContent.includes(lowerQuery) || lowerName.includes(lowerQuery)) {
                        // Extract tags (e.g., #strategy)
                        const tags = [...new Set(content.match(/(?<=^|\s)#[a-zA-Z0-9_-]+/g) || [])];
                        // Extract links (e.g., [[filename]])
                        const links = [...new Set(content.match(/\[\[(.*?)\]\]/g) || [])].map(l => l.replace(/\[\[|\]\]/g, ''));
                        
                        // Grab a small snippet around the first match
                        let snippet = '';
                        const index = lowerContent.indexOf(lowerQuery);
                        if (index !== -1) {
                            const start = Math.max(0, index - 30);
                            const end = Math.min(content.length, index + query.length + 30);
                            snippet = content.substring(start, end).replace(/\n/g, ' ').trim();
                            if (start > 0) snippet = '...' + snippet;
                            if (end < content.length) snippet = snippet + '...';
                        }

                        results.push({
                            path: itemRelativePath,
                            name: item.name,
                            snippet,
                            tags,
                            links
                        });
                    }
                }
            }
        };

        await searchDir(planningDir, '');
        res.json({ success: true, results });
    } catch (error) {
        console.error('Failed to search workspace:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Board Endpoints ---

const BOARDS_DIR = path.join(DATA_DIR, 'boards');

// Ensure boards directory exists
async function ensureBoardsDir() {
    try {
        await fs.mkdir(BOARDS_DIR, { recursive: true });
    } catch (e) {
        console.warn('Unable to create boards directory:', e);
    }
}

app.get('/boards', async (req, res) => {
    try {
        await ensureBoardsDir();
        const files = await fs.readdir(BOARDS_DIR);
        const boards = files
            .filter(f => f.endsWith('.json'))
            .map(f => path.basename(f, '.json'));
        
        // Ensure default is always present
        if (!boards.includes('default')) {
            boards.unshift('default');
        }
        res.json({ success: true, boards });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/boards/:name', async (req, res) => {
    try {
        await ensureBoardsDir();
        const boardPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        try {
            const data = await fs.readFile(boardPath, 'utf-8');
            res.json(JSON.parse(data));
        } catch (e) {
            if (e.code === 'ENOENT') {
                // Return default state if not found
                res.json({
                    cards: [],
                    connectors: [],
                    tool: 'select',
                    isFocusMode: false,
                    viewport: { x: 240, y: 130, scale: 1 }
                });
            } else {
                throw e;
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/boards/:name', async (req, res) => {
    try {
        await ensureBoardsDir();
        const boardPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        await fs.writeFile(boardPath, JSON.stringify(req.body, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/boards/:name', async (req, res) => {
    try {
        await ensureBoardsDir();
        const boardPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        try {
            await fs.unlink(boardPath);
        } catch (e) {
            // Ignore if it doesn't exist
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/boards/:name/rename', async (req, res) => {
    try {
        await ensureBoardsDir();
        const oldPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        const newPath = path.join(BOARDS_DIR, `${req.body.newName}.json`);
        
        try {
            await fs.rename(oldPath, newPath);
            res.json({ success: true });
        } catch (e) {
            if (e.code === 'ENOENT') {
                res.status(404).json({ error: 'Source board not found.' });
            } else {
                throw e;
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- Ads and Market Research Scraper Endpoints ---
// These routes run inside the main local backend, so use http://localhost:3001/api/market-research.
// Use only for data you are allowed to access and in a way that respects each platform's terms and technical controls.
const MARKET_RESEARCH_DEFAULTS = {
    headless: true,
    maxItems: 50,
    maxScrolls: 20,
    scrollDelayMs: 700,
    waitAfterGotoMs: 1200,
    country: 'PH',
    status: 'active',
    timeframe: '30d',
};

const MARKET_SOURCE_KEYS = ['meta', 'google_trends', 'tiktok_ads', 'reddit'];

function pickResearchValue(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : value;
}

function asResearchInt(value, fallback, min, max) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function asResearchBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    return Boolean(value);
}

function normalizeResearchSources(value, fallbackSources = MARKET_SOURCE_KEYS) {
    if (Array.isArray(value)) {
        const clean = value.map(item => String(item).trim()).filter(item => MARKET_SOURCE_KEYS.includes(item));
        return clean.length ? [...new Set(clean)] : fallbackSources;
    }

    if (value && typeof value === 'object') {
        const clean = MARKET_SOURCE_KEYS.filter(source => value[source] === true);
        return clean.length ? clean : fallbackSources;
    }

    return fallbackSources;
}

function normalizeResearchText(value, fallback = '') {
    if (typeof value === 'string' && value.trim()) return value.replace(/\s+/g, ' ').trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function parseResearchNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return fallback;

    const normalized = value.toLowerCase().replace(/,/g, '').trim();
    const match = normalized.match(/[-+]?\d*\.?\d+/);
    if (!match) return fallback;

    const base = Number(match[0]);
    if (!Number.isFinite(base)) return fallback;
    if (normalized.includes('m')) return Math.round(base * 1000000);
    if (normalized.includes('k')) return Math.round(base * 1000);
    return Math.round(base);
}

function cleanAntiXssiPrefix(text) {
    return String(text || '').replace(/^\)\]\}',?\s*/, '').trim();
}

async function fetchJsonWithPrefix(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    const clean = cleanAntiXssiPrefix(text);
    const data = clean ? JSON.parse(clean) : {};

    if (!response.ok || data?.error) {
        const message = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(message);
    }

    return data;
}

async function getStoredAISettings() {
    const settings = await readJsonl('settings.jsonl');
    return settings.find(item => item.type === 'ai') || { type: 'ai', provider: 'local' };
}

function extractJsonObjectFromText(text) {
    if (!text) return null;

    const fencedMatch = String(text).match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch ? fencedMatch[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) return null;

    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch (error) {
        return null;
    }
}

function getAISettingValue(aiSettings, pathCandidates = []) {
    for (const pathCandidate of pathCandidates) {
        const parts = pathCandidate.split('.');
        let current = aiSettings;
        for (const part of parts) {
            current = current?.[part];
        }
        if (current !== undefined && current !== null && String(current).trim()) return current;
    }
    return '';
}

async function callConfiguredAI(prompt) {
    const aiSettings = await getStoredAISettings();
    const provider = String(aiSettings.provider || 'local').toLowerCase();

    if (provider === 'gemini') {
        const apiKey = String(getAISettingValue(aiSettings, ['cloud.apiKey', 'apiKey']) || process.env.GEMINI_API_KEY || '').trim();
        const model = String(getAISettingValue(aiSettings, ['cloud.model', 'model']) || 'gemini-2.0-flash').trim();

        if (!apiKey) throw new Error('Gemini API key is not configured in AI settings.');

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.35, responseMimeType: 'application/json' },
                }),
            }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
            throw new Error(data?.error?.message || `Gemini returned HTTP ${response.status}`);
        }

        const text = (data.candidates || [])
            .flatMap(candidate => candidate?.content?.parts || [])
            .map(part => part?.text || '')
            .join('\n')
            .trim();

        return { text, provider: 'gemini', model };
    }

    if (provider === 'openai') {
        const apiKey = String(getAISettingValue(aiSettings, ['cloud.apiKey', 'apiKey']) || process.env.OPENAI_API_KEY || '').trim();
        const model = String(getAISettingValue(aiSettings, ['cloud.model', 'model']) || 'gpt-4o').trim();

        if (!apiKey) throw new Error('OpenAI API key is not configured in AI settings.');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.35,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'You are a precise ads and market research analyst. Return valid JSON only.' },
                    { role: 'user', content: prompt },
                ],
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
            throw new Error(data?.error?.message || `OpenAI returned HTTP ${response.status}`);
        }

        return {
            text: data.choices?.[0]?.message?.content || '',
            provider: 'openai',
            model,
        };
    }

    const endpoint = String(getAISettingValue(aiSettings, ['local.endpoint', 'endpoint']) || process.env.LOCAL_AI_ENDPOINT || '').trim();
    const model = String(getAISettingValue(aiSettings, ['local.model', 'model']) || process.env.LOCAL_AI_MODEL || '').trim();

    if (!endpoint) {
        throw new Error('Local AI endpoint is not configured in AI settings.');
    }

    const normalizedEndpoint = endpoint.replace(/\/$/, '');
    let body;
    let targetEndpoint = endpoint;

    if (normalizedEndpoint.includes('/api/generate')) {
        body = { model, prompt, stream: false, format: 'json' };
    } else if (normalizedEndpoint.includes('/api/chat')) {
        body = {
            model,
            stream: false,
            format: 'json',
            messages: [{ role: 'user', content: prompt }],
        };
    } else {
        targetEndpoint = normalizedEndpoint.endsWith('/chat/completions')
            ? normalizedEndpoint
            : `${normalizedEndpoint}/chat/completions`;
        body = {
            model,
            temperature: 0.35,
            stream: false,
            messages: [
                { role: 'system', content: 'You are a precise ads and market research analyst. Return valid JSON only.' },
                { role: 'user', content: prompt },
            ],
        };
    }

    const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
        throw new Error(data?.error?.message || data?.message || `Local AI returned HTTP ${response.status}`);
    }

    const text =
        data.choices?.[0]?.message?.content ||
        data.message?.content ||
        data.response ||
        data.content ||
        '';

    return { text, provider: 'local', model: model || 'local-model' };
}

function getTimeframeForGoogleTrends(timeframe) {
    switch (String(timeframe || '').toLowerCase()) {
        case '7d': return 'now 7-d';
        case '30d': return 'today 1-m';
        case '90d': return 'today 3-m';
        case '12m': return 'today 12-m';
        case '5y': return 'today 5-y';
        default: return 'today 1-m';
    }
}

function getTikTokPeriod(timeframe) {
    switch (String(timeframe || '').toLowerCase()) {
        case '7d': return 7;
        case '90d': return 90;
        case '12m': return 180;
        case '5y': return 180;
        default: return 30;
    }
}

function buildGoogleTrendsUrl(keyword) {
    return `https://trends.google.com/trends/explore?date=now%201-d&q=${encodeURIComponent(keyword)}&hl=en-US`;
}

async function scrapeGoogleTrendsResearch({ niche, headless = true }) {
    const keyword = normalizeResearchText(niche);
    if (!keyword) {
        return null;
    }

    const url = buildGoogleTrendsUrl(keyword);
    let browser;

    try {
        browser = await chromium.launch({
            headless,
            args: [
                '--disable-dev-shm-usage',
                '--disable-quic',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--allow-running-insecure-content',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1365, height: 950 },
            locale: 'en-US',
            ignoreHTTPSErrors: true,
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        });

        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Google Trends renders the query tables client-side. Do not call any Google Trends JSON/API URL here.
        await page.waitForSelector(
            'div[data-section="top-searches"] table[aria-label="Top queries"], div[data-section="rising-searches"] table[aria-label="Rising queries"], table[aria-label="Top queries"], table[aria-label="Rising queries"]',
            { timeout: 60000 }
        ).catch(() => null);

        await page.waitForTimeout(1800);

        const scraped = await page.evaluate(() => {
            const normalize = value => (value || '').replace(/\s+/g, ' ').trim();

            const parseInterest = value => {
                const text = normalize(value);
                if (!text) return null;
                if (/less than\s+1/i.test(text)) return 0;

                const match = text.match(/[\d.,]+/);
                if (!match) return null;

                const number = Number(match[0].replace(/,/g, ''));
                return Number.isFinite(number) ? number : null;
            };

            const parseTable = (selector, type) => {
                const table = document.querySelector(selector);
                if (!table) return [];

                const rows = Array.from(
                    table.querySelectorAll('tbody[jsname="cC57zf"] tr, tbody:not([aria-hidden="true"]) tr')
                );

                return rows
                    .map(row => {
                        const indexText = normalize(row.querySelector('td:first-child')?.textContent);
                        const query =
                            normalize(row.querySelector('.Z9Uqw')?.textContent) ||
                            normalize(row.querySelector('[data-query]')?.getAttribute('data-query')) ||
                            '';

                        const interestNode = row.querySelector('.GaWfqe');
                        const interestText =
                            normalize(interestNode?.getAttribute('title')) ||
                            normalize(interestNode?.getAttribute('aria-label')).replace(/^Search interest:\s*/i, '') ||
                            '';

                        const change = normalize(row.querySelector('.VYi2zf span')?.textContent);

                        return {
                            type,
                            index: Number(indexText) || null,
                            query,
                            searchInterestText: interestText,
                            searchInterest: parseInterest(interestText),
                            change,
                        };
                    })
                    .filter(item => item.query);
            };

            const topQueries = parseTable(
                'div[data-section="top-searches"] table[aria-label="Top queries"], table[aria-label="Top queries"]',
                'top'
            );

            const risingQueries = parseTable(
                'div[data-section="rising-searches"] table[aria-label="Rising queries"], table[aria-label="Rising queries"]',
                'rising'
            );

            return { topQueries, risingQueries };
        });

        const interestValues = [
            ...scraped.topQueries,
            ...scraped.risingQueries,
        ]
            .map(item => Number(item.searchInterest || 0))
            .filter(value => Number.isFinite(value));

        const averageInterest = interestValues.length
            ? Math.round(interestValues.reduce((sum, value) => sum + value, 0) / interestValues.length)
            : 0;

        const peakInterest = interestValues.length ? Math.max(...interestValues) : 0;
        const latestInterest = scraped.risingQueries[0]?.searchInterest || scraped.topQueries[0]?.searchInterest || 0;

        return {
            keyword,
            url,
            averageInterest,
            peakInterest,
            latestInterest,
            timeline: [],
            topQueries: scraped.topQueries.map(item => item.query),
            risingQueries: scraped.risingQueries.map(item => item.query),
            topQueryDetails: scraped.topQueries,
            risingQueryDetails: scraped.risingQueries,
            queryCount: scraped.topQueries.length + scraped.risingQueries.length,
            tableSelectors: {
                top: 'table[aria-label="Top queries"]',
                rising: 'table[aria-label="Rising queries"]',
            },
        };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

async function scrapeMetaAdsResearch({ niche, country, status, maxItems, maxScrolls, headless, scrollDelayMs, platform }) {
    const mediaSeen = new Set();
    let browser;

    browser = await chromium.launch({
        headless,
        args: [
            '--disable-dev-shm-usage',
            '--disable-quic',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--allow-running-insecure-content',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1365, height: 768 },
            locale: 'en-US',
            ignoreHTTPSErrors: true,
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        });

        const page = await context.newPage();

        page.on('response', response => {
            const responseUrl = response.url();
            if (/\.(mp4|webm|jpg|jpeg|png|webp)(\?|$)/i.test(responseUrl)) {
                mediaSeen.add(responseUrl);
            }
        });

        const targetUrl =
            `https://www.facebook.com/ads/library/?active_status=${encodeURIComponent(status)}` +
            `&ad_type=all&country=${encodeURIComponent(country)}` +
            `&q=${encodeURIComponent(niche)}` +
            '&search_type=keyword_unordered';

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(MARKET_RESEARCH_DEFAULTS.waitAfterGotoMs);
        await page.waitForSelector('span:has-text("Library ID:")', { timeout: 20000 });

        for (let i = 0; i < maxScrolls; i++) {
            await page.mouse.wheel(0, 1700);
            await page.waitForTimeout(scrollDelayMs);

            const libraryCount = await page.locator('span:has-text("Library ID:")').count();
            if (libraryCount >= maxItems) break;
        }

        const ads = await page.evaluate(({ maxAds: evaluateMaxAds, selectedPlatform }) => {
            const normalize = value => (value || '').replace(/\s+/g, ' ').trim();

            const parseImpressions = text => {
                const normalizedText = normalize(text);
                if (!normalizedText) return { impressionText: '', impressionValue: null };
                if (normalizedText.includes('<')) return { impressionText: normalizedText, impressionValue: null };

                const compactNumberMatch = normalizedText.toLowerCase().match(/^([\d.,]+)\s*([km])$/);
                if (compactNumberMatch) {
                    const numericValue = parseFloat(compactNumberMatch[1].replace(/,/g, ''));
                    const multiplier = compactNumberMatch[2] === 'k' ? 1000 : 1000000;
                    return {
                        impressionText: normalizedText,
                        impressionValue: Number.isFinite(numericValue) ? Math.round(numericValue * multiplier) : null,
                    };
                }

                const digits = normalizedText.replace(/[^0-9]/g, '');
                return {
                    impressionText: normalizedText,
                    impressionValue: digits ? parseInt(digits, 10) : null,
                };
            };

            const mapPlatform = style => {
                if (style.includes('-2812px')) return 'Facebook';
                if (style.includes('-270px')) return 'Instagram';
                if (style.includes('-710px')) return 'Messenger';
                if (style.includes('-736px')) return 'Audience Network';
                return 'Unknown';
            };

            const getCardRoot = librarySpan => {
                let node = librarySpan.closest('div');
                for (let i = 0; i < 14 && node; i++) {
                    const hasLogo = Boolean(node.querySelector('img._8nqq.img'));
                    const hasImpressions = /Impressions:/i.test(node.innerText || '');
                    const hasMedia =
                        Boolean(node.querySelector('video')) ||
                        Boolean(node.querySelector('[data-testid="ad-content-body-video-container"]'));

                    if (hasLogo && (hasImpressions || hasMedia)) return node;
                    node = node.parentElement;
                }

                return librarySpan.closest('.xh8yej3') || librarySpan.closest('div') || document.body;
            };

            const findFirstText = (root, predicate) => {
                const nodes = Array.from(root.querySelectorAll('span, div'));
                const hit = nodes.find(node => predicate(normalize(node.textContent)));
                return hit ? normalize(hit.textContent) : '';
            };

            const getPlatforms = card => {
                const platformsLabel = Array.from(card.querySelectorAll('span')).find(
                    span => normalize(span.textContent) === 'Platforms'
                );

                let scope = card;
                if (platformsLabel) {
                    const section = platformsLabel.closest('div');
                    scope = section?.parentElement || section || card;
                }

                const icons = Array.from(scope.querySelectorAll('div[role="presentation"] .xtwfq29'));
                const styles = icons.map(icon => normalize(icon.getAttribute('style') || ''));
                return [...new Set(styles.map(mapPlatform))].filter(platformName => platformName !== 'Unknown');
            };

            const getStatus = card => {
                const textStatus = findFirstText(card, text => text === 'Active' || text === 'Inactive');
                if (textStatus) return textStatus.toUpperCase();

                const blob = normalize(card.innerText || '');
                if (blob.includes('Active')) return 'ACTIVE';
                if (blob.includes('Inactive')) return 'INACTIVE';
                return 'UNKNOWN';
            };

            const getStartDate = card => {
                const startedLine = findFirstText(card, text => text.toLowerCase().startsWith('started running on'));
                return startedLine.replace(/^Started running on\s*/i, '').trim();
            };

            const getImpressions = card => {
                const container = Array.from(card.querySelectorAll('div, span')).find(node =>
                    /Impressions:/i.test(normalize(node.textContent))
                );
                const strong = container?.querySelector('strong');
                return parseImpressions(strong?.textContent || '');
            };

            const getBrand = card => {
                const logoElement = card.querySelector('img._8nqq.img');
                const brandLogo = logoElement?.getAttribute('src') || '';

                const brandSpan = card.querySelector('a[href*="facebook.com/"] span') || card.querySelector('a span');
                const brandName = normalize(brandSpan?.textContent) || 'Unknown';

                const advertiserLinkElement = card.querySelector('a[href*="facebook.com/"]');
                const advertiserUrl = advertiserLinkElement?.getAttribute('href') || '';

                return { brandName, brandLogo, advertiserUrl };
            };

            const getCaption = card => {
                const captionElement =
                    card.querySelector('div._7jyr') ||
                    card.querySelector('div._7jyr._a25-') ||
                    card.querySelector('div[style*="white-space: pre-wrap"]')?.closest('div');

                let caption = normalize(captionElement?.innerText || '');

                if (!caption) {
                    const mediaRoot =
                        card.querySelector('[data-testid="ad-content-body-video-container"]') ||
                        card.querySelector('div[data-testid*="ad-content"]') ||
                        card;

                    const candidates = Array.from(mediaRoot.querySelectorAll('div, span'))
                        .map(node => normalize(node.textContent))
                        .filter(text => text && text.length >= 25);

                    const noise = ['Low impression count', 'Sponsored', 'Platforms', 'See ad details', 'Open Dropdown'];
                    const filtered = candidates.filter(text => !noise.some(noiseItem => text.includes(noiseItem)));
                    caption = filtered.sort((a, b) => b.length - a.length)[0] || '';
                }

                return caption;
            };

            const getMedia = card => {
                const mediaRoot =
                    card.querySelector('[data-testid="ad-content-body-video-container"]') ||
                    card.querySelector('div[data-testid*="ad-content"]') ||
                    card;

                const video = mediaRoot.querySelector('video');
                if (video) {
                    const poster = video.getAttribute('poster') || '';
                    const src = video.getAttribute('src') || video.currentSrc || '';
                    const sources = Array.from(video.querySelectorAll('source'))
                        .map(source => source.getAttribute('src'))
                        .filter(Boolean);

                    return { type: 'video', poster, src, sources };
                }

                const images = Array.from(mediaRoot.querySelectorAll('img'))
                    .map(image => ({
                        src: image.getAttribute('src') || '',
                        alt: image.getAttribute('alt') || '',
                        w: image.naturalWidth || 0,
                        h: image.naturalHeight || 0,
                    }))
                    .filter(image => image.src);

                const bigImages = images.filter(image => (image.w >= 200 && image.h >= 200) || /scontent/i.test(image.src));
                const bestImage = bigImages[0] || images[0];

                if (bestImage) return { type: 'image', src: bestImage.src, alt: bestImage.alt };
                return { type: 'unknown' };
            };

            const platformMatchesSelection = platforms => {
                if (!selectedPlatform || selectedPlatform === 'all') return true;
                const wanted = selectedPlatform.replace(/_/g, ' ').toLowerCase();
                return platforms.some(platformName => platformName.toLowerCase() === wanted);
            };

            const librarySpans = Array.from(document.querySelectorAll('span')).filter(element =>
                normalize(element.textContent).startsWith('Library ID:')
            );

            const output = [];
            for (const librarySpan of librarySpans) {
                if (output.length >= evaluateMaxAds) break;

                const card = getCardRoot(librarySpan);
                if (!card) continue;

                const id = normalize(librarySpan.textContent).replace('Library ID:', '').trim();
                const { brandName, brandLogo, advertiserUrl } = getBrand(card);
                const status = getStatus(card);
                const startDate = getStartDate(card);
                const { impressionText, impressionValue } = getImpressions(card);
                const platforms = getPlatforms(card);
                if (!platformMatchesSelection(platforms)) continue;

                const caption = getCaption(card);
                const media = getMedia(card);

                output.push({
                    id,
                    brandName,
                    brandLogo,
                    advertiserUrl,
                    status,
                    startDate,
                    impressionText,
                    impressionValue,
                    impressionCount: impressionValue || 0,
                    impressionCountText: impressionText,
                    platforms: platforms.length ? platforms : ['Meta'],
                    caption,
                    adCopy: caption,
                    imageUrl: media?.src || media?.poster || brandLogo || '',
                    media,
                    source: 'Meta Ads Library',
                });
            }

            return output;
        }, { maxAds: maxItems, selectedPlatform: platform });

        const mediaArray = Array.from(mediaSeen);
        const mp4s = mediaArray.filter(url => /\.mp4(\?|$)/i.test(url));
        const images = mediaArray.filter(url => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url));

        const fixedAds = ads.map(ad => {
            const media = ad.media || { type: 'unknown' };

            if (media.type === 'video') {
                const hasDirect =
                    Boolean(media.src && media.src.length > 0) ||
                    Boolean(Array.isArray(media.sources) && media.sources.length > 0);

                if (!hasDirect && mp4s.length) {
                    return {
                        ...ad,
                        media: {
                            ...media,
                            src: media.src || mp4s[0],
                            sources: Array.isArray(media.sources) && media.sources.length ? media.sources : [mp4s[0]],
                            note: 'video src filled from network fallback, not guaranteed 1:1 per card',
                        },
                    };
                }
            }

            if (media.type === 'unknown' && images.length) {
                return {
                    ...ad,
                    media: {
                        type: 'image',
                        src: images[0],
                        alt: '',
                        note: 'image filled from network fallback, not guaranteed 1:1 per card',
                    },
                    imageUrl: images[0],
                };
            }

            return ad;
        });

        return {
            url: targetUrl,
            count: fixedAds.length,
            networkMediaCount: mediaSeen.size,
            items: fixedAds,
        };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}


function normalizeUnixSeconds(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed > 9999999999 ? Math.floor(parsed / 1000) : Math.floor(parsed);
}

function getTikTokUnixRange({ timeframe, startTime, endTime }) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const periodDays = getTikTokPeriod(timeframe);
    const fallbackStart = nowSeconds - (periodDays * 24 * 60 * 60);

    return {
        startTime: normalizeUnixSeconds(startTime, fallbackStart),
        endTime: normalizeUnixSeconds(endTime, nowSeconds),
    };
}

function normalizeUnixMilliseconds(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed < 9999999999 ? Math.floor(parsed * 1000) : Math.floor(parsed);
}

function getTikTokMillisecondRange({ timeframe, startTime, endTime }) {
    const nowMs = Date.now();
    const periodDays = getTikTokPeriod(timeframe);
    const fallbackStart = nowMs - (periodDays * 24 * 60 * 60 * 1000);

    return {
        startTime: normalizeUnixMilliseconds(startTime, fallbackStart),
        endTime: normalizeUnixMilliseconds(endTime, nowMs),
    };
}

function resolveTikTokRegion({ region, country }) {
    return normalizeResearchText(region || country, 'all').toLowerCase() === 'all'
        ? 'all'
        : normalizeResearchText(region || country, 'all').toUpperCase();
}

function buildTikTokApiUrl({ niche, country, timeframe, startTime, endTime, region }) {
    const resolvedRegion = resolveTikTokRegion({ region, country });
    const range = getTikTokUnixRange({ timeframe, startTime, endTime });
    const query = new URLSearchParams({
        region: resolvedRegion,
        type: '1',
        start_time: String(range.startTime),
        end_time: String(range.endTime),
    });

    if (niche) {
        query.set('keyword', niche);
        query.set('q', niche);
        query.set('adv_name', niche);
    }

    return `https://library.tiktok.com/api/v1/search?${query.toString()}`;
}

function buildTikTokAdsPageUrl({ niche, country, timeframe, startTime, endTime, region }) {
    const resolvedRegion = resolveTikTokRegion({ region, country });
    const range = getTikTokMillisecondRange({ timeframe, startTime, endTime });

    return `https://library.tiktok.com/ads?${new URLSearchParams({
        region: resolvedRegion,
        start_time: String(range.startTime),
        end_time: String(range.endTime),
        adv_name: niche || '',
        adv_biz_ids: '',
        query_type: '1',
        sort_type: 'last_shown_date,desc',
    }).toString()}`;
}

function findFirstArrayDeep(value, maxDepth = 5) {
    if (!value || maxDepth < 0) return [];
    if (Array.isArray(value)) return value;
    if (typeof value !== 'object') return [];

    const preferredKeys = ['materials', 'list', 'items', 'ads', 'data', 'results', 'records'];
    for (const key of preferredKeys) {
        if (Array.isArray(value[key])) return value[key];
    }

    for (const child of Object.values(value)) {
        const found = findFirstArrayDeep(child, maxDepth - 1);
        if (found.length) return found;
    }

    return [];
}

function normalizeTikTokApiItem(rawItem, index) {
    const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
    const metrics = item.metrics || item.stat || item.stats || item.statistics || {};
    const advertiser = item.advertiser || item.author || item.brand || item.user || {};
    const video = item.video || item.video_info || item.videoInfo || {};
    const image = item.image || item.cover || item.cover_image || item.thumbnail || {};

    const brandName = normalizeResearchText(
        item.brandName || item.advertiserName || item.adv_name || item.advertiser_name || advertiser.name || item.name,
        'TikTok Advertiser'
    );

    const adCopy = normalizeResearchText(
        item.adCopy || item.caption || item.text || item.description || item.title || item.video_desc || item.script || item.content,
        ''
    );

    const imageUrl = normalizeResearchText(
        item.imageUrl || item.thumbnailUrl || item.coverUrl || item.cover_url || image.url || image.src || video.cover || video.cover_url,
        ''
    );

    const videoUrl = normalizeResearchText(
        item.videoUrl || item.video_url || item.play_url || item.url || video.url || video.play_url,
        ''
    );

    return {
        id: normalizeResearchText(item.id || item.ad_id || item.material_id || item.item_id, `tiktok-${index + 1}`),
        brandName,
        adCopy,
        imageUrl,
        videoUrl,
        advertiserUrl: normalizeResearchText(item.advertiserUrl || item.landing_page || item.detail_url || item.url, ''),
        metrics: {
            Likes: parseResearchNumber(metrics.like || metrics.likes || item.like_count || item.likes, 0),
            Shares: parseResearchNumber(metrics.share || metrics.shares || item.share_count || item.shares, 0),
            Comments: parseResearchNumber(metrics.comment || metrics.comments || item.comment_count || item.comments, 0),
            Impressions: parseResearchNumber(metrics.impression || metrics.impressions || item.impression_count, 0),
            CTR: normalizeResearchText(metrics.ctr || item.ctr, ''),
            CVR: normalizeResearchText(metrics.cvr || item.cvr, ''),
        },
        raw: item,
        source: 'TikTok Ads Library API',
    };
}


async function clickTikTokSeeMoreButtons(page, maxClicks = 20) {
    let clicks = 0;

    for (let i = 0; i < maxClicks; i++) {
        const button = page.locator([
            'button:has-text("See more")',
            'button:has-text("Load more")',
            'div[role="button"]:has-text("See more")',
            'div[role="button"]:has-text("Load more")',
            'span:has-text("See more")',
            'span:has-text("Load more")',
        ].join(', ')).first();

        const isVisible = await button.isVisible().catch(() => false);
        if (!isVisible) break;

        await button.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400);
        const clicked = await button.click({ timeout: 5000 }).then(() => true).catch(() => false);
        if (!clicked) break;

        clicks++;
        await page.waitForTimeout(1200);
    }

    return clicks;
}

async function scrapeTikTokAdsPageCards({
    niche,
    country,
    timeframe,
    maxItems,
    headless,
    maxScrolls,
    scrollDelayMs,
    startTime,
    endTime,
    region,
}) {
    let browser;
    const targetUrl = buildTikTokAdsPageUrl({
        niche,
        country,
        timeframe,
        startTime,
        endTime,
        region,
    });

    try {
        browser = await chromium.launch({
            headless,
            args: [
                '--disable-dev-shm-usage',
                '--disable-quic',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--allow-running-insecure-content',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1365, height: 900 },
            locale: 'en-US',
            ignoreHTTPSErrors: true,
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        });

        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);
        await page.waitForSelector('.ad_card', { timeout: 30000 }).catch(() => null);

        let lastCardCount = 0;
        let stagnantRounds = 0;
        let seeMoreClickCount = 0;
        const loopLimit = Math.max(1, Number(maxScrolls || 20));

        for (let i = 0; i < loopLimit; i++) {
            const cardCount = await page.locator('.ad_card').count();
            if (cardCount >= maxItems) break;

            seeMoreClickCount += await clickTikTokSeeMoreButtons(page, 3);

            await page.mouse.wheel(0, 1800);
            await page.waitForTimeout(scrollDelayMs || 1200);

            const nextCardCount = await page.locator('.ad_card').count();
            if (nextCardCount === lastCardCount) {
                stagnantRounds++;
            } else {
                stagnantRounds = 0;
            }

            lastCardCount = nextCardCount;
            if (stagnantRounds >= 4) break;
        }

        const items = await page.evaluate(({ maxItems }) => {
            const normalize = value => (value || '').replace(/\s+/g, ' ').trim();

            const parseRangeNumber = value => {
                const text = normalize(value).toLowerCase();
                if (!text) return 0;
                const firstPart = text.split('-')[0] || text;
                const match = firstPart.match(/[\d.]+/);
                if (!match) return 0;
                const number = Number(match[0]);
                if (!Number.isFinite(number)) return 0;
                if (text.includes('m')) return Math.round(number * 1000000);
                if (text.includes('k')) return Math.round(number * 1000);
                return Math.round(number);
            };

            const getBackgroundImageUrl = element => {
                if (!element) return '';
                const style = element.getAttribute('style') || '';
                const match = style.match(/url\(["']?(.*?)["']?\)/i);
                return match ? match[1].replace(/&amp;/g, '&') : '';
            };

            const cards = Array.from(document.querySelectorAll('.ad_card'));

            return cards.slice(0, maxItems).map((card, index) => {
                const link = card.querySelector('a.link');
                const href = link?.getAttribute('href') || '';
                const detailUrl = href ? new URL(href, 'https://library.tiktok.com').toString() : '';
                const idMatch = href.match(/ad_id=([^&]+)/);
                const id = idMatch ? idMatch[1] : `tiktok-card-${index + 1}`;

                const brandName = normalize(card.querySelector('.ad_info_text')?.textContent) || 'TikTok Advertiser';
                const detailRows = Array.from(card.querySelectorAll('.ad_detail li'));
                const details = {};

                detailRows.forEach(row => {
                    const label = normalize(row.querySelector('.ad_item_description')?.textContent).replace(/:$/, '');
                    const value = normalize(row.querySelector('.ad_item_value')?.textContent);
                    if (label) details[label] = value;
                });

                const firstShown = details['First shown'] || '';
                const lastShown = details['Last shown'] || '';
                const uniqueUsersSeen = details['Unique users seen'] || '';
                const videoPlayer = card.querySelector('.video_player');
                const imageUrl = getBackgroundImageUrl(videoPlayer);

                return {
                    id,
                    brandName,
                    adCopy: '',
                    caption: '',
                    imageUrl,
                    videoUrl: '',
                    advertiserUrl: detailUrl,
                    firstShown,
                    lastShown,
                    startDate: firstShown,
                    activeTime: firstShown && lastShown ? `${firstShown} to ${lastShown}` : '',
                    uniqueUsersSeen,
                    metrics: {
                        'Unique users seen': uniqueUsersSeen,
                        Impressions: parseRangeNumber(uniqueUsersSeen),
                    },
                    raw: {
                        firstShown,
                        lastShown,
                        uniqueUsersSeen,
                        detailUrl,
                    },
                    source: 'TikTok Ads Library Page',
                };
            });
        }, { maxItems });

        return {
            url: targetUrl,
            count: items.length,
            items,
            seeMoreClickCount,
        };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

async function scrapeTikTokAdsResearch({
    niche,
    country,
    timeframe,
    maxItems,
    headless,
    maxScrolls,
    scrollDelayMs,
    startTime,
    endTime,
    region,
}) {
    const apiItems = [];
    let apiUrl = '';
    let apiError = '';

    try {
        apiUrl = buildTikTokApiUrl({ niche, country, timeframe, startTime, endTime, region });
        const response = await fetch(apiUrl, {
            headers: {
                Accept: 'application/json,text/plain,*/*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
                Referer: 'https://library.tiktok.com/ads',
            },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
            throw new Error(data?.error?.message || data?.message || `TikTok Ads Library API returned HTTP ${response.status}`);
        }

        const rawItems = findFirstArrayDeep(data).slice(0, maxItems);
        apiItems.push(...rawItems.map(normalizeTikTokApiItem));
    } catch (error) {
        apiError = String(error?.message || error);
    }

    let pageResult = { url: buildTikTokAdsPageUrl({ niche, country, timeframe, startTime, endTime, region }), count: 0, items: [] };

    try {
        pageResult = await scrapeTikTokAdsPageCards({
            niche,
            country,
            timeframe,
            maxItems,
            headless,
            maxScrolls,
            scrollDelayMs,
            startTime,
            endTime,
            region,
        });
    } catch (error) {
        const pageError = String(error?.message || error);
        if (!apiItems.length) throw new Error(pageError);
        apiError = apiError ? `${apiError}; page scrape failed: ${pageError}` : `Page scrape failed: ${pageError}`;
    }

    const mergedMap = new Map();

    [...(pageResult.items || []), ...apiItems].forEach(item => {
        if (!item) return;
        const key = item.id || `${item.brandName}-${item.imageUrl || item.advertiserUrl}`;
        if (!mergedMap.has(key)) {
            mergedMap.set(key, item);
            return;
        }

        const existing = mergedMap.get(key);
        mergedMap.set(key, {
            ...existing,
            ...item,
            metrics: {
                ...(existing.metrics || {}),
                ...(item.metrics || {}),
            },
            raw: {
                ...(existing.raw || {}),
                ...(item.raw || {}),
            },
            firstShown: item.firstShown || existing.firstShown,
            lastShown: item.lastShown || existing.lastShown,
            uniqueUsersSeen: item.uniqueUsersSeen || existing.uniqueUsersSeen,
            imageUrl: item.imageUrl || existing.imageUrl,
            advertiserUrl: item.advertiserUrl || existing.advertiserUrl,
        });
    });

    const items = Array.from(mergedMap.values()).slice(0, maxItems);

    return {
        url: pageResult.url,
        apiUrl,
        pageUrl: pageResult.url,
        count: items.length,
        items,
        apiError,
    };
}

function getRedditTimeRange(timeframe) {
    switch (String(timeframe || '').toLowerCase()) {
        case '1h':
        case 'hour': return 'hour';
        case '24h':
        case '1d':
        case 'day': return 'day';
        case '7d':
        case 'week': return 'week';
        case '30d':
        case 'month': return 'month';
        case '12m':
        case 'year': return 'year';
        case '5y':
        case 'all': return 'all';
        default: return 'month';
    }
}

function normalizeRedditPost(child, index) {
    const post = child?.data || child || {};
    const permalink = normalizeResearchText(post.permalink, '');
    const title = normalizeResearchText(post.title, 'Untitled Reddit post');
    const selfText = normalizeResearchText(post.selftext || post.selftext_html || '', '');

    const decodeUrl = value => normalizeResearchText(value, '').replace(/&amp;/g, '&');

    const previewImage = decodeUrl(post.preview?.images?.[0]?.source?.url || post.preview?.images?.[0]?.resolutions?.slice(-1)?.[0]?.url || '');
    const metadataImage = (() => {
        const metadata = post.media_metadata && typeof post.media_metadata === 'object' ? Object.values(post.media_metadata) : [];
        for (const item of metadata) {
            const candidate = decodeUrl(item?.s?.u || item?.p?.slice?.(-1)?.[0]?.u || item?.o?.[0]?.u || '');
            if (candidate) return candidate;
        }
        return '';
    })();

    const thumbnail = decodeUrl(post.thumbnail);
    const imageUrl = previewImage || metadataImage || (/^https?:\/\//i.test(thumbnail) ? thumbnail : '');
    const outboundUrl = decodeUrl(post.url_overridden_by_dest || post.url || '');

    return {
        id: normalizeResearchText(post.id || post.name, `reddit-${index + 1}`),
        fullname: normalizeResearchText(post.name, ''),
        title,
        subreddit: normalizeResearchText(post.subreddit_name_prefixed || (post.subreddit ? `r/${post.subreddit}` : ''), ''),
        subredditName: normalizeResearchText(post.subreddit, ''),
        author: normalizeResearchText(post.author, ''),
        selfText,
        text: selfText,
        thumbnail: /^https?:\/\//i.test(thumbnail) ? thumbnail : '',
        imageUrl,
        url: outboundUrl || (permalink ? `https://www.reddit.com${permalink}` : ''),
        permalink: permalink ? `https://www.reddit.com${permalink}` : outboundUrl,
        createdUtc: Number(post.created_utc || 0),
        score: Number(post.score || post.ups || 0),
        upvoteRatio: Number(post.upvote_ratio || 0),
        numComments: Number(post.num_comments || 0),
        comments: Number(post.num_comments || 0),
        subredditSubscribers: Number(post.subreddit_subscribers || 0),
        flair: normalizeResearchText(post.link_flair_text, ''),
        domain: normalizeResearchText(post.domain, ''),
        isSelf: Boolean(post.is_self),
        isVideo: Boolean(post.is_video),
        over18: Boolean(post.over_18),
        source: 'Reddit Search',
        metrics: {
            Score: Number(post.score || post.ups || 0),
            Comments: Number(post.num_comments || 0),
            UpvoteRatio: Number(post.upvote_ratio || 0),
            SubredditSubscribers: Number(post.subreddit_subscribers || 0),
        },
        raw: post,
    };
}

const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'node:steadysocial-market-research:v1.0.0 (by /u/steadysocial)';

function buildRedditSearchUrl(keyword, limit = 100) {
    return `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&limit=${Math.min(Number(limit) || 100, 100)}`;
}

function parseRedditJsonPayload(payload, maxItems = 100) {
    const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
    return children.slice(0, maxItems).map((child, index) => normalizeRedditPost(child, index));
}

async function fetchRedditJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': REDDIT_USER_AGENT,
        },
    });

    const text = await response.text();
    if (!response.ok || text.trim().startsWith('<')) {
        throw new Error(`Reddit direct fetch returned HTTP ${response.status}`);
    }

    return JSON.parse(text);
}

async function scrapeRedditResearch({ niche, maxItems, limit, headless = true }) {
    const keyword = normalizeResearchText(niche);
    if (!keyword) {
        return { url: '', count: 0, items: [], posts: [], after: null, method: 'none' };
    }

    const pageLimit = Math.min(Number(limit || maxItems || 100) || 100, 100);
    const targetUrl = buildRedditSearchUrl(keyword, pageLimit);

    try {
        const payload = await fetchRedditJson(targetUrl);
        const posts = parseRedditJsonPayload(payload, Math.min(maxItems || pageLimit, pageLimit));

        return {
            url: targetUrl,
            count: posts.length,
            after: payload?.data?.after || null,
            items: posts,
            posts,
            method: 'fetch',
        };
    } catch (fetchError) {
        let browser;

        try {
            browser = await chromium.launch({
                headless,
                args: [
                    '--disable-dev-shm-usage',
                    '--disable-quic',
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list',
                    '--allow-running-insecure-content',
                    '--disable-features=IsolateOrigins,site-per-process',
                ],
            });

            const context = await browser.newContext({
                viewport: { width: 1365, height: 900 },
                locale: 'en-US',
                ignoreHTTPSErrors: true,
                userAgent:
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
            });

            const page = await context.newPage();
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(1200);

            const text = await page.locator('body').innerText({ timeout: 30000 });
            const payload = JSON.parse(text);
            const posts = parseRedditJsonPayload(payload, Math.min(maxItems || pageLimit, pageLimit));

            return {
                url: targetUrl,
                count: posts.length,
                after: payload?.data?.after || null,
                items: posts,
                posts,
                method: 'playwright',
                fetchFallbackReason: String(fetchError?.message || fetchError),
            };
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }
}

function tokenFrequency(texts, limit = 8) {
    const stopWords = new Set([
        'the', 'and', 'for', 'with', 'that', 'this', 'your', 'you', 'our', 'are', 'from', 'have', 'has', 'not',
        'but', 'all', 'get', 'now', 'new', 'more', 'use', 'see', 'learn', 'shop', 'buy', 'free', 'click',
        'facebook', 'instagram', 'tiktok', 'reddit', 'ads', 'library', 'active', 'sponsored', 'running', 'started',
    ]);

    const counts = new Map();
    texts.join(' ')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word => word.length >= 4 && !stopWords.has(word))
        .forEach(word => counts.set(word, (counts.get(word) || 0) + 1));

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([word]) => word);
}

function inferNicheLocally({ niche, pageUrl, metaAds, tiktokAds, googleTrends, redditPosts = [] }) {
    const explicit = normalizeResearchText(niche);
    if (explicit) return explicit;

    const urlText = normalizeResearchText(pageUrl)
        .replace(/^https?:\/\//i, '')
        .replace(/www\./i, '')
        .replace(/[/?#].*$/, '')
        .replace(/[-_.]/g, ' ');

    const copyTexts = [
        urlText,
        ...(metaAds || []).flatMap(ad => [ad.brandName, ad.adCopy, ad.caption]),
        ...(tiktokAds || []).flatMap(item => [item.brandName, item.adCopy]),
        ...(redditPosts || []).flatMap(post => [post.title, post.selfText, post.subreddit]),
        ...((googleTrends?.topQueries || [])),
        ...((googleTrends?.risingQueries || [])),
    ].filter(Boolean);

    const topWords = tokenFrequency(copyTexts, 4);
    return topWords.length ? topWords.map(word => word[0].toUpperCase() + word.slice(1)).join(' ') : 'General Market';
}

function classifyContentTypes(metaAds = [], tiktokAds = [], redditPosts = []) {
    // Content type wording is intentionally left for the AI analysis.
    // This helper only exists for backward compatibility with older callers.
    return [];
}

function analyzePostingStructure(metaAds = [], tiktokAds = [], redditPosts = []) {
    // Structural posting should be produced by the AI from scraped records, not by canned copy rules.
    return [];
}

function analyzeDemographics({ niche, country, metaAds = [], tiktokAds = [], redditPosts = [] }) {
    // Audience and demographic language should be produced by the AI only when the dataset supports it.
    return [];
}

function analyzeTimeSignals(metaAds = [], googleTrends = null, timeframe = '30d') {
    // Time analysis should be produced by the AI from visible dates and trend points.
    return [];
}

function computeResearchKpis({ metaAds = [], tiktokAds = [], googleTrends = null, redditPosts = [] }) {
    const impressions = metaAds.map(ad => Number(ad.impressionCount || ad.impressionValue || 0)).filter(value => value > 0);
    const totalImpressions = impressions.reduce((sum, value) => sum + value, 0);
    const averageImpressions = impressions.length ? Math.round(totalImpressions / impressions.length) : 0;
    const topImpressionCount = impressions.length ? Math.max(...impressions) : 0;
    const contentSignalKinds = new Set();
    if (metaAds.length) contentSignalKinds.add('meta_ads');
    if (tiktokAds.length) contentSignalKinds.add('tiktok_ads');
    if (redditPosts.length) contentSignalKinds.add('reddit_posts');
    if (googleTrends) contentSignalKinds.add('google_trends');
    if (metaAds.some(ad => ad.media?.type === 'video')) contentSignalKinds.add('meta_video');
    if (metaAds.some(ad => ad.imageUrl || ad.brandLogo || ad.media?.poster)) contentSignalKinds.add('meta_image');
    if (tiktokAds.some(item => item.videoUrl)) contentSignalKinds.add('tiktok_video');
    if (tiktokAds.some(item => item.imageUrl)) contentSignalKinds.add('tiktok_image');
    if (redditPosts.some(post => post.imageUrl || post.thumbnail)) contentSignalKinds.add('reddit_image');

    const estimatedEngagementSignals = tiktokAds.reduce((sum, item) => {
        const metrics = item.metrics || {};
        return sum + ['Likes', 'Shares', 'Comments', 'Clicks', 'Impressions'].reduce((innerSum, key) => {
            return innerSum + parseResearchNumber(metrics[key], 0);
        }, 0);
    }, 0);

    const redditEngagementSignals = redditPosts.reduce((sum, post) => sum + Number(post.score || 0) + Number(post.numComments || 0), 0);

    const trendAverageInterest = Number(googleTrends?.averageInterest || 0);
    const trendLatestInterest = Number(googleTrends?.latestInterest || 0);
    const trendMomentum = trendLatestInterest - trendAverageInterest;
    const contentDiversityScore = Math.min(100, Math.round((contentSignalKinds.size / 9) * 100));
    const opportunityScore = Math.max(0, Math.min(100, Math.round(
        (trendLatestInterest * 0.35) +
        (contentDiversityScore * 0.25) +
        (Math.min(100, metaAds.length * 3) * 0.18) +
        (Math.min(100, tiktokAds.length * 4) * 0.17) +
        (Math.min(100, redditPosts.length * 3) * 0.05)
    )));

    return {
        datasetCount: metaAds.length + tiktokAds.length + redditPosts.length + (googleTrends ? 1 : 0),
        metaAdsCount: metaAds.length,
        tiktokContentCount: tiktokAds.length,
        redditPostsCount: redditPosts.length,
        totalImpressions,
        averageImpressions,
        topImpressionCount,
        trendAverageInterest,
        trendLatestInterest,
        trendMomentum,
        contentDiversityScore,
        opportunityScore,
        estimatedEngagementSignals: estimatedEngagementSignals + redditEngagementSignals,
        redditEngagementSignals,
    };
}

function normalizeAnalysisString(value, fallback = '') {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function normalizeAnalysisList(value, limit = 12) {
    if (!Array.isArray(value)) return [];

    return value
        .map(item => normalizeAnalysisString(item))
        .filter(Boolean)
        .filter((item, index, self) => self.findIndex(other => other.toLowerCase() === item.toLowerCase()) === index)
        .slice(0, limit);
}

function normalizeAnalysisKpis(parsedKpis = {}, fallbackKpis = {}) {
    const normalized = { ...fallbackKpis };

    Object.entries(parsedKpis || {}).forEach(([key, value]) => {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
            normalized[key] = numericValue;
        }
    });

    return normalized;
}

function buildDataOnlyMarketAnalysis({ query, metaAds = [], tiktokAds = [], googleTrends = null, redditPosts = [], aiProvider = 'data-only', aiError = '' }) {
    const detectedNiche = inferNicheLocally({
        niche: query.niche,
        pageUrl: query.pageUrl,
        metaAds,
        tiktokAds,
        googleTrends,
        redditPosts,
    });

    const kpis = computeResearchKpis({ metaAds, tiktokAds, googleTrends, redditPosts });

    return {
        detectedNiche,
        overallSummary: '',
        marketSummary: '',
        winningAds: [],
        winningContent: [],
        contentTypes: [],
        structuralPosting: [],
        demographics: [],
        timeAnalysis: [],
        recommendations: [],
        kpis,
        aiProvider,
        aiError,
    };
}

function normalizeMarketAnalysisFromAI(parsed = {}, baseline = {}, provider = '') {
    const overallSummary =
        normalizeAnalysisString(parsed.overallSummary) ||
        normalizeAnalysisString(parsed.overall_summary) ||
        normalizeAnalysisString(parsed.summary);

    const marketSummary =
        normalizeAnalysisString(parsed.marketSummary) ||
        normalizeAnalysisString(parsed.market_summary);

    return {
        detectedNiche:
            normalizeAnalysisString(parsed.detectedNiche) ||
            normalizeAnalysisString(parsed.detected_niche) ||
            baseline.detectedNiche,
        overallSummary,
        marketSummary,
        winningAds: normalizeAnalysisList(parsed.winningAds || parsed.winning_ads || parsed.topAds || parsed.top_ads),
        winningContent: normalizeAnalysisList(parsed.winningContent || parsed.winning_content || parsed.winningAdsOrContent || parsed.winning_ads_or_content),
        contentTypes: normalizeAnalysisList(parsed.contentTypes || parsed.content_types),
        structuralPosting: normalizeAnalysisList(parsed.structuralPosting || parsed.structural_posting || parsed.postingStructure || parsed.posting_structure),
        demographics: normalizeAnalysisList(parsed.demographics || parsed.audience || parsed.audienceSignals || parsed.audience_signals),
        timeAnalysis: normalizeAnalysisList(parsed.timeAnalysis || parsed.time_analysis || parsed.timingSignals || parsed.timing_signals),
        recommendations: normalizeAnalysisList(parsed.recommendations || parsed.recommendedMoves || parsed.recommended_moves),
        kpis: normalizeAnalysisKpis(parsed.kpis, baseline.kpis),
        aiProvider: provider,
        aiError: '',
    };
}

function buildAnalysisPrompt({ query, metaAds = [], tiktokAds = [], googleTrends = null, redditPosts = [], kpis }) {
    const compactMeta = metaAds.slice(0, 30).map(ad => ({
        brandName: ad.brandName,
        status: ad.status,
        startDate: ad.startDate,
        activeTime: ad.activeTime,
        impressions: ad.impressionCount || ad.impressionValue || ad.impressionText,
        platforms: ad.platforms,
        cta: ad.cta,
        copy: normalizeResearchText(ad.adCopy || ad.caption).slice(0, 700),
    }));

    const compactTikTok = tiktokAds.slice(0, 30).map(item => ({
        brandName: item.brandName,
        copy: normalizeResearchText(item.adCopy).slice(0, 700),
        firstShown: item.firstShown || item.startDate || '',
        lastShown: item.lastShown || '',
        uniqueUsersSeen: item.uniqueUsersSeen || item.metrics?.['Unique users seen'] || '',
        metrics: item.metrics,
        source: item.source,
    }));

    const compactReddit = redditPosts.slice(0, 30).map(post => ({
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        comments: post.numComments,
        text: normalizeResearchText(post.selfText).slice(0, 600),
        url: post.permalink || post.url,
    }));

    const compactTrends = googleTrends ? {
        keyword: googleTrends.keyword,
        averageInterest: googleTrends.averageInterest,
        peakInterest: googleTrends.peakInterest,
        latestInterest: googleTrends.latestInterest,
        risingQueries: googleTrends.risingQueries,
        topQueries: googleTrends.topQueries,
        recentTimeline: (googleTrends.timeline || []).slice(-18),
    } : null;

    return `Analyze this scraped ads and market research dataset. The analysis must be created from the data below, not from generic templates or default marketing advice.

Return valid JSON only with this schema:
{
  "detectedNiche": "string",
  "overallSummary": "string",
  "marketSummary": "string",
  "winningAds": ["string"],
  "winningContent": ["string"],
  "contentTypes": ["string"],
  "structuralPosting": ["string"],
  "demographics": ["string"],
  "timeAnalysis": ["string"],
  "recommendations": ["string"],
  "kpis": {
    "datasetCount": number,
    "metaAdsCount": number,
    "tiktokContentCount": number,
    "redditPostsCount": number,
    "totalImpressions": number,
    "averageImpressions": number,
    "topImpressionCount": number,
    "trendAverageInterest": number,
    "trendLatestInterest": number,
    "trendMomentum": number,
    "contentDiversityScore": number,
    "opportunityScore": number,
    "estimatedEngagementSignals": number,
    "redditEngagementSignals": number
  }
}

USER_QUERY:
${JSON.stringify(query, null, 2)}

COMPUTED_NUMERIC_KPIS:
${JSON.stringify(kpis, null, 2)}

META_ADS_SAMPLE:
${JSON.stringify(compactMeta, null, 2)}

TIKTOK_ADS_SAMPLE:
${JSON.stringify(compactTikTok, null, 2)}

GOOGLE_TRENDS:
${JSON.stringify(compactTrends, null, 2)}

REDDIT_POSTS_SAMPLE:
${JSON.stringify(compactReddit, null, 2)}

Rules:
- Do not use canned or fixed marketing advice.
- Only mention demographics, content types, time patterns, structural posting, winning ads, and recommendations that are supported by the scraped data.
- If a section has weak evidence, return an empty array for that section instead of guessing.
- Do not invent exact demographic ages unless the dataset strongly implies them.
- If a source is empty, mention the limitation briefly in overallSummary or marketSummary.
- KPI values must stay numeric.`;
}

function formatAnalysisMarkdown(analysis) {
    if (!analysis) return '';
    const lines = [];
    lines.push(`# ${analysis.detectedNiche || 'Market'} Research Summary`);

    const summary = analysis.overallSummary || analysis.marketSummary;
    if (summary) lines.push('', summary);

    if (analysis.marketSummary && analysis.marketSummary !== summary) {
        lines.push('', '## Market Summary', analysis.marketSummary);
    }

    const sections = [
        ['Winning Ads', analysis.winningAds],
        ['Winning Content', analysis.winningContent],
        ['Content Types', analysis.contentTypes],
        ['Structural Posting', analysis.structuralPosting],
        ['Demographics', analysis.demographics],
        ['Time Analysis', analysis.timeAnalysis],
        ['Recommended Moves', analysis.recommendations],
    ];

    sections.forEach(([title, items]) => {
        if (Array.isArray(items) && items.length) {
            lines.push('', `## ${title}`);
            items.slice(0, 12).forEach(item => lines.push(`- ${item}`));
        }
    });

    return lines.join('\n');
}

function formatResearchReportMarkdown({ query, marketAnalysis, metaAds = [], tiktokAds = [], googleTrends = null, redditPosts = [], warnings = [] }) {
    const lines = [];
    const analysisMarkdown = formatAnalysisMarkdown(marketAnalysis);

    if (analysisMarkdown) {
        lines.push(analysisMarkdown);
    } else {
        lines.push(`# ${query?.researchKeyword || query?.niche || 'Market'} Research Summary`);
    }

    lines.push('', '## Research Setup');
    lines.push(`- Keyword or page: ${query?.researchKeyword || query?.niche || query?.pageUrl || 'Not specified'}`);
    lines.push(`- Country: ${query?.country || 'Not specified'}`);
    lines.push(`- Timeframe: ${query?.timeframe || 'Not specified'}`);
    lines.push(`- Sources: ${Array.isArray(query?.sources) ? query.sources.join(', ') : 'Not specified'}`);
    lines.push(`- Saved: ${new Date().toISOString()}`);

    if (marketAnalysis?.kpis) {
        lines.push('', '## KPIs');
        Object.entries(marketAnalysis.kpis).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                lines.push(`- ${key}: ${value}`);
            }
        });
    }

    const sampleMeta = metaAds.slice(0, 10);
    if (sampleMeta.length) {
        lines.push('', '## Meta Ads Sample');
        sampleMeta.forEach((ad, index) => {
            lines.push(`- ${index + 1}. ${ad.brandName || 'Unknown'}${ad.impressionCountText || ad.impressionText ? ` | ${ad.impressionCountText || ad.impressionText}` : ''}: ${normalizeResearchText(ad.adCopy || ad.caption).slice(0, 240)}`);
        });
    }

    const sampleTikTok = tiktokAds.slice(0, 10);
    if (sampleTikTok.length) {
        lines.push('', '## TikTok Ads Sample');
        sampleTikTok.forEach((item, index) => {
            lines.push(`- ${index + 1}. ${item.brandName || 'TikTok Advertiser'}: ${normalizeResearchText(item.adCopy).slice(0, 240)}`);
        });
    }

    if (googleTrends) {
        lines.push('', '## Google Trends');
        lines.push(`- Keyword: ${googleTrends.keyword || query?.researchKeyword || ''}`);
        lines.push(`- Average interest: ${googleTrends.averageInterest || 0}`);
        lines.push(`- Latest interest: ${googleTrends.latestInterest || 0}`);
        if (Array.isArray(googleTrends.risingQueries) && googleTrends.risingQueries.length) {
            lines.push(`- Rising queries: ${googleTrends.risingQueries.slice(0, 10).join(', ')}`);
        }
        if (Array.isArray(googleTrends.topQueries) && googleTrends.topQueries.length) {
            lines.push(`- Top queries: ${googleTrends.topQueries.slice(0, 10).join(', ')}`);
        }
    }

    const sampleReddit = redditPosts.slice(0, 10);
    if (sampleReddit.length) {
        lines.push('', '## Reddit Discussion Sample');
        sampleReddit.forEach((post, index) => {
            lines.push(`- ${index + 1}. ${post.subreddit || 'Reddit'} | ${post.score || 0} score | ${post.numComments || 0} comments: ${post.title || 'Untitled'}`);
        });
    }

    if (warnings.length) {
        lines.push('', '## Source Warnings');
        warnings.forEach(warning => lines.push(`- ${warning}`));
    }

    return lines.join('\n');
}

async function buildMarketAnalysis({ query, metaAds, tiktokAds, googleTrends, redditPosts, useAI }) {
    const dataOnlyAnalysis = buildDataOnlyMarketAnalysis({ query, metaAds, tiktokAds, googleTrends, redditPosts });

    if (!useAI) {
        return {
            ...dataOnlyAnalysis,
            aiProvider: 'disabled',
            aiError: 'AI analysis is disabled. Only numeric KPIs and scraped records were returned.',
        };
    }

    try {
        const prompt = buildAnalysisPrompt({
            query,
            metaAds,
            tiktokAds,
            googleTrends,
            redditPosts,
            kpis: dataOnlyAnalysis.kpis,
        });
        const aiResult = await callConfiguredAI(prompt);
        const parsed = extractJsonObjectFromText(aiResult.text);

        if (!parsed) {
            return {
                ...dataOnlyAnalysis,
                aiProvider: aiResult.provider,
                aiError: 'AI returned text, but it was not valid JSON. No canned fallback analysis was inserted.',
            };
        }

        return normalizeMarketAnalysisFromAI(parsed, dataOnlyAnalysis, aiResult.provider);
    } catch (error) {
        return {
            ...dataOnlyAnalysis,
            aiProvider: 'unavailable',
            aiError: `${String(error?.message || error)}. No canned fallback analysis was inserted.`,
        };
    }
}

async function handleMarketResearchRequest(req, res) {
    const isLegacyScrapeRoute = req.path === '/api/scrape';
    const defaultSources = isLegacyScrapeRoute ? ['meta'] : MARKET_SOURCE_KEYS;
    const sources = normalizeResearchSources(req.body?.sources, defaultSources);
    const niche = String(pickResearchValue(req.body?.niche, '')).trim();
    const pageUrl = String(pickResearchValue(req.body?.pageUrl || req.body?.pageName, '')).trim();
    const researchKeyword = niche || pageUrl;
    const country = String(pickResearchValue(req.body?.country, MARKET_RESEARCH_DEFAULTS.country)).trim().toUpperCase();
    const status = String(pickResearchValue(req.body?.status, MARKET_RESEARCH_DEFAULTS.status)).trim().toLowerCase();
    const platform = String(pickResearchValue(req.body?.platform, 'all')).trim().toLowerCase();
    const timeframe = String(pickResearchValue(req.body?.timeframe, MARKET_RESEARCH_DEFAULTS.timeframe)).trim().toLowerCase();
    const maxItems = asResearchInt(req.body?.maxItems ?? req.body?.maxAds ?? req.body?.resultCount, MARKET_RESEARCH_DEFAULTS.maxItems, 1, 500);
    const maxScrolls = asResearchInt(req.body?.maxScrolls, MARKET_RESEARCH_DEFAULTS.maxScrolls, 1, 60);
    const headless = asResearchBool(req.body?.headless, MARKET_RESEARCH_DEFAULTS.headless);
    const useAI = asResearchBool(req.body?.useAI, true);
    const scrollDelayMs = asResearchInt(req.body?.scrollDelayMs, MARKET_RESEARCH_DEFAULTS.scrollDelayMs, 200, 5000);
    const redditSort = String(pickResearchValue(req.body?.redditSort || req.body?.sort, 'relevance')).trim().toLowerCase();
    const redditTime = String(pickResearchValue(req.body?.redditTime || req.body?.redditTimeRange || req.body?.t, timeframe)).trim().toLowerCase();
    const redditLimit = asResearchInt(req.body?.redditLimit || req.body?.limit, Math.min(maxItems, 100), 1, 100);
    const redditAfter = String(pickResearchValue(req.body?.redditAfter || req.body?.after, '')).trim();
    const tiktokStartTime = pickResearchValue(req.body?.tiktokStartTime ?? req.body?.start_time ?? req.body?.startTime, '');
    const tiktokEndTime = pickResearchValue(req.body?.tiktokEndTime ?? req.body?.end_time ?? req.body?.endTime, '');
    const tiktokRegion = String(pickResearchValue(req.body?.tiktokRegion || req.body?.region, 'all')).trim();

    if (!researchKeyword) {
        return res.status(400).json({
            success: false,
            error: 'niche, pageName, or pageUrl is required',
        });
    }

    const warnings = [];
    let metaAds = [];
    let tiktokAds = [];
    let googleTrends = null;
    let redditPosts = [];
    let metaUrl = '';
    let tiktokUrl = '';
    let tiktokApiUrl = '';
    let redditUrl = '';

    const query = {
        niche,
        pageUrl,
        researchKeyword,
        country,
        status,
        platform,
        timeframe,
        maxItems,
        maxScrolls,
        headless,
        sources,
        useAI,
        redditSort,
        redditTime,
        redditLimit,
        tiktokRegion,
    };

    try {
        if (sources.includes('meta')) {
            try {
                const metaResult = await scrapeMetaAdsResearch({
                    niche: researchKeyword,
                    country,
                    status,
                    maxItems,
                    maxScrolls,
                    headless,
                    scrollDelayMs,
                    platform,
                });
                metaAds = metaResult.items || [];
                metaUrl = metaResult.url || '';
            } catch (error) {
                warnings.push(`Meta Ads Library scrape failed: ${String(error?.message || error)}`);
            }
        }

        if (sources.includes('google_trends')) {
            try {
                googleTrends = await scrapeGoogleTrendsResearch({
                    niche: researchKeyword,
                    headless,
                });
            } catch (error) {
                warnings.push(`Google Trends scrape failed: ${String(error?.message || error)}`);
            }
        }

        if (sources.includes('tiktok_ads')) {
            try {
                const tiktokResult = await scrapeTikTokAdsResearch({
                    niche: researchKeyword,
                    country,
                    timeframe,
                    maxItems,
                    headless,
                    maxScrolls,
                    scrollDelayMs,
                    startTime: tiktokStartTime,
                    endTime: tiktokEndTime,
                    region: tiktokRegion,
                });
                tiktokAds = tiktokResult.items || [];
                tiktokUrl = tiktokResult.url || '';
                tiktokApiUrl = tiktokResult.apiUrl || '';
            } catch (error) {
                warnings.push(`TikTok Ads Library scrape failed: ${String(error?.message || error)}`);
            }
        }

        if (sources.includes('reddit')) {
            try {
                const redditResult = await scrapeRedditResearch({
                    niche: researchKeyword,
                    maxItems,
                    limit: redditLimit || maxItems,
                    headless,
                });
                redditPosts = redditResult.posts || redditResult.items || [];
                redditUrl = redditResult.url || '';
            } catch (error) {
                warnings.push(`Reddit search scrape failed: ${String(error?.message || error)}`);
            }
        }

        const marketAnalysis = await buildMarketAnalysis({
            query,
            metaAds,
            tiktokAds,
            googleTrends,
            redditPosts,
            useAI,
        });

        const kpis = marketAnalysis.kpis || computeResearchKpis({ metaAds, tiktokAds, googleTrends, redditPosts });
        const detectedNiche = marketAnalysis.detectedNiche || inferNicheLocally({ niche, pageUrl, metaAds, tiktokAds, googleTrends, redditPosts });

        const analysisText = formatAnalysisMarkdown(marketAnalysis);
        const reportMarkdown = formatResearchReportMarkdown({
            query,
            marketAnalysis,
            metaAds,
            tiktokAds,
            googleTrends,
            redditPosts,
            warnings,
        });

        return res.json({
            success: true,
            query,
            detectedNiche,
            urls: {
                metaAdsLibrary: metaUrl,
                tiktokAdsLibrary: tiktokUrl,
                tiktokAdsApi: tiktokApiUrl,
                googleTrends: googleTrends?.url || '',
                redditSearch: redditUrl,
            },
            count: metaAds.length,
            totalSignalCount: metaAds.length + tiktokAds.length + redditPosts.length + (googleTrends ? 1 : 0),
            metaAds,
            ads: metaAds,
            tiktokAds,
            redditPosts,
            redditDiscussions: redditPosts,
            googleTrends,
            kpis,
            marketAnalysis,
            analysisText,
            reportMarkdown,
            warnings,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: String(error?.message || error),
            warnings,
        });
    }
}


app.post('/api/market-research/save-report', async (req, res) => {
    try {
        const markdown = normalizeAnalysisString(req.body?.markdown || req.body?.content || req.body?.reportMarkdown);
        if (!markdown) {
            return res.status(400).json({
                success: false,
                error: 'Markdown content is required.',
            });
        }

        const directory = normalizePlanningSubPath(req.body?.directory || req.body?.folder || '');
        const filename = sanitizeMarkdownFilename(req.body?.filename || req.body?.name || 'market-research-report');
        const { planningDir } = resolvePlanningPath('');
        const targetDirectory = path.resolve(planningDir, directory);

        if (!isPathInside(planningDir, targetDirectory)) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }

        await fs.mkdir(targetDirectory, { recursive: true });

        const relativeFilePath = normalizePlanningSubPath(directory ? `${directory}/${filename}` : filename);
        const targetFile = path.resolve(planningDir, relativeFilePath);

        if (!isPathInside(planningDir, targetFile)) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }

        await fs.writeFile(targetFile, markdown, 'utf-8');

        return res.json({
            success: true,
            path: relativeFilePath,
            filename,
            directory,
            message: 'Market research markdown report saved to planner.',
        });
    } catch (error) {
        console.error('Failed to save market research report:', error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Failed to save market research report.',
        });
    }
});

app.post('/api/market-research', handleMarketResearchRequest);
app.post('/api/scrape', handleMarketResearchRequest);


// --- 404 Fallback ---

app.use((req, res) => {
    res.status(404).json({
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

app.listen(PORT, () => {
    console.log(`Local backend server running at http://localhost:${PORT}`);
});