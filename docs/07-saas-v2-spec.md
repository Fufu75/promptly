# SPÉCIFICATION TECHNIQUE - BookWise Generator v2.0
## Architecture SaaS Multi-tenant avec Déploiement Automatisé par IA

**Date**: 21 Janvier 2026  
**Version**: 2.0.0  
**Statut**: En implémentation

---

## 🎯 VISION & GAP ANALYSIS

### État actuel (Prototype v1.0)
- Générateur mono-utilisateur local
- Export ZIP manuel à déployer
- IA limitée à la modification du `config.json`
- Pas de persistance centralisée
- Aucune orchestration de conteneurs clients

### Cible (Pixelisium Plan - SaaS v2.0)
- **Multi-tenant** : 1 conteneur Docker par client
- **Auto-déploiement** : formulaire → Supabase → trigger → nouveau conteneur sur VPS
- **Hot Reload** : modification JSON → rechargement instantané du site client
- **IA évoluée** : modification du code source (TSX/CSS) + self-correction via lint/build
- **Supabase central** : source de vérité unique (configs + métadonnées clients)

---

## 📐 ARCHITECTURE GLOBALE

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION MÈRE                          │
│  (React + Vite sur port 5173)                               │
│  - Landing + Auth                                           │
│  - Questionnaire + Chat IA                                  │
│  - Config Editor                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SUPABASE (Source of Truth)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Table:     │  │  Storage:    │  │  Functions:  │      │
│  │  clients    │  │  configs/    │  │  deploy-site │      │
│  │  (metadata) │  │  (JSON)      │  │  (trigger)   │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────┬──────────────────────────────────────┘
                       │ Webhook/Edge Function
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           BACKEND ORCHESTRATOR (Express)                     │
│  - API /deploy-client                                       │
│  - Script Bash generation (docker-compose.client.yml)       │
│  - Docker API calls                                         │
│  - Nginx config generation (reverse proxy)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  VPS (Ubuntu 22.04)                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Docker Engine + Nginx Reverse Proxy               │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────┐   │    │
│  │  │ Client1 Cont │ │ Client2 Cont │ │ ... N   │   │    │
│  │  │ Port: 3001   │ │ Port: 3002   │ │         │   │    │
│  │  │ Volume: cfg1 │ │ Volume: cfg2 │ │         │   │    │
│  │  └──────────────┘ └──────────────┘ └─────────┘   │    │
│  │  Nginx: client1.vps-ip.nip.io → :3001            │    │
│  │         client2.vps-ip.nip.io → :3002            │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ MODULE 1 : ARCHITECTURE DÉPLOIEMENT DYNAMIQUE

### 1.1 Workflow de Déploiement Client

```
User → Frontend → Supabase → Edge Function → Backend VPS → Docker → Nginx → Site Live
```

**Séquence détaillée :**
1. User remplit questionnaire + chat IA
2. Frontend POST `/api/clients` (metadata + config.json)
3. Supabase trigger on INSERT clients
4. Edge Function webhook POST `/deploy-client` au backend VPS
5. Backend génère `docker-compose.client-{id}.yml`
6. Backend exécute `docker compose up -d`
7. Backend configure Nginx reverse proxy
8. Backend UPDATE clients SET status='deployed', url='...'
9. Frontend reçoit notification "Site déployé"

### 1.2 Structure VPS

**Filesystem Layout**
```
/opt/bookwise-saas/
├── templates/
│   └── barber/          # Template de base (lecture seule)
├── clients/
│   ├── client-uuid-1/
│   │   ├── docker-compose.yml
│   │   ├── volumes/
│   │   │   └── config/
│   │   │       └── config.json  # Volume bind pour hot reload
│   │   └── logs/
│   ├── client-uuid-2/
│   └── ...
├── nginx/
│   └── sites-available/
│       ├── client-1.conf
│       └── client-2.conf
└── scripts/
    ├── deploy-client.sh
    ├── update-client-config.sh
    └── cleanup-client.sh
```

### 1.3 Script `deploy-client.sh`

