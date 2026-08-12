# Déploiement — Frontend & Sites Clients

> **Note pour Gabin** : La section [Déploiement de la plateforme (Vercel)](#déploiement-de-la-plateforme-vercel) est documentée. La section [Déploiement des sites clients](#déploiement-des-sites-clients) est à compléter avec les détails de ton orchestrateur : architecture réelle, API endpoints, flow de déploiement Docker/Nginx, gestion des sous-domaines et logs.

## Vue d'ensemble

Promptly distingue deux niveaux de déploiement :

1. **La plateforme elle-même** (ce dépôt) — déployée sur Vercel
2. **Les sites clients générés** — déployés via un orchestrateur backend (Docker + Nginx sur VPS)

---

## Déploiement de la plateforme (Vercel)

### Frontend React

La plateforme Promptly est une SPA React compilée par Vite. Le déploiement Vercel s'effectue depuis le dépôt GitHub.

**Configuration requise dans Vercel :**

```
Build Command  : npm run build
Output Dir     : dist
Framework      : Vite
```

**Variables d'environnement à configurer dans Vercel :**

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_ORCHESTRATOR_URL    (URL publique du VPS orchestrateur)
VITE_SITEGEN_URL         (URL publique du serveur : porte le relais IA)
```

> Les variables préfixées `VITE_` sont embarquées dans le bundle JavaScript au build. Ne jamais y mettre de clés secrètes (clé OpenAI, service role key Supabase).

**La clé OpenAI ne se configure pas ici.** `OPENAI_API_KEY` et `OPENAI_MODEL`
se déclarent dans l'environnement du **serveur** (`server/index.js`), pas dans
Vercel côté frontend. Le navigateur appelle `{VITE_SITEGEN_URL}/ai/chat`.

---

## Déploiement des sites clients

### Architecture cible

Chaque site de réservation généré est déployé comme un **conteneur Docker indépendant** sur un VPS, exposé via Nginx avec un sous-domaine dédié.

```
[Promptly Platform] → [Orchestrateur API :4001]
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               [Client A]  [Client B]  [Client C]
               Docker :3001  Docker :3002  Docker :3003
                    │
                  Nginx
                    │
           client-a.promptly.fr
```

### Variables d'environnement (VPS)

```bash
VPS_IP=<ip_publique_vps>
PROMPTLY_BASE_DIR=/opt/promptly-saas
ENABLE_DOCKER=true
ENABLE_NGINX=true
DEPLOY_TOKEN=<token_secret>     # Sécurise les appels inter-services
ORCHESTRATOR_PORT=4001
```

### Statuts de déploiement (table `clients`)

```
pending    → Site créé, pas encore déployé
deploying  → Déploiement en cours
deployed   → Site en ligne (deployment_url renseignée)
failed     → Erreur lors du déploiement
suspended  → Site suspendu
```

Les `deployment_logs` tracent chaque étape avec niveau `info | warning | error`.

### Onglet Déploiement dans SiteCreator

Le composant `DeploymentManager` dans l'onglet "Déploiement" du créateur permet de déclencher le déploiement depuis l'interface :

```typescript
<DeploymentManager
  config={generatedConfig}
  siteName={projectName}
  existingClientId={currentProjectId}
/>
```

Le projet doit être **sauvegardé avant de déployer** — un bandeau d'alerte l'indique si `currentProjectId` est null.

### Export ZIP (fallback)

En cas d'indisponibilité du backend, un export ZIP du site statique est disponible via `handleGenerateSite()` :

```typescript
const handleGenerateSite = async () => {
  try {
    // Tentative backend
    await generateSiteZipBackend(generatedConfig, siteName);
  } catch {
    // Fallback local
    await downloadSiteZip(generatedConfig, siteName);
  }
};
```

Le ZIP contient le site compilé, prêt à être hébergé sur n'importe quelle infrastructure statique.

---

## Résumé des points de configuration

| Composant | Où configurer | Variables clés |
|-----------|---------------|----------------|
| Plateforme frontend | Vercel Dashboard | `VITE_SUPABASE_*`, `VITE_SITEGEN_URL` |
| Relais IA | Environnement du serveur | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Orchestrateur backend | VPS `.env` | `VPS_IP`, `DEPLOY_TOKEN`, `ENABLE_DOCKER` |
| Supabase | Dashboard Supabase | RLS, Storage buckets, Edge Functions |
| OpenAI | Platform OpenAI | Clé API, limites de quota |
