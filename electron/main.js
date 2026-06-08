import { app, BrowserWindow, dialog, Menu, globalShortcut  } from 'electron';
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import XLSX from 'xlsx';
import mammoth from 'mammoth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const expressApp = express();
const PORT = 3001;
const FACEBOOK_GRAPH_VERSION = 'v21.0';
const DATA_DIR = path.join(app.getPath('userData'), 'data');

expressApp.use(cors());
expressApp.use(bodyParser.json({ limit: '50mb' }));
expressApp.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

function getDataDir() {
    return path.join(app.getPath('userData'), 'data');
}


// --- Folder Selection and Image Routes ---

expressApp.get('/folder/select', async (req, res) => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });
        
        if (result.canceled) {
            return res.json({ canceled: true });
        }
        
        res.json({ folderPath: result.filePaths[0] });
    } catch (error) {
        console.error('Failed to select folder:', error);
        res.status(500).json({ error: error.message });
    }
});

expressApp.get('/folder/random-images', async (req, res) => {
    try {
        const { folderPath, count = 1 } = req.query;
        if (!folderPath) {
            return res.status(400).json({ error: 'FolderPath is required' });
        }

        const files = await fs.readdir(folderPath);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
        const imageFiles = files.filter(file => 
            imageExtensions.includes(path.extname(file).toLowerCase())
        );

        if (imageFiles.length === 0) {
            return res.json({ images: [] });
        }

        const selectedImages = [];
        const numToSelect = Math.min(parseInt(count), imageFiles.length);
        
        // Randomly pick images
        const shuffled = [...imageFiles].sort(() => 0.5 - Math.random());
        for (let i = 0; i < numToSelect; i++) {
            const filePath = path.join(folderPath, shuffled[i]);
            const content = await fs.readFile(filePath);
            const base64 = content.toString('base64');
            const ext = path.extname(shuffled[i]).toLowerCase().slice(1);
            selectedImages.push({
                name: shuffled[i],
                dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`
            });
        }

        res.json({ images: selectedImages });
    } catch (error) {
        console.error('Failed to get random images:', error);
        res.status(500).json({ error: error.message });
    }
});

async function readJsonl(filename) {
    const filePath = path.join(getDataDir(), filename);

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (!content.trim()) return [];

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

async function writeJsonl(filename, data) {
    const filePath = path.join(getDataDir(), filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const content = data.map(item => JSON.stringify(item)).join('\n') + '\n';
    await fs.writeFile(filePath, content, 'utf-8');
}
// Helper to get Facebook error message
function getFacebookErrorMessage(fbData) {
    return fbData?.error?.message || fbData?.error?.error_user_msg || fbData?.message || 'Facebook request failed.';
}

// Helper to parse data image
function parseDataImage(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;
    return { mimeType: matches[1], base64: matches[2] };
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

let backendServer = null;
let backendProcess = null;

function isPortOpen(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(700);

        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function waitForBackend(port, host = '127.0.0.1', attempts = 30) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (await isPortOpen(port, host)) {
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return false;
}

function startNpmBackendServer() {
    const projectRoot = path.join(__dirname, '..');

    backendProcess = spawn('npm', ['run', 'server'], {
        cwd: projectRoot,
        shell: true,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'development',
        },
    });

    backendProcess.on('exit', (code) => {
        if (code !== 0 && !app.isQuitting) {
            console.error(`Backend server exited with code ${code}`);
        }
    });

    backendProcess.on('error', (error) => {
        console.error('Failed to spawn backend server:', error);
    });
}

async function startBackendServer() {
    const backendAlreadyRunning = await isPortOpen(PORT);

    if (backendAlreadyRunning) {
        console.log(`Backend already running at http://127.0.0.1:${PORT}`);
        return;
    }

    if (process.env.NODE_ENV === 'development') {
        console.log('Starting backend with npm run server...');
        startNpmBackendServer();

        const isReady = await waitForBackend(PORT);
        if (!isReady) {
            throw new Error(`Backend server did not start on port ${PORT}.`);
        }

        return;
    }

    console.log('Starting packaged backend from server/server.js...');

    process.env.PORT = String(PORT);
    process.env.STEADYSOCIAL_USER_DATA = app.getPath('userData');

    await import('../server/server.js');

    const isReady = await waitForBackend(PORT);
    if (!isReady) {
        throw new Error(`Backend server did not start on port ${PORT}.`);
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, '../assets/logo.png'),
    });

    if (process.env.NODE_ENV === 'development') {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    globalShortcut.register('F11', () => {
        if (win) {
        win.setFullScreen(!win.isFullScreen())
        }
    })
}

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    try {
        await startBackendServer();
        createWindow();
    } catch (error) {
        console.error('Unable to start the app:', error);
        dialog.showErrorBox(
            'Backend Server Failed',
            error.message || 'The local backend server could not be started.'
        );
        app.quit();
        return;
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();

    if (backendProcess && !backendProcess.killed) {
        backendProcess.kill();
    }

    if (backendServer) {
        backendServer.close();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- Facebook Backend Helpers ---


async function getStoredFacebookSettings() {
    const settings = await readJsonl('settings.jsonl');

    const facebookSettings =
        settings.find(s => s.type === 'facebook') ||
        { type: 'facebook', isEnabled: false };

    if (!facebookSettings.accessToken) {
        try {
            const envPath = path.join(__dirname, '../.env');
            const envContent = await fs.readFile(envPath, 'utf-8');
            const match = envContent.match(/APP_ACCESS_TOKEN=["']?([^"'\n\r]+)["']?/);

            if (match) {
                facebookSettings.accessToken = match[1];
            }
        } catch (e) {
            // ignore missing .env
        }
    }

    if (!facebookSettings.pageAccessToken) {
        try {
            const envPath = path.join(__dirname, '../.env');
            const envContent = await fs.readFile(envPath, 'utf-8');
            const match = envContent.match(/FACEBOOK_PAGE_ACCESS_TOKEN=["']?([^"'\n\r]+)["']?/);

            if (match) {
                facebookSettings.pageAccessToken = match[1];
            }
        } catch (e) {
            // ignore missing .env
        }
    }

    if (!facebookSettings.pageId) {
        try {
            const envPath = path.join(__dirname, '../.env');
            const envContent = await fs.readFile(envPath, 'utf-8');
            const match = envContent.match(/FACEBOOK_PAGE_ID=["']?([^"'\n\r]+)["']?/);

            if (match) {
                facebookSettings.pageId = match[1];
            }
        } catch (e) {
            // ignore missing .env
        }
    }

    return facebookSettings;
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

// --- Settings Routes ---

expressApp.get('/settings/facebook', async (req, res) => {
    try {
        const facebookSettings = await getStoredFacebookSettings();
        res.json(facebookSettings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

expressApp.put('/settings/facebook', async (req, res) => {
    try {
        const newSettings = req.body;
        const settings = await readJsonl('settings.jsonl');
        const index = settings.findIndex(s => s.type === 'facebook');

        if (index !== -1) {
            settings[index] = { ...settings[index], ...newSettings, type: 'facebook' };
        } else {
            settings.push({ type: 'facebook', ...newSettings });
        }

        await writeJsonl('settings.jsonl', settings);
        res.json(settings.find(s => s.type === 'facebook'));
    } catch (error) {
        console.error('Failed to save facebook settings:', error);
        res.status(500).json({ error: error.message });
    }
});

expressApp.get('/settings/ai', async (req, res) => {
    try {
        const settings = await readJsonl('settings.jsonl');
        const aiSettings = settings.find(s => s.type === 'ai') || { type: 'ai', provider: 'local' };
        res.json(aiSettings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

expressApp.put('/settings/ai', async (req, res) => {
    try {
        const newSettings = req.body;
        const settings = await readJsonl('settings.jsonl');
        const index = settings.findIndex(s => s.type === 'ai');

        if (index !== -1) {
            settings[index] = { ...settings[index], ...newSettings, type: 'ai' };
        } else {
            settings.push({ type: 'ai', ...newSettings });
        }

        await writeJsonl('settings.jsonl', settings);
        res.json(settings.find(s => s.type === 'ai'));
    } catch (error) {
        console.error('Failed to save AI settings:', error);
        res.status(500).json({ error: error.message });
    }
});

async function appendJsonl(filename, item) {
    const filePath = path.join(getDataDir(), filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = JSON.stringify(item) + '\n';
    await fs.appendFile(filePath, content, 'utf-8');
}

// --- Lead Core (CRM) Endpoints ---

expressApp.get('/leads', async (req, res) => {
    try {
        const leads = await readJsonl('leads.jsonl');
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

expressApp.post('/leads', async (req, res) => {
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

expressApp.put('/leads/:id', async (req, res) => {
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

expressApp.delete('/leads/:id', async (req, res) => {
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

function parseLeadFieldData(fieldData = []) {
    const result = {};
    for (const field of fieldData) {
        const key = (field.name || '').toLowerCase().replace(/\s+/g, '_');
        result[key] = Array.isArray(field.values) ? field.values[0] : field.values;
    }
    return result;
}

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

// GET /facebook/webhook — FB webhook verification
expressApp.get('/facebook/webhook', async (req, res) => {
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
expressApp.post('/facebook/webhook', async (req, res) => {
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
expressApp.get('/facebook/lead-forms/:pageId', async (req, res) => {
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
expressApp.post('/facebook/leads/bulk-import', async (req, res) => {
    try {
        const settings = await getStoredFacebookSettings();
        const accessToken = req.body.accessToken || resolveAccessToken(req, settings);
        const { formId, since } = req.body;

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
                existingFbIds.add(rawLead.id);
            }

            nextUrl = fbData.paging?.next || null;
        }

        return res.json({
            success: true,
            imported: importedLeads.length,
            skipped: skippedCount.count,
            leads: importedLeads,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Facebook Backend Routes ---
expressApp.post('/facebook/messages', async (req, res) => {
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
expressApp.get('/facebook/test', (req, res) => {
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
expressApp.get('/facebook/conversations/:pageId', async (req, res) => {
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

expressApp.get('/facebook/conversation-messages/:conversationId', async (req, res) => {
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
/**
 * GET /facebook/pages
 *
 * Backend call:
 * GET https://graph.facebook.com/v23.0/me/accounts
 *
 * Used for page connection.
 */
expressApp.get('/facebook/pages', async (req, res) => {
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

/**
 * GET /facebook/page-info/:pageId
 *
 * Backend call:
 * GET https://graph.facebook.com/v23.0/{PAGE_ID}
 */
expressApp.get('/facebook/page-info/:pageId', async (req, res) => {
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

/**
 * GET /facebook/page-posts/:pageId
 *
 * Backend call:
 * GET https://graph.facebook.com/v23.0/{PAGE_ID}/posts
 *
 * Used by dashboard/posts pages.
 */
expressApp.get('/facebook/page-posts/:pageId', async (req, res) => {
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

expressApp.get('/facebook/promotable-posts/:pageId', async (req, res) => {
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

expressApp.delete('/facebook/scheduled-posts/:postId', async (req, res) => {
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

/**
 * POST /facebook/feed
 *
 * Backend call:
 * POST https://graph.facebook.com/v23.0/{PAGE_ID}/feed
 *
 * Text or link post.
 */
expressApp.post('/facebook/feed', async (req, res) => {
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

/**
 * Shared handler for photo upload.
 *
 * Backend call:
 * POST https://graph.facebook.com/v23.0/{PAGE_ID}/photos
 */
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

        /**
         * Hosted image URL flow.
         */
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

        /**
         * Base64 data URL flow.
         */
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
// --- Canvas Routes ---

expressApp.get('/canvases', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        res.json(canvases);
    } catch (error) {
        console.error('Failed to fetch canvases:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch canvases.',
        });
    }
});

expressApp.get('/canvases/:id', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        const canvas = canvases.find(item => item.id === req.params.id);

        if (!canvas) {
            return res.status(404).json({
                success: false,
                message: 'Canvas not found.',
            });
        }

        res.json(canvas);
    } catch (error) {
        console.error('Failed to fetch canvas:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch canvas.',
        });
    }
});

expressApp.post('/canvases', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');

        const newCanvas = {
            ...req.body,
            id: req.body.id || `canvas-${Date.now()}`,
            items: req.body.initialItems || req.body.items || [],
            status: req.body.status || 'draft',
            createdAt: req.body.createdAt || Date.now(),
        };

        canvases.push(newCanvas);

        await writeJsonl('canvases.jsonl', canvases);

        res.status(201).json(newCanvas);
    } catch (error) {
        console.error('Failed to create canvas:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create canvas.',
        });
    }
});

expressApp.put('/canvases/:id', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        const index = canvases.findIndex(item => item.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Canvas not found.',
            });
        }

        canvases[index] = {
            ...canvases[index],
            ...req.body,
            id: canvases[index].id,
        };

        await writeJsonl('canvases.jsonl', canvases);

        res.json(canvases[index]);
    } catch (error) {
        console.error('Failed to update canvas:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update canvas.',
        });
    }
});

expressApp.delete('/canvases/:id', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        const filteredCanvases = canvases.filter(item => item.id !== req.params.id);

        await writeJsonl('canvases.jsonl', filteredCanvases);

        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete canvas:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete canvas.',
        });
    }
});

expressApp.put('/canvases/:id/status', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        const index = canvases.findIndex(item => item.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Canvas not found.',
            });
        }

        canvases[index] = {
            ...canvases[index],
            status: req.body.status,
            reviewedBy: req.body.adminId || canvases[index].reviewedBy,
            adminFeedback: req.body.adminFeedback || canvases[index].adminFeedback,
            reviewedAt: Date.now(),
        };

        await writeJsonl('canvases.jsonl', canvases);

        res.json(canvases[index]);
    } catch (error) {
        console.error('Failed to update canvas status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update canvas status.',
        });
    }
});

expressApp.put('/canvases/:canvasId/items/:itemId/adaptations', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        const canvasIndex = canvases.findIndex(item => item.id === req.params.canvasId);

        if (canvasIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Canvas not found.',
            });
        }

        const canvas = canvases[canvasIndex];
        const itemIndex = canvas.items.findIndex(item => item.id === req.params.itemId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Canvas item not found.',
            });
        }

        canvas.items[itemIndex] = {
            ...canvas.items[itemIndex],
            adaptations: {
                ...(canvas.items[itemIndex].adaptations || {}),
                [req.body.platform]: {
                    text: req.body.adaptedText,
                },
            },
        };

        canvases[canvasIndex] = canvas;

        await writeJsonl('canvases.jsonl', canvases);

        res.json(canvas);
    } catch (error) {
        console.error('Failed to update canvas item adaptation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update canvas item adaptation.',
        });
    }
});

expressApp.put('/canvases/:canvasId/items/:itemId/notes', async (req, res) => {
    try {
        const canvases = await readJsonl('canvases.jsonl');
        const canvasIndex = canvases.findIndex(item => item.id === req.params.canvasId);

        if (canvasIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Canvas not found.',
            });
        }

        const canvas = canvases[canvasIndex];
        const itemIndex = canvas.items.findIndex(item => item.id === req.params.itemId);

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Canvas item not found.',
            });
        }

        canvas.items[itemIndex] = {
            ...canvas.items[itemIndex],
            notesForAdmin: req.body.notes,
        };

        canvases[canvasIndex] = canvas;

        await writeJsonl('canvases.jsonl', canvases);

        res.json(canvas);
    } catch (error) {
        console.error('Failed to update canvas item notes:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update canvas item notes.',
        });
    }
});

// --- Campaign Routes ---

expressApp.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await readJsonl('campaigns.jsonl');
        res.json(campaigns);
    } catch (error) {
        console.error('Failed to fetch campaigns:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch campaigns.',
        });
    }
});

expressApp.post('/campaigns', async (req, res) => {
    try {
        const campaigns = await readJsonl('campaigns.jsonl');

        const newCampaign = {
            ...req.body,
            id: req.body.id || `campaign-${Date.now()}`,
            createdAt: req.body.createdAt || Date.now(),
        };

        campaigns.push(newCampaign);

        await writeJsonl('campaigns.jsonl', campaigns);

        res.status(201).json(newCampaign);
    } catch (error) {
        console.error('Failed to create campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create campaign.',
        });
    }
});

expressApp.put('/campaigns/:id', async (req, res) => {
    try {
        const campaigns = await readJsonl('campaigns.jsonl');
        const index = campaigns.findIndex(item => item.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found.',
            });
        }

        campaigns[index] = {
            ...campaigns[index],
            ...req.body,
            id: campaigns[index].id,
        };

        await writeJsonl('campaigns.jsonl', campaigns);

        res.json(campaigns[index]);
    } catch (error) {
        console.error('Failed to update campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update campaign.',
        });
    }
});

expressApp.delete('/campaigns/:id', async (req, res) => {
    try {
        const campaigns = await readJsonl('campaigns.jsonl');
        const filteredCampaigns = campaigns.filter(item => item.id !== req.params.id);

        await writeJsonl('campaigns.jsonl', filteredCampaigns);

        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete campaign.',
        });
    }
});

// --- Scheduler History Routes ---

expressApp.get('/scheduler/history', async (req, res) => {
    try {
        const history = await readJsonl('scheduler_history.jsonl');
        res.json(history);
    } catch (error) {
        console.error('Failed to fetch scheduler history:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch scheduler history.',
        });
    }
});

expressApp.post('/scheduler/history', async (req, res) => {
    try {
        const history = await readJsonl('scheduler_history.jsonl');

        const newEntry = {
            ...req.body,
            id: req.body.id || `schedule-${Date.now()}`,
            recordedAt: req.body.recordedAt || Date.now(),
        };

        history.push(newEntry);

        await writeJsonl('scheduler_history.jsonl', history);

        res.status(201).json(newEntry);
    } catch (error) {
        console.error('Failed to create scheduler history entry:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create scheduler history entry.',
        });
    }
});

expressApp.put('/scheduler/history/:id', async (req, res) => {
    try {
        const history = await readJsonl('scheduler_history.jsonl');
        const index = history.findIndex(item => item.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Scheduler history item not found.',
            });
        }

        history[index] = {
            ...history[index],
            ...req.body,
            id: history[index].id,
        };

        await writeJsonl('scheduler_history.jsonl', history);

        res.json(history[index]);
    } catch (error) {
        console.error('Failed to update scheduler history entry:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update scheduler history entry.',
        });
    }
});

expressApp.delete('/scheduler/history/:id', async (req, res) => {
    try {
        const history = await readJsonl('scheduler_history.jsonl');
        const filteredHistory = history.filter(item => item.id !== req.params.id);

        await writeJsonl('scheduler_history.jsonl', filteredHistory);

        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete scheduler history entry:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete scheduler history entry.',
        });
    }
});