```bash
#!/bin/bash
set -e

CLIENT_ID=$1
CONFIG_JSON=$2
PORT=$3

BASE_DIR="/opt/bookwise-saas"
CLIENT_DIR="$BASE_DIR/clients/$CLIENT_ID"
TEMPLATE_DIR="$BASE_DIR/templates/barber"

# 1. Créer structure client
mkdir -p "$CLIENT_DIR/volumes/config"
mkdir -p "$CLIENT_DIR/logs"

# 2. Copier template
cp -r "$TEMPLATE_DIR"/* "$CLIENT_DIR/"

# 3. Injecter config.json
echo "$CONFIG_JSON" > "$CLIENT_DIR/volumes/config/config.json"

# 4. Générer docker-compose.client.yml
cat > "$CLIENT_DIR/docker-compose.yml" <<EOF
services:
  web:
    image: bookwise-template:latest
    container_name: client-$CLIENT_ID
    restart: unless-stopped
    volumes:
      - ./volumes/config:/app/src/config:ro
    environment:
      - VITE_SUPABASE_URL=\${SUPABASE_URL}
      - VITE_SUPABASE_PUBLISHABLE_KEY=\${SUPABASE_KEY}
    ports:
      - "$PORT:5173"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.client-$CLIENT_ID.rule=Host(\`client-$CLIENT_ID.{vps-ip}.nip.io\`)"
EOF

# 5. Lancer conteneur
cd "$CLIENT_DIR"
docker compose up -d

# 6. Configurer Nginx reverse proxy
cat > "/etc/nginx/sites-available/client-$CLIENT_ID.conf" <<EOF
server {
    listen 80;
    server_name client-$CLIENT_ID.{VPS_IP}.nip.io;
    
    location / {
        proxy_pass http://localhost:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/client-$CLIENT_ID.conf" "/etc/nginx/sites-enabled/"
nginx -s reload

echo "Client $CLIENT_ID deployed on port $PORT"
```

### 1.4 Hot Reload Implementation

**Mécanisme** : Vite watch le volume `./volumes/config` en mode dev. Dès modification du `config.json` :
1. Vite détecte le changement (HMR - Hot Module Replacement)
2. `useConfig` hook recharge depuis le fichier
3. React rerender avec la nouvelle config
4. **Pas de redémarrage conteneur** (performance)

**Configuration Vite pour Hot Reload**
```typescript
// vite.config.ts (dans l'image template)
export default defineConfig({
  server: {
    watch: {
      usePolling: true, // Nécessaire pour les volumes Docker
      interval: 1000,
    },
  },
});
```

**Hook `useConfig` avec file watcher**
```typescript
export const useConfig = () => {
  const [config, setConfig] = useState<Config>(initialConfig);

  useEffect(() => {
    // Poll le fichier config toutes les 2 secondes
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/src/config/config.json?t=' + Date.now());
        const newConfig = await response.json();
        setConfig(newConfig);
      } catch (err) {
        console.error('Config reload failed:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return config;
};
```

---

## 🗄️ MODULE 2 : SUPABASE SOURCE OF TRUTH

### 2.1 Schema Base de Données

```sql
-- Table clients (dans l'app mère Supabase)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- Ex: "salon-coiffure-marie"
  config_url TEXT, -- Storage bucket path ou JSON direct
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'deployed', 'failed')),
  deployment_url TEXT, -- Ex: client-uuid.vps-ip.nip.io
  container_port INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table client_admins (admin du site client = 1er user)
CREATE TABLE public.client_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'owner')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, user_id)
);

-- RLS Policies
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins app mère peuvent tout voir
CREATE POLICY "App admins can view all clients"
  ON public.clients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ));
```

### 2.2 Storage Bucket pour Configs

