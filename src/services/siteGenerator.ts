import JSZip from 'jszip';
import type { Config } from '@/hooks/useConfig';

const DEFAULT_SITEGEN_URL = import.meta.env.VITE_SITEGEN_URL || 'http://localhost:4000';

/**
 * Génère le contenu du fichier config.json avec la configuration personnalisée
 */
export function generateConfigFile(config: Config): string {
  // Retirer les champs spécifiques au générateur
  const { conversationHistory, generatedAt, templateVersion, ...cleanConfig } = config as any;
  return JSON.stringify(cleanConfig, null, 2);
}

/**
 * Génère un fichier README pour le site généré
 */
export function generateReadme(config: Config): string {
  return `# ${config.brandName}

Site de réservation généré automatiquement avec Promptly Generator.

## Configuration

Ce site utilise le système de réservation Promptly avec la configuration suivante :

- **Nom** : ${config.brandName}
- **Secteur** : ${config.businessSector}
- **Services** : ${config.services.length} service(s) configuré(s)

## Installation

\`\`\`bash
npm install
npm run dev
\`\`\`

## Configuration Supabase

1. Créez un projet Supabase sur https://supabase.com
2. Appliquez les migrations depuis \`supabase/migrations/00000000000000_initial_schema.sql\`
3. Configurez les variables d'environnement dans \`.env\` :

\`\`\`env
VITE_SUPABASE_URL=votre_url
VITE_SUPABASE_PUBLISHABLE_KEY=votre_cle
\`\`\`

## Déploiement

\`\`\`bash
npm run build
\`\`\`

Les fichiers générés seront dans le dossier \`dist/\`.

Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
`;
}

/**
 * Génère un fichier .env.example pour le site généré
 */
export function generateEnvExample(): string {
  return `# Configuration Supabase
VITE_SUPABASE_URL=https://votre-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_cle_publique
`;
}

/**
 * Génère un fichier .gitignore pour le site généré
 */
export function generateGitignore(): string {
  return `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Environment variables
.env
.env.local
.env.production
`;
}

/**
 * Génère le package.json pour le site généré (sans les dépendances du créateur)
 */
export function generatePackageJson(config: Config): string {
  const packageJson = {
    name: config.brandName.toLowerCase().replace(/\s+/g, '-'),
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      lint: 'eslint .',
      preview: 'vite preview',
    },
    dependencies: {
      '@hookform/resolvers': '^3.10.0',
      '@radix-ui/react-accordion': '^1.2.11',
      '@radix-ui/react-alert-dialog': '^1.1.14',
      '@radix-ui/react-aspect-ratio': '^1.1.7',
      '@radix-ui/react-avatar': '^1.1.10',
      '@radix-ui/react-checkbox': '^1.3.2',
      '@radix-ui/react-collapsible': '^1.1.11',
      '@radix-ui/react-context-menu': '^2.2.15',
      '@radix-ui/react-dialog': '^1.1.14',
      '@radix-ui/react-dropdown-menu': '^2.1.15',
      '@radix-ui/react-hover-card': '^1.1.14',
      '@radix-ui/react-label': '^2.1.7',
      '@radix-ui/react-menubar': '^1.1.15',
      '@radix-ui/react-navigation-menu': '^1.2.13',
      '@radix-ui/react-popover': '^1.1.14',
      '@radix-ui/react-progress': '^1.1.7',
      '@radix-ui/react-radio-group': '^1.3.7',
      '@radix-ui/react-scroll-area': '^1.2.9',
      '@radix-ui/react-select': '^2.2.5',
      '@radix-ui/react-separator': '^1.1.7',
      '@radix-ui/react-slider': '^1.3.5',
      '@radix-ui/react-slot': '^1.2.3',
      '@radix-ui/react-switch': '^1.2.5',
      '@radix-ui/react-tabs': '^1.1.12',
      '@radix-ui/react-toast': '^1.2.14',
      '@radix-ui/react-toggle': '^1.1.9',
      '@radix-ui/react-toggle-group': '^1.1.10',
      '@radix-ui/react-tooltip': '^1.2.7',
      '@supabase/supabase-js': '^2.80.0',
      '@tanstack/react-query': '^5.83.0',
      'class-variance-authority': '^0.7.1',
      'clsx': '^2.1.1',
      'cmdk': '^1.1.1',
      'date-fns': '^3.6.0',
      'embla-carousel-react': '^8.6.0',
      'input-otp': '^1.4.2',
      'lucide-react': '^0.462.0',
      'next-themes': '^0.3.0',
      'react': '^18.3.1',
      'react-day-picker': '^8.10.1',
      'react-dom': '^18.3.1',
      'react-helmet-async': '^2.0.5',
      'react-hook-form': '^7.61.1',
      'react-resizable-panels': '^2.1.9',
      'react-router-dom': '^6.30.1',
      'recharts': '^2.15.4',
      'sonner': '^1.7.4',
      'tailwind-merge': '^2.6.0',
      'tailwindcss-animate': '^1.0.7',
      'vaul': '^0.9.9',
      'zod': '^3.25.76',
    },
    devDependencies: {
      '@eslint/js': '^9.32.0',
      '@tailwindcss/typography': '^0.5.16',
      '@types/node': '^22.16.5',
      '@types/react': '^18.3.23',
      '@types/react-dom': '^18.3.7',
      '@vitejs/plugin-react-swc': '^3.11.0',
      'autoprefixer': '^10.4.21',
      'eslint': '^9.32.0',
      'eslint-plugin-react-hooks': '^5.2.0',
      'eslint-plugin-react-refresh': '^0.4.20',
      'globals': '^15.15.0',
      'postcss': '^8.5.6',
      'tailwindcss': '^3.4.17',
      'typescript': '^5.8.3',
      'typescript-eslint': '^8.38.0',
      'vite': '^5.4.19',
    },
  };
  
  return JSON.stringify(packageJson, null, 2);
}

