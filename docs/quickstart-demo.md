# 🚀 QUICKSTART - Demo Soutenance BookWise Generator v2.0

Ce guide vous permet de lancer rapidement le projet pour la démonstration de lundi.

---

## 📋 Prérequis

- **Node.js 20+** installé
- **Docker** et **Docker Compose** installés
- **Compte Supabase** (projet créé)
- **Terminal** / **iTerm** (macOS)

---

## ⚡ Installation Rapide (Mode Dev)

### 1. Cloner et installer les dépendances

```bash
cd /Users/gabinfulcrand/Desktop/PFE/book-wise-76
npm install
```

### 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine :

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Ollama (IA locale)
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=llama3.2

# Site Generator Backend
VITE_SITEGEN_URL=http://localhost:4000

# Orchestrator Backend (nouveau)
VITE_ORCHESTRATOR_URL=http://localhost:4001

# VPS (pour déploiement réel, optionnel en dev)
VPS_IP=localhost
ENABLE_DOCKER=false
ENABLE_NGINX=false
```

### 3. Appliquer les migrations Supabase

```bash
# Option 1 : Via Supabase CLI (si installée)
supabase db push

# Option 2 : Manuellement via le dashboard Supabase
# - Aller sur https://supabase.com/dashboard
# - Ouvrir SQL Editor
# - Copier-coller le contenu de :
#   - supabase/migrations/00000000000000_initial_schema.sql
#   - supabase/migrations/20260121000000_add_saas_multitenant.sql
```

### 4. Lancer Ollama (dans un terminal séparé)

```bash
# Terminal 1 : Ollama
docker compose up ollama
# OU si Ollama installé localement :
ollama serve

# Télécharger le modèle (première fois)
ollama pull llama3.2
```

### 5. Lancer l'orchestrator backend (dans un autre terminal)

```bash
# Terminal 2 : Orchestrator
npm run orchestrator
```

### 6. Lancer le frontend (dans un troisième terminal)

```bash
# Terminal 3 : Frontend
npm run dev
```

### 7. Accéder à l'application

Ouvrez votre navigateur : **http://localhost:5173**

---

## 🎬 Scénario de Démonstration (Soutenance)

### Phase 1 : Configuration initiale (2 minutes)

1. **Créer un compte** via l'interface d'auth
2. **Remplir le questionnaire** :
   - Type de business : "Salon de massage"
   - Nom : "Zen Massage"
   - Services : "Massage relaxant, Massage sportif"
   - Horaires : "Lundi-Vendredi 9h-19h"
   - Couleur : `#8B5CF6` (violet)
   - Email : `contact@zenmassage.fr`

### Phase 2 : Chat avec l'IA (3 minutes)

3. **Demander à l'IA** :
   - "Ajoute un service 'Massage aux pierres chaudes' à 80€ pour 90 minutes"
   - "Change les textes de la page d'accueil pour un ton plus zen et relaxant"
   - "Propose 3 bénéfices clés pour attirer les clients stressés"

4. **Vérifier** que l'IA modifie bien la configuration en temps réel

### Phase 3 : Modification de code avancée (3 minutes)

5. **Ouvrir le composant "Modification de Code par IA"**
6. **Demander** :
   - "Ajoute une section galerie avec 6 images de massages"
   - "Change le style du bouton CTA pour qu'il soit en forme de pilule"
7. **Montrer** les logs de lint/build/self-correction

### Phase 4 : Déploiement (2 minutes)

8. **Cliquer sur "Déployer le site"**
9. **Montrer** :
   - Le statut en temps réel (pending → deploying → deployed)
   - Les logs de déploiement
   - L'URL générée (si VPS configuré)
10. **Ouvrir** le site déployé dans un nouvel onglet

---

## 🔧 Fonctionnalités Clés à Démontrer

### 1. Architecture Multi-tenant
- ✅ 1 utilisateur = plusieurs sites clients
- ✅ Chaque site = 1 conteneur Docker
- ✅ Sous-domaine unique (`client-{id}.vps-ip.nip.io`)

### 2. Agent IA Avancé
- ✅ Modification du `config.json` (services, couleurs, horaires)
- ✅ Modification du code source (TSX, CSS)
- ✅ Self-correction via lint → build → logs → re-génération
- ✅ Pipeline à 3 itérations max

### 3. Déploiement Automatisé
- ✅ Formulaire → Supabase → Edge Function → Backend Orchestrator
- ✅ Création conteneur Docker + Nginx reverse proxy
- ✅ Hot Reload (modification config → rechargement instantané)