```sql
-- Bucket pour stocker les config.json
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-configs', 'client-configs', false);

-- Policy: seul le propriétaire + super_admin
CREATE POLICY "Users can upload their client configs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-configs' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

### 2.3 Edge Function : Trigger Déploiement

```typescript
// supabase/functions/deploy-site/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { record } = await req.json(); // Record de la table clients
  const clientId = record.id;
  const config = record.config_url; // URL du JSON ou JSON direct

  // Appeler le backend VPS pour déclencher déploiement
  const response = await fetch('http://{VPS_IP}:4000/deploy-client', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'X-Deploy-Token': Deno.env.get('DEPLOY_TOKEN') 
    },
    body: JSON.stringify({ clientId, config }),
  });

  if (!response.ok) {
    // Mettre à jour status = 'failed'
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_KEY')!
    );
    await supabase
      .from('clients')
      .update({ status: 'failed' })
      .eq('id', clientId);
    return new Response(JSON.stringify({ error: 'deployment_failed' }), { status: 500 });
  }

  const { url, port } = await response.json();

  // Mettre à jour status = 'deployed' + url
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, 
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  );
  await supabase
    .from('clients')
    .update({ 
      status: 'deployed', 
      deployment_url: url, 
      container_port: port 
    })
    .eq('id', clientId);

  return new Response(JSON.stringify({ success: true, url }), { status: 200 });
});
```

**Trigger Database**
```sql
CREATE OR REPLACE FUNCTION public.trigger_deploy_site()
RETURNS TRIGGER AS $$
BEGIN
  -- Appeler l'Edge Function deploy-site
  PERFORM net.http_post(
    url := 'https://{project-ref}.supabase.co/functions/v1/deploy-site',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer ' || current_setting('supabase.service_role_key')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_client_created
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_deploy_site();
```

---

## 🐳 MODULE 3 : BACKEND ORCHESTRATOR (Express + Docker API)

### 3.1 API `/deploy-client`

```javascript
// server/orchestrator.js
import express from 'express';
import Docker from 'dockerode'; // npm install dockerode
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.post('/deploy-client', async (req, res) => {
  const { clientId, config } = req.body;
  if (!clientId || !config) return res.status(400).json({ error: 'missing_params' });

  try {
    // 1. Trouver un port libre (3001, 3002, ...)
    const port = await findFreePort(3001, 4000);

    // 2. Créer le dossier client
    const clientDir = `/opt/bookwise-saas/clients/${clientId}`;
    await fs.mkdir(clientDir, { recursive: true });
    await fs.mkdir(`${clientDir}/volumes/config`, { recursive: true });

    // 3. Écrire config.json
    await fs.writeFile(
      `${clientDir}/volumes/config/config.json`,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    // 4. Générer docker-compose.yml
    const composeYml = `
services:
  web:
    image: bookwise-template:latest
    container_name: client-${clientId}
    restart: unless-stopped
    volumes:
      - ./volumes/config:/app/src/config:ro
    environment:
      - VITE_SUPABASE_URL=${process.env.SUPABASE_URL}
      - VITE_SUPABASE_PUBLISHABLE_KEY=${process.env.SUPABASE_KEY}
    ports:
      - "${port}:5173"
`;
    await fs.writeFile(`${clientDir}/docker-compose.yml`, composeYml, 'utf-8');

    // 5. Lancer conteneur via Docker API
    execSync(`docker compose -f ${clientDir}/docker-compose.yml up -d`, { cwd: clientDir });

    // 6. Configurer Nginx reverse proxy
    const subdomain = `client-${clientId}.${process.env.VPS_IP}.nip.io`;
    const nginxConf = `
server {
    listen 80;
    server_name ${subdomain};
    location / {
        proxy_pass http://localhost:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`;
    await fs.writeFile(
      `/etc/nginx/sites-available/client-${clientId}.conf`, 
      nginxConf, 
      'utf-8'
    );
    execSync(`ln -sf /etc/nginx/sites-available/client-${clientId}.conf /etc/nginx/sites-enabled/`);
    execSync('nginx -s reload');

    res.json({ success: true, url: `http://${subdomain}`, port });
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: 'deployment_failed', details: error.message });
  }
});