/**
 * Génère un ZIP avec les fichiers essentiels du site
 * Note: Pour inclure tous les fichiers, il faudrait un backend Node.js
 * Pour l'instant, on génère un ZIP avec les fichiers modifiés + instructions
 */
export async function generateSiteZip(config: Config): Promise<Blob> {
  const zip = new JSZip();
  
  // Créer la structure de dossiers
  const src = zip.folder('src');
  const srcConfig = src?.folder('config');
  const srcComponents = src?.folder('components');
  const srcPages = src?.folder('pages');
  const srcHooks = src?.folder('hooks');
  const srcUtils = src?.folder('utils');
  const srcIntegrations = src?.folder('integrations');
  const supabase = srcIntegrations?.folder('supabase');
  const srcLib = src?.folder('lib');
  const publicFolder = zip.folder('public');
  const supabaseFolder = zip.folder('supabase');
  const migrationsFolder = supabaseFolder?.folder('migrations');
  
  // Ajouter le config.json personnalisé
  srcConfig?.file('config.json', generateConfigFile(config));
  
  // Ajouter README avec instructions complètes
  zip.file('README.md', generateReadme(config));
  
  // Ajouter .env.example
  zip.file('.env.example', generateEnvExample());
  
  // Ajouter .gitignore
  zip.file('.gitignore', generateGitignore());
  
  // Ajouter package.json
  zip.file('package.json', generatePackageJson(config));
  
  // Ajouter un fichier INSTRUCTIONS.txt avec les étapes pour compléter le ZIP
  const instructions = `INSTRUCTIONS POUR COMPLÉTER LE SITE GÉNÉRÉ
==========================================

Ce ZIP contient les fichiers essentiels personnalisés pour votre site "${config.brandName}".

ÉTAPES POUR COMPLÉTER :

1. Créez un nouveau dossier pour votre projet
2. Extrayez ce ZIP dans ce dossier
3. Copiez les fichiers suivants depuis le template Promptly original :
   
   FICHIERS DE CONFIGURATION :
   - tsconfig.json, tsconfig.app.json, tsconfig.node.json
   - vite.config.ts
   - tailwind.config.ts
   - postcss.config.js
   - components.json
   - eslint.config.js
   - index.html
   
   DOSSIER PUBLIC :
   - public/favicon.ico
   - public/robots.txt
   
   SOURCE CODE :
   - src/main.tsx
   - src/App.tsx
   - src/App.css
   - src/index.css
   - src/vite-env.d.ts
   - src/components/**/* (tous les composants UI)
   - src/pages/**/* (sauf SiteCreator.tsx)
   - src/hooks/**/*
   - src/utils/**/*
   - src/integrations/**/*
   - src/lib/**/*
   
   SUPABASE :
   - supabase/migrations/00000000000000_initial_schema.sql
   - supabase/config.toml

4. Installez les dépendances :
   npm install

5. Configurez Supabase :
   - Créez un projet sur https://supabase.com
   - Appliquez la migration initial_schema.sql
   - Configurez .env avec vos clés Supabase

6. Lancez le site :
   npm run dev

NOTE : Pour une génération complète automatique, utilisez le backend de génération.
`;
  
  zip.file('INSTRUCTIONS.txt', instructions);
  
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Télécharge le ZIP généré
 */
export async function downloadSiteZip(config: Config, siteName: string) {
  const zipBlob = await generateSiteZip(config);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${siteName.toLowerCase().replace(/\s+/g, '-')}-site-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Génère le site via le backend (Express) et télécharge le ZIP
 */
export async function generateSiteZipBackend(config: Config, siteName: string) {
  const endpoint = `${DEFAULT_SITEGEN_URL}/generate-site`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, siteName }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Generation backend failed (${resp.status}): ${text || resp.statusText}`);
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${siteName.toLowerCase().replace(/\s+/g, '-')}-site.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Génère une URL pour l'aperçu du site
 */
export function generatePreviewUrl(config: Config): string {
  const configJson = JSON.stringify(config);
  const encodedConfig = btoa(configJson);
  return `/preview?config=${encodedConfig}`;
}