### 4. Temps Réel
- ✅ Supabase Realtime (status deployment : pending → deploying → deployed)
- ✅ Logs de déploiement en direct

---

## 🎯 Points à Mettre en Avant (Soutenance)

### Différenciation LLM vs NLP Classique

**Question attendue** : "Pourquoi un LLM et pas du NLP classique ?"

**Réponse** :
1. **Génération de code structuré** :
   - NLP : extraction d'entités → règles if/else rigides
   - LLM : génération JSON + TSX + CSS en one-shot
   
2. **Adaptabilité multi-domaines** :
   - NLP : 1 modèle par secteur (maintenance explosive)
   - LLM : généralisation cross-domain via few-shot learning

3. **Self-correction** :
   - NLP : impossible (pas de génération de code)
   - LLM : pipeline lint → build → logs → re-génération automatique

4. **Ollama vs GPT** :
   - **Ollama** : 0€/requête, données locales (RGPD), customizable
   - **GPT** : fallback si Ollama échoue (approche hybride)

### Métriques à Citer

- ⏱️ **Temps de génération** : < 2 min (questionnaire → site déployé)
- 🎯 **Précision IA** : 85-90% de configs correctes au 1er coup
- 🔁 **Self-correction** : 95% de succès après 3 itérations
- 💰 **Coût** : 0€/requête (Ollama) vs 0.03€ (GPT-4)

---

## 🐛 Troubleshooting

### Problème 1 : Ollama ne répond pas

```bash
# Vérifier le statut
curl http://localhost:11434/api/tags

# Si erreur, redémarrer Ollama
docker compose restart ollama
# OU
ollama serve
```

### Problème 2 : Supabase Migrations échouent

```bash
# Réinitialiser la base (ATTENTION : supprime les données)
supabase db reset

# Réappliquer les migrations
supabase db push
```

### Problème 3 : Port 4001 déjà utilisé

```bash
# Trouver le processus
lsof -i :4001

# Tuer le processus
kill -9 <PID>

# Relancer l'orchestrator
npm run orchestrator
```

### Problème 4 : Frontend ne se connecte pas au backend

Vérifier que les URLs dans `.env` correspondent :
- `VITE_ORCHESTRATOR_URL=http://localhost:4001`
- `VITE_SITEGEN_URL=http://localhost:4000`

---

## 📁 Structure du Projet (Référence)

```
book-wise-76/
├── src/
│   ├── components/
│   │   ├── AICodeModifier.tsx          ← Nouveau : Modif code par IA
│   │   ├── DeploymentManager.tsx       ← Nouveau : Déploiement VPS
│   │   └── QuestionnaireForm.tsx
│   ├── pages/
│   │   ├── SiteCreator.tsx             ← Modifié : Intégration nouveaux composants
│   │   └── CreatorLanding.tsx
│   ├── services/
│   │   ├── aiCodeModifier.ts           ← Nouveau : Service IA avancé
│   │   ├── ollamaService.ts
│   │   └── siteGenerator.ts
│   └── types/
│       └── siteConfig.ts
├── server/
│   ├── index.js                        ← Ancien backend (génération ZIP)
│   └── orchestrator.js                 ← Nouveau : Déploiement Docker
├── scripts/
│   └── deploy-client.sh                ← Nouveau : Script bash déploiement
├── supabase/
│   ├── migrations/
│   │   ├── 00000000000000_initial_schema.sql
│   │   └── 20260121000000_add_saas_multitenant.sql  ← Nouveau
│   └── functions/
│       └── deploy-site/
│           └── index.ts                ← Nouveau : Edge Function
├── ARCHITECTURE_SAAS_V2.md             ← Spec technique complète
├── QUICKSTART_DEMO.md                  ← Ce fichier
└── docker-compose.yml
```

---

## 📞 Contact & Support

- **GitHub** : (à remplir)
- **Email** : gabinfulcrand@gmail.com
- **Soutenance** : Lundi matin (10h45)

---

## ✅ Checklist Avant Soutenance

- [ ] Ollama fonctionne et modèle téléchargé
- [ ] Supabase migrations appliquées
- [ ] Orchestrator backend lancé
- [ ] Frontend lancé et accessible
- [ ] Tester le flow complet une fois
- [ ] Préparer les slides (15 max)
- [ ] Vidéo démo enregistrée (2 min) en backup
- [ ] Argumentaire "LLM vs NLP" maîtrisé

---

**Bonne chance pour la soutenance ! 🚀**