// Trouver un port libre
async function findFreePort(start, end) {
  for (let port = start; port <= end; port++) {
    try {
      execSync(`lsof -i :${port}`, { stdio: 'ignore' });
    } catch {
      return port; // Port libre
    }
  }
  throw new Error('No free port available');
}
```

### 3.2 Hot Reload via API `/update-client-config`

```javascript
app.post('/update-client-config', async (req, res) => {
  const { clientId, config } = req.body;
  const configPath = `/opt/bookwise-saas/clients/${clientId}/volumes/config/config.json`;

  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    // Vite watch détectera le changement automatiquement (HMR)
    res.json({ success: true, message: 'Config updated, site will reload' });
  } catch (error) {
    res.status(500).json({ error: 'update_failed', details: error.message });
  }
});
```

---

## 🤖 MODULE 4 : AGENT IA AVANCÉ (Modification Code Source)

### 4.1 Pipeline Self-Correction

```
User message → IA analyse → Génère code TSX/CSS → Write fichier → Lint → Build
                                                                       ↓ (erreur)
                                                      IA reçoit logs ← Parse errors
                                                                       ↓
                                                      Correction → Write → Lint → Build
                                                                       ↓ (OK)
                                                                     Success
```

### 4.2 Service `aiCodeModifier.ts`

```typescript
interface CodeModificationRequest {
  clientId: string;
  userPrompt: string;
  targetFile?: string; // Ex: 'src/pages/Index.tsx'
}

interface ModificationResult {
  success: boolean;
  changes: { filePath: string; content: string }[];
  errors?: string[];
  iterations: number;
}

