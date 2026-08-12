import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import archiver from 'archiver';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 4000;
const ROOT = process.cwd();

// Fichiers et dossiers à inclure pour le site généré
const INCLUDE_PATHS = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'tailwind.config.ts',
  'postcss.config.js',
  'components.json',
  'eslint.config.js',
  'public',
  'src',
  'supabase',
];

// Fichiers/dirs à exclure (créateur, outils IA, serveur)
const EXCLUDE_PATHS = [
  'src/pages/SiteCreator.tsx',
  'src/pages/SitePreview.tsx',
  'src/components/QuestionnaireForm.tsx',
  'src/types/questionnaire.ts',
  'src/utils/questionnaireToConfig.ts',
  'src/services/ollamaService.ts',
  'server',
  'node_modules',
];

const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });

function shouldExclude(filePath) {
  return EXCLUDE_PATHS.some((ex) => filePath.includes(ex));
}

function copyPath(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return;
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    ensureDir(destPath);
    fs.readdirSync(srcPath).forEach((entry) => {
      const s = path.join(srcPath, entry);
      const d = path.join(destPath, entry);
      if (!shouldExclude(s)) copyPath(s, d);
    });
  } else {
    ensureDir(path.dirname(destPath));
    fs.copyFileSync(srcPath, destPath);
  }
}

app.get('/health', (_, res) => {
  res.json({ ok: true });
});

// ─── Relais OpenAI ────────────────────────────────────────────────────────────
// La clé vit ici et nulle part ailleurs. Le navigateur poste ses messages sur
// cette route, jamais sur api.openai.com : une clé lue côté client via une
// variable VITE_ serait inlinée dans le bundle par Vite et servie à chaque
// visiteur.
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.post('/ai/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'openai_not_configured',
      details: 'OPENAI_API_KEY absente de l’environnement du serveur.',
    });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'invalid_request',
      details: 'Le corps de la requête doit contenir un tableau "messages" non vide.',
    });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      // On relaie le statut et le message d'erreur, jamais la clé ni les
      // en-têtes de la requête sortante.
      console.error('openai error', upstream.status, data?.error?.message);
      return res.status(upstream.status).json({
        error: 'openai_error',
        details: data?.error?.message || upstream.statusText,
      });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'openai_empty_response' });
    }

    res.json({ content });
  } catch (e) {
    console.error('ai/chat error', e);
    res.status(500).json({ error: 'ai_proxy_failed', details: String(e) });
  }
});

app.post('/generate-site', async (req, res) => {
  try {
    const { config, siteName = 'site-generé' } = req.body || {};
    if (!config) {
      return res.status(400).json({ error: 'config manquant' });
    }

    // Créer un dossier temporaire
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-site-'));

    // Copier les chemins inclus
    INCLUDE_PATHS.forEach((p) => {
      const src = path.join(ROOT, p);
      const dst = path.join(tempRoot, p);
      if (!shouldExclude(src)) copyPath(src, dst);
    });

    // Écrire config fourni
    const configPath = path.join(tempRoot, 'src', 'config', 'config.json');
    ensureDir(path.dirname(configPath));
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // README minimal
    const readme = `# ${siteName}

Site de réservation généré automatiquement.

## Démarrage

npm install
npm run dev

## Config Supabase

VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
`;
    fs.writeFileSync(path.join(tempRoot, 'README.md'), readme, 'utf-8');

    // .env.example
    const envExample = `VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_cle
`;
    fs.writeFileSync(path.join(tempRoot, '.env.example'), envExample, 'utf-8');

    // Stream ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${siteName.replace(/\s+/g, '-').toLowerCase()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error(err);
      res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(tempRoot, false);
    archive.finalize();
  } catch (e) {
    console.error('generate-site error', e);
    res.status(500).json({ error: 'generation_failed', details: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Site generator server running on http://localhost:${PORT}`);
});