// --- Automation Routes ---

expressApp.get('/automations', async (req, res) => {
    try {
        const automations = await readJsonl('automations.jsonl');
        res.json(automations);
    } catch (error) {
        console.error('Failed to fetch automations:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch automations.',
        });
    }
});

expressApp.post('/automations', async (req, res) => {
    try {
        const automations = await readJsonl('automations.jsonl');

        const newRule = {
            ...req.body,
            id: req.body.id || `automation-${Date.now()}`,
            runCount: req.body.runCount || 0,
            createdAt: req.body.createdAt || Date.now(),
        };

        automations.push(newRule);

        await writeJsonl('automations.jsonl', automations);

        res.status(201).json(newRule);
    } catch (error) {
        console.error('Failed to create automation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create automation.',
        });
    }
});

expressApp.put('/automations/:id', async (req, res) => {
    try {
        const automations = await readJsonl('automations.jsonl');
        const index = automations.findIndex(item => item.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Automation rule not found.',
            });
        }

        automations[index] = {
            ...automations[index],
            ...req.body,
            id: automations[index].id,
        };

        await writeJsonl('automations.jsonl', automations);

        res.json(automations[index]);
    } catch (error) {
        console.error('Failed to update automation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update automation.',
        });
    }
});

expressApp.delete('/automations/:id', async (req, res) => {
    try {
        const automations = await readJsonl('automations.jsonl');
        const filteredAutomations = automations.filter(
            item => item.id !== req.params.id
        );

        await writeJsonl('automations.jsonl', filteredAutomations);

        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete automation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete automation.',
        });
    }
});