export async function modifyCodeWithAI(
  request: CodeModificationRequest,
  maxIterations = 3
): Promise<ModificationResult> {
  const { clientId, userPrompt, targetFile } = request;
  const clientDir = `/opt/bookwise-saas/clients/${clientId}`;
  let iteration = 0;
  const changes: { filePath: string; content: string }[] = [];

  while (iteration < maxIterations) {
    iteration++;

    // 1. Prompt IA avec contexte + fichiers actuels
    const prompt = await buildCodeModificationPrompt(userPrompt, clientDir, targetFile);
    const aiResponse = await callOllama([{ role: 'user', content: prompt }]);

    // 2. Parser réponse IA (format attendu : JSON avec filePath + newContent)
    const modifications = parseCodeModificationResponse(aiResponse);

    // 3. Appliquer modifications
    for (const mod of modifications) {
      const fullPath = path.join(clientDir, mod.filePath);
      await fs.writeFile(fullPath, mod.content, 'utf-8');
      changes.push(mod);
    }

    // 4. Lancer lint
    const lintResult = execSync(
      `cd ${clientDir} && npm run lint`, 
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    if (lintResult.includes('error')) {
      // Envoyer logs à l'IA pour correction
      const correctionPrompt = `Les modifications ont causé des erreurs de lint :
${lintResult}

Corrige le code pour éliminer ces erreurs. Réponds avec le JSON des fichiers corrigés.`;
      continue; // Retry avec correction
    }

    // 5. Lancer build
    const buildResult = execSync(
      `cd ${clientDir} && npm run build`, 
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    if (buildResult.includes('error')) {
      // Même logique de correction
      continue;
    }

    // Success !
    return { success: true, changes, iterations: iteration };
  }

  return { success: false, changes, errors: ['Max iterations reached'], iterations: iteration };
}

async function buildCodeModificationPrompt(
  userPrompt: string,
  clientDir: string,
  targetFile?: string
): Promise<string> {
  // Lire le fichier cible actuel
  const currentCode = targetFile
    ? await fs.readFile(path.join(clientDir, targetFile), 'utf-8')
    : '';

  return `Tu es un expert développeur React/TypeScript.

Contexte : modifier le code d'un site de réservation (template Barber).

Fichier actuel (${targetFile || 'N/A'}) :
\`\`\`tsx
${currentCode}
\`\`\`

Demande utilisateur : "${userPrompt}"

Réponds UNIQUEMENT avec un JSON :
{
  "modifications": [
    {
      "filePath": "src/pages/Index.tsx",
      "newContent": "... code complet ..."
    }
  ],
  "explanation": "Explication des changements"
}

Contraintes :
- Code valide (pas d'erreur de syntaxe)
- Respecte les conventions React/TS
- Imports corrects`;
}

function parseCodeModificationResponse(response: string): { filePath: string; content: string }[] {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.modifications || [];
}
```

### 4.3 Endpoint Backend

```javascript
app.post('/ai-modify-code', async (req, res) => {
  const { clientId, userPrompt, targetFile } = req.body;

  try {
    const result = await modifyCodeWithAI({ clientId, userPrompt, targetFile });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'ai_modification_failed', details: error.message });
  }
});
```

---

## 🔐 MODULE 5 : SÉCURITÉ & GESTION RÔLES

### 5.1 Hiérarchie des Rôles

```
┌─────────────────────────────────────┐
│  Super Admin (App Mère)             │
│  - Accès tous clients               │
│  - Gestion infra VPS                │
│  - Logs globaux                     │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Client Owner (Créateur du site)    │
│  - CRUD sur son client              │
│  - Accès à l'agent IA               │
│  - Hot reload config                │
│  - Admin de son site déployé        │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Admin Site Client (ajouté par Own) │
│  - Gestion slots/bookings           │
│  - Pas de modif config              │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Client Final (utilisateur site)    │
│  - Réservation                      │
│  - Vue son profil                   │
└─────────────────────────────────────┘
```

### 5.2 Quick Win Sécurisé : Agent IA + Supabase

**Problème** : Donner accès direct à Supabase à l'IA = risque.

**Solution** : API intermédiaire + limitations

```typescript
// server/supabase-proxy.js
app.post('/ai-query-supabase', async (req, res) => {
  const { clientId, query } = req.body;
  
  // Whitelist des opérations autorisées
  const ALLOWED_TABLES = ['slots', 'bookings', 'profiles'];
  const ALLOWED_OPERATIONS = ['select', 'insert', 'update']; // Pas de DELETE
  
  // Parser query IA (ex: "SELECT * FROM slots WHERE ...")
  const { table, operation } = parseQuery(query);
  
  if (!ALLOWED_TABLES.includes(table) || !ALLOWED_OPERATIONS.includes(operation)) {
    return res.status(403).json({ error: 'forbidden_operation' });
  }
  
  // Exécuter via service_role_key (backend only)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.from(table).select('*'); // Simplifié
  
  res.json({ data, error });
});
```

**Prompt IA avec limitations**
```
Tu peux consulter la base Supabase via l'API proxy.
Tables autorisées : slots, bookings, profiles
Opérations : SELECT, INSERT, UPDATE uniquement (pas de DELETE)
Exemple requête : {"table": "slots", "operation": "select", "filters": {...}}
```

---

## 🔄 MODULE 6 : INTÉGRATION COMPLÈTE

### 6.1 Flux Frontend → Backend → VPS

**Frontend (`SiteCreator.tsx`)**
```typescript
const handleDeploySite = async () => {
  try {
    // 1. Sauvegarder dans Supabase
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        site_name: generatedConfig.brandName,
        slug: slugify(generatedConfig.brandName),
        config_url: JSON.stringify(generatedConfig),
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    toast.success('Déploiement en cours... (30-60s)');

    // 2. Attendre déploiement (realtime subscription)
    const subscription = supabase
      .channel('client-deploy')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'clients',
        filter: `id=eq.${client.id}`,
      }, (payload) => {
        if (payload.new.status === 'deployed') {
          toast.success(`Site déployé : ${payload.new.deployment_url}`);
          window.open(`http://${payload.new.deployment_url}`, '_blank');
        }
      })
      .subscribe();
  } catch (error) {
    toast.error('Échec du déploiement');
  }
};
```

### 6.2 Gestion Admin Site Client

**Lors du déploiement** : créer automatiquement le 1er admin

```typescript
// Dans Edge Function deploy-site
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Créer admin du site client
await supabase.from('client_admins').insert({
  client_id: record.id,
  user_id: record.user_id,
  role: 'owner',
});

