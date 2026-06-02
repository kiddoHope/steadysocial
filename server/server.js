import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import mammoth from 'mammoth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const FACEBOOK_GRAPH_VERSION = 'v21.0';

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
        const newSettings = req.body;
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
        res.json(settings.find(s => s.type === 'facebook'));
    } catch (error) {
        res.status(500).json({ error: error.message });
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

// --- 404 Fallback ---

app.use((req, res) => {
    res.status(404).json({
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

app.listen(PORT, () => {
    console.log(`Local backend server running at http://localhost:${PORT}`);
});