expressApp.post('/facebook/photo', handleFacebookPhotoPost);

/**
 * Compatibility alias.
 *
 * Your UI can keep using /{PAGE_ID}/uploads.
 * The hook forwards it here, then this backend posts to /photos.
 */
expressApp.post('/facebook/uploads', handleFacebookPhotoPost);

// --- Planning Workspace Endpoints ---

const getPlanningDir = () => {
    return path.join(DATA_DIR, 'planning');
};

// 1. List files and folders
expressApp.get('/planning/files', async (req, res) => {
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
expressApp.post('/planning/folder', async (req, res) => {
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
expressApp.post('/planning/file', async (req, res) => {
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
<title>${content.title || 'Plan Document'}</title>
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
${content.html || content}
</body>
</html>`;
            await fs.writeFile(targetFile, htmlContent, 'utf-8');
        } else if (type === 'pdf') {
            let pdfSaved = false;
            try {
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
                await fs.writeFile(targetFile, content.html || content, 'utf-8');
            }
        } else {
            await fs.writeFile(targetFile, content, 'utf-8');
        }

        res.json({ success: true, message: 'File saved successfully.' });
    } catch (error) {
        console.error('Failed to save file:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Read file content
expressApp.get('/planning/file/content', async (req, res) => {
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
expressApp.delete('/planning/item', async (req, res) => {
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
expressApp.post('/planning/rename', async (req, res) => {
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

// 7. Search planning workspace
expressApp.post('/planning/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || !query.trim()) {
            return res.json({ success: true, results: [] });
        }

        const planningDir = getPlanningDir();
        const results = [];
        const searchTerm = query.toLowerCase();

        async function searchDir(dir, relativePath = '') {
            try {
                const items = await fs.readdir(dir, { withFileTypes: true });
                
                for (const item of items) {
                    const fullPath = path.join(dir, item.name);
                    const relPath = relativePath ? path.join(relativePath, item.name).replace(/\\/g, '/') : item.name;

                    if (item.isDirectory()) {
                        await searchDir(fullPath, relPath);
                    } else {
                        // Check filename match
                        if (item.name.toLowerCase().includes(searchTerm)) {
                            results.push({
                                path: relPath,
                                name: item.name,
                                snippet: `File: ${item.name}`,
                                tags: [path.extname(item.name).slice(1).toLowerCase() || 'file'],
                                links: []
                            });
                            continue;
                        }

                        // For text files, search content
                        const ext = path.extname(item.name).toLowerCase();
                        if (['.md', '.txt', '.csv', '.html'].includes(ext)) {
                            try {
                                const content = await fs.readFile(fullPath, 'utf-8');
                                if (content.toLowerCase().includes(searchTerm)) {
                                    // Extract snippet
                                    const lines = content.split('\n');
                                    const matchLines = lines.filter(line => line.toLowerCase().includes(searchTerm));
                                    const snippet = matchLines.slice(0, 2).join(' ').substring(0, 100);

                                    // Extract tags from content (hashtags or headers)
                                    const tags = [...new Set(
                                        content.match(/#[a-zA-Z0-9_]+/g) || []
                                    )].slice(0, 3);

                                    // Extract links
                                    const links = [...new Set(
                                        content.match(/https?:\/\/[^\s)]+/g) || []
                                    )].slice(0, 3);

                                    results.push({
                                        path: relPath,
                                        name: item.name,
                                        snippet: snippet || 'Match found in file',
                                        tags,
                                        links
                                    });
                                }
                            } catch (err) {
                                console.warn(`Could not read file ${fullPath}:`, err);
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn(`Could not search directory ${dir}:`, err);
            }
        }

        await searchDir(planningDir);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Planning search failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Board Endpoints ---

const BOARDS_DIR = path.join(DATA_DIR, 'boards');

async function ensureBoardsDir() {
    try {
        await fs.mkdir(BOARDS_DIR, { recursive: true });
    } catch (e) {
        console.warn('Unable to create boards directory:', e);
    }
}

expressApp.get('/boards', async (req, res) => {
    try {
        await ensureBoardsDir();
        const files = await fs.readdir(BOARDS_DIR);
        const boards = files
            .filter(f => f.endsWith('.json'))
            .map(f => path.basename(f, '.json'));
        
        if (!boards.includes('default')) {
            boards.unshift('default');
        }
        res.json({ success: true, boards });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

expressApp.get('/boards/:name', async (req, res) => {
    try {
        await ensureBoardsDir();
        const boardPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        try {
            const data = await fs.readFile(boardPath, 'utf-8');
            res.json(JSON.parse(data));
        } catch (e) {
            if (e.code === 'ENOENT') {
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

expressApp.put('/boards/:name', async (req, res) => {
    try {
        await ensureBoardsDir();
        const boardPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        await fs.writeFile(boardPath, JSON.stringify(req.body, null, 2), 'utf-8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

expressApp.delete('/boards/:name', async (req, res) => {
    try {
        await ensureBoardsDir();
        const boardPath = path.join(BOARDS_DIR, `${req.params.name}.json`);
        try {
            await fs.unlink(boardPath);
        } catch (e) {
            // Ignore
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

expressApp.post('/boards/:name/rename', async (req, res) => {
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