// Créer un profil admin dans la table profiles du client
await supabase.rpc('create_client_admin_profile', {
  p_client_id: record.id,
  p_user_id: record.user_id,
  p_email: record.email,
});
```

---

## 🎓 MODULE 7 : ARGUMENTAIRE SOUTENANCE

### 7.1 Pourquoi LLM > NLP classique ?

**Contexte critique attendu (Marwan) :** "Vous utilisez juste un LLM existant, où est l'innovation ML/DL ?"

**Argumentaire solide :**

1. **Génération de code structuré**
   - NLP classique (BERT, spaCy) : extraction d'entités, classification → nécessiterait des règles rigides pour mapper "salon de coiffure" → services JSON
   - LLM (Llama/GPT) : compréhension contextuelle + génération structurée (JSON, TSX) en one-shot
   - **Benchmark** : montrer un tableau comparatif temps de dev (rules-based vs LLM)

2. **Adaptabilité multi-domaines**
   - NLP : 1 modèle par secteur (coiffure, médical, sport) → maintenance explosive
   - LLM : généralisation cross-domain via few-shot learning

3. **Self-correction via feedback loop**
   - Innovation : pipeline lint → build → logs → IA re-génère
   - Pas possible avec NLP classique (pas de génération de code)

4. **Justification Ollama vs GPT**
   - **Ollama** : pas de coût récurrent, données client restent locales (RGPD), customizable
   - **GPT** : fallback pour puissance si Ollama échoue (approche hybride)

**Slide proposition :**
```
┌────────────────────────────────────────────────────────┐
│  Approche NLP Classique       vs   Approche LLM       │
├────────────────────────────────────────────────────────┤
│  - Extraction entités (spaCy)  │  - Génération code   │
│  - Rules manuelles (if/else)   │  - Self-correction   │
│  - 1 modèle/secteur            │  - Cross-domain      │
│  - Pas de génération           │  - JSON + TSX + CSS  │
│  ❌ Maintenance lourde         │  ✅ Scalable         │
└────────────────────────────────────────────────────────┘
```

### 7.2 Métriques à Présenter

- **Temps génération** : < 2 min (questionnaire → site déployé)
- **Précision IA** : 85-90% de configs correctes au 1er coup (tester sur 20 cas)
- **Self-correction** : 95% de succès après 3 itérations lint/build
- **Coût** : 0€/requête (Ollama) vs 0.03€/génération (GPT-4)

---

## 🚀 ROADMAP TECHNIQUE (12 semaines)

### Sprint 1-2 : Fondations Supabase (Semaine 1-2) ✅ EN COURS
- [ ] Migrer schema `clients` + `client_admins`
- [ ] Storage bucket `client-configs`
- [ ] Edge Function `deploy-site` (trigger INSERT)
- [ ] RLS policies multi-tenant
- [ ] Frontend : form submission → Supabase

### Sprint 3-4 : Backend Orchestrator (Semaine 3-4)
- [ ] Endpoint `/deploy-client` (Docker API)
- [ ] Script `deploy-client.sh` (copie template, docker compose up, nginx)
- [ ] Port allocation dynamique (3001-4000)
- [ ] Endpoint `/update-client-config` (hot reload)
- [ ] Logs centralisés (Winston + Loki)

### Sprint 5-6 : Hot Reload & DNS (Semaine 5-6)
- [ ] Vite watch config avec polling
- [ ] Volume bind `/volumes/config` read-only
- [ ] Nginx reverse proxy auto-config
- [ ] Subdomain `client-{id}.{vps-ip}.nip.io`
- [ ] Tests charge (100 conteneurs simultanés)

### Sprint 7-8 : Agent IA Avancé (Semaine 7-8) ✅ PRIORITAIRE SOUTENANCE
- [ ] Service `aiCodeModifier` (modification TSX/CSS)
- [ ] Pipeline lint → build → logs → correction
- [ ] Endpoint `/ai-modify-code`
- [ ] Frontend : "Demander à l'IA de modifier le design"
- [ ] Whitelisting fichiers modifiables (sécurité)

### Sprint 9-10 : Sécurité & Performance (Semaine 9-10)
- [ ] API proxy Supabase pour l'IA (whitelist tables)
- [ ] Rate limiting (10 req/min par client)
- [ ] Monitoring : Prometheus + Grafana
- [ ] Auto-scaling : détection charge CPU → spawn nouveau VPS
- [ ] Backup configs (snapshots quotidiens)

### Sprint 11-12 : Soutenance & Polish (Semaine 11-12) ⚠️ LUNDI
- [ ] Documentation technique complète
- [ ] Benchmarks NLP vs LLM (slides)
- [ ] Vidéo démo (2 min) : formulaire → site déployé
- [ ] Repo GitHub public (sans secrets)
- [ ] Présentation NotebookLM

---

## 📊 STACK TECHNIQUE FINALISÉE

### Production
- **VPS** : Ubuntu 22.04 (min 8GB RAM, 4 vCPU)
- **Orchestration** : Docker + Docker Compose
- **Reverse Proxy** : Nginx (ou Traefik pour auto-discovery)
- **Base données** : Supabase PostgreSQL
- **IA** : Ollama (local) + OpenAI GPT-4 (fallback)
- **Monitoring** : Prometheus + Grafana + Loki
- **CI/CD** : GitHub Actions → build images → push Docker Hub

### DevOps
```yaml
# .github/workflows/deploy.yml
name: Build and Push Images
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build template image
        run: docker build -t bookwise-template:latest .
      - name: Push to Docker Hub
        run: docker push bookwise-template:latest
