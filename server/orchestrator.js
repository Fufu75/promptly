import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.ORCHESTRATOR_PORT || 4001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================================
// CONFIG
// ============================================================================

const TEMPLATE_DIR = path.join(__dirname, '..', 'template');
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// In-memory job store: jobId (clientId) → { status, deploymentId, projectName, url?, error? }
const jobs = new Map();

// ============================================================================
// UTILS
// ============================================================================

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readDirRecursive(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const sub = await readDirRecursive(fullPath, base);
      files.push(...sub);
    } else {
      const relativePath = path.relative(base, fullPath);
      const data = await fs.readFile(fullPath);
      files.push({ filePath: relativePath, data });
    }
  }

  return files;
}

function injectOrReplace(files, filePath, content) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const idx = files.findIndex((f) => f.filePath.replace(/\\/g, '/') === normalizedPath);
  const data = Buffer.from(JSON.stringify(content, null, 2), 'utf-8');
  if (idx >= 0) {
    files[idx].data = data;
  } else {
    files.push({ filePath: normalizedPath, data });
  }
}

async function vercelFetch(endpoint, options = {}) {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';
  const url = `https://api.vercel.com${endpoint}${teamQuery}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`[Vercel API] ${res.status} on ${endpoint}:`, JSON.stringify(json, null, 2));
    const msg = json?.error?.message || json?.message || JSON.stringify(json);
    throw new Error(`Vercel API ${res.status}: ${msg}`);
  }
  return json;
}

async function pollUntilReady(jobId, deploymentId, maxWaitMs = 300000) {
  const interval = 5000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, interval));

    const data = await vercelFetch(`/v13/deployments/${deploymentId}`);
    const state = data.status || data.readyState;

    console.log(`[${jobId}] Deployment ${deploymentId} state: ${state}`);

    if (state === 'READY') return data;
    if (state === 'ERROR' || state === 'CANCELED') {
      throw new Error(`Deployment failed with state: ${state}`);
    }
  }

  throw new Error('Timeout: deployment took more than 5 minutes');
}

// ============================================================================
// ENDPOINTS
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    vercel: !!VERCEL_TOKEN,
    supabase: !!SUPABASE_URL,
  });
});

app.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json(job);
});

app.post('/deploy', async (req, res) => {
  const { clientId, config, pageConfigs, siteName } = req.body;

  if (!clientId || !config) {
    return res.status(400).json({ error: 'missing_params', message: 'clientId and config are required' });
  }

  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: 'vercel_not_configured', message: 'VERCEL_TOKEN is missing' });
  }

  console.log(`[${clientId}] Starting deployment for "${siteName}"`);

  try {
    // Read all template files
    const templateFiles = await readDirRecursive(TEMPLATE_DIR);
    console.log(`[${clientId}] ${templateFiles.length} template files read`);

    // Inject config.json
    injectOrReplace(templateFiles, 'src/config/config.json', config);

    // Inject page configs
    if (pageConfigs?.homepage) {
      injectOrReplace(templateFiles, 'src/config/pages/homepage-config.json', pageConfigs.homepage);
    }
    if (pageConfigs?.auth) {
      injectOrReplace(templateFiles, 'src/config/pages/auth-config.json', pageConfigs.auth);
    }
    if (pageConfigs?.booking) {
      injectOrReplace(templateFiles, 'src/config/pages/booking-config.json', pageConfigs.booking);
    }

    // Build Vercel files array (base64)
    const vercelFiles = templateFiles.map((f) => ({
      file: f.filePath.replace(/\\/g, '/'),
      data: f.data.toString('base64'),
      encoding: 'base64',
    }));

    // Build project name (max 52 chars, Vercel limit)
    const rawName = `bw-${slugify(siteName || 'site')}-${clientId.slice(0, 8)}`;
    const projectName = rawName.slice(0, 52).replace(/-+$/, '');
    const stableUrl = `https://${projectName}.vercel.app`;

    console.log(`[${clientId}] Deploying to Vercel as project: ${projectName}`);

    // Call Vercel API
    const deployment = await vercelFetch('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        files: vercelFiles,
        env: {
          VITE_CLIENT_ID: clientId,
          VITE_SUPABASE_URL: SUPABASE_URL || '',
          VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY || '',
        },
        build: {
          env: {
            VITE_CLIENT_ID: clientId,
            VITE_SUPABASE_URL: SUPABASE_URL || '',
            VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY || '',
          },
        },
        projectSettings: {
          framework: 'vite',
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
          installCommand: 'npm install',
        },
      }),
    });

    const deploymentId = deployment.id;

    // Store initial job state
    jobs.set(clientId, { status: 'deploying', deploymentId, projectName });

    // Return immediately
    res.json({ jobId: clientId });

    // Poll in background
    pollUntilReady(clientId, deploymentId)
      .then(() => {
        console.log(`[${clientId}] Deployment READY: ${stableUrl}`);
        jobs.set(clientId, { status: 'deployed', deploymentId, projectName, url: stableUrl });
      })
      .catch((err) => {
        console.error(`[${clientId}] Deployment failed: ${err.message}`);
        jobs.set(clientId, { status: 'failed', deploymentId, projectName, error: err.message });
      });
  } catch (error) {
    console.error(`[${clientId}] Error:`, error.message);
    res.status(500).json({ error: 'deployment_failed', message: error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`Promptly Orchestrator running on http://localhost:${PORT}`);
  console.log(`Vercel token: ${VERCEL_TOKEN ? 'configured' : 'MISSING'}`);
  console.log(`Vercel team: ${VERCEL_TEAM_ID || 'personal account'}`);
  console.log(`Template dir: ${TEMPLATE_DIR}`);
});

export default app;