```

---

## ⚠️ RISQUES & MITIGATIONS

| Risque | Impact | Mitigation |
|--------|--------|------------|
| 100+ conteneurs → RAM overflow | Critique | Limite 50 conteneurs/VPS, auto-scaling |
| IA génère code cassé | Moyen | Pipeline self-correction (3 itérations max) |
| Attaque injection via formulaire | Critique | Validation Zod + sanitization + RLS Supabase |
| Coût Ollama inference (CPU) | Moyen | GPT-4 Turbo en fallback, cache réponses |
| Downtime lors deploy | Faible | Blue-green deployment, health checks |

---

## 🎯 LIVRABLES IMMÉDIATS (SOUTENANCE LUNDI)

### Pour la soutenance
1. **Slide Deck** (15 slides max)
   - Problème : génération sites réservation manuelle = 2-3 jours dev
   - Solution : IA + infra automatisée = 2 min
   - Archi : schéma multi-tenant Docker
   - Démo live : formulaire → site déployé
   - Comparaison NLP vs LLM (tableau)
   - Métriques : temps, coût, précision

2. **Code démo** (branche `demo-soutenance`)
   - Backend `/deploy-client` fonctionnel (local ou staging VPS)
   - 1 client déployé et accessible via sous-domaine
   - Agent IA capable de modifier 1 fichier TSX (preuve de concept)

3. **Vidéo** (2 min)
   - Remplir formulaire (30s)
   - IA génère config (30s)
   - Site déployé et accessible (30s)
   - Modification via chat → hot reload (30s)

---

## 💡 RECOMMANDATIONS CTO

### Court terme (avant soutenance)
1. **Concentre-toi sur l'Agent IA** : c'est le différenciateur
2. **Déploie 1 client en vrai** sur un VPS staging pour la démo
3. **Prépare le "Why LLM" argumentaire** (slides comparatifs)
4. **Utilise NotebookLM** pour générer un podcast de présentation

### Moyen terme (post-soutenance)
1. Implémenter le déploiement multi-client complet
2. Passer à GPT-4 Turbo pour l'agent (meilleure qualité)
3. Monitoring Grafana pour impressionner
4. Open-source le template Barber (GitHub Stars marketing)

### Long terme (industrialisation)
1. Multi-templates (médical, sport, beauté)
2. Marketplace de plugins (calendriers, paiements)
3. White-label pour agences web
4. API publique pour devs tiers

---

## 📝 NOTES DE MISE EN ŒUVRE

### Priorisation pour Soutenance (Lundi)
1. **Module 2** : Supabase (tables clients + client_admins) → 2h
2. **Module 4** : Agent IA avancé (proof of concept modification TSX) → 4h
3. **Module 3** : Backend `/deploy-client` simplifié (local) → 3h
4. **Module 7** : Slides + argumentaire NLP vs LLM → 2h

**Total estimation** : 11h de dev intensif

### Technologies à installer
```bash
npm install dockerode
npm install @supabase/supabase-js
```

---

**Document créé le** : 21 Janvier 2026  
**Dernière mise à jour** : 21 Janvier 2026  
**Auteur** : AI Technical Architect  
**Statut** : 🚀 Implémentation en cours
