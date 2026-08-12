# Architecture Générale — Promptly

## Vue d'ensemble

Promptly est une plateforme SaaS multi-tenant permettant à n'importe quel professionnel de générer un site de réservation complet via une interface conversationnelle IA. L'utilisateur décrit son activité en répondant à 9 questions, l'IA sélectionne et configure automatiquement les composants visuels adaptés, et le résultat est prévisualisable et déployable en quelques minutes.

## Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| **Frontend** | React 18 + TypeScript + Vite | Interface utilisateur |
| **Styles** | Tailwind CSS + shadcn/ui (48 composants) | Design system |
| **Routing** | React Router v6 | Navigation SPA |
| **Base de données** | Supabase PostgreSQL | Données multi-tenant |
| **Auth** | Supabase Auth (JWT) | Authentification |
| **Storage** | Supabase Storage | Images utilisateurs |
| **LLM** | OpenAI gpt-4o-mini | Génération et modification IA |
| **Markdown** | react-markdown | Affichage réponses IA |
| **Port dev** | 8080 (Vite) | Développement local |

## Routing (`src/App.tsx`)

```
/           → CreatorLanding    Page d'accueil plateforme
/auth       → Auth              Connexion / inscription
/dashboard  → ProjectsDashboard Liste des projets de l'utilisateur
/creator    → SiteCreator       Générateur IA (cœur de l'application)
/preview/*  → SitePreview       Prévisualisation site généré
*           → NotFound
```

Les providers racine wrappent toute l'application : `QueryClientProvider`, `HelmetProvider`, `TooltipProvider`, `AuthProvider`, `BrowserRouter`.

## Flux de création d'un site

```
[Utilisateur]
     │
     ▼
[/auth] ──── Inscription / Connexion (Supabase Auth)
     │
     ▼
[/dashboard] ──── Liste des projets (table clients, RLS par user_id)
     │
     ▼
[/creator] ──── Questionnaire 9 questions
     │
     ▼
[OpenAI API] ──── generateInitialConfigs()
     │               → globalConfig (marque, services, couleurs)
     │               → homepageBlocks (8 blocs, variants sélectionnés)
     │               → authBlock (1 variant)
     │               → bookingBlocks (3 blocs)
     ▼
[SiteCreator] ──── Chat conversationnel (updateConfigsFromChat)
     │              + Édition manuelle (ConfigPanel)
     │              + Upload images (Supabase Storage)
     │
     ▼
[Sauvegarde] ──── INSERT/UPDATE table clients (config_url JSON)
     │
     ▼
[Déploiement] ──── Orchestrateur (backend Gabin)
```

## Séparation des responsabilités

```
src/
├── pages/          Orchestrateurs de haut niveau (routing, layout)
├── components/
│   ├── blocks/     37 blocs React (homepage / auth / booking)
│   ├── creator/    Panels UI du créateur (Chat, Config)
│   └── ui/         Composants shadcn/ui génériques
├── hooks/
│   ├── useSiteCreator.ts   Toute la logique créateur (~600 lignes)
│   └── useAuth.ts          Gestion session Supabase
├── services/
│   ├── ai/         Pipeline OpenAI (appels, system prompt, types)
│   └── imageUpload.ts      Compression + Storage Supabase
├── config/
│   ├── libraries/  Bibliothèques de composants (JSON, lus par l'IA)
│   └── pages/      Configs par défaut des 3 pages
└── types/          Interfaces TypeScript partagées
```

## Persistance des données

Le projet utilise **deux niveaux de persistance** qui coexistent :

**localStorage** (`creator-session`) — Session temporaire de travail :
- Sauvegardé automatiquement après chaque génération IA ou modification
- Contient : config, blocs, businessContext, projectName, currentProjectId
- Le chat est intentionnellement **exclu** (éphémère à chaque session)
- Effacé lors du chargement d'un projet Supabase existant

**Supabase** (table `clients`) — Persistance longue durée :
- Sauvegardé manuellement via le bouton "Sauvegarder"
- Structure stockée dans `config_url` (JSON stringifié) :
  ```json
  {
    ...globalConfig,
    "_pageBlocks": { "homepage": [...], "auth": {...}, "booking": [...] },
    "_chatState": { "businessContext": "..." }
  }
  ```

## Statistiques du projet

| Métrique | Valeur |
|----------|--------|
| Blocs React implémentés | 37 (26 homepage + 3 auth + 8 booking) |
| Types de blocs | 12 (Header, Hero, Features, Services…) |
| Variants par bloc | 2 à 3 |
| Questions questionnaire | 9 |
| Migrations Supabase | 20 |
| Tables core | 8 (profiles, clients, bookings, slots…) |
| Hooks personnalisés | 6 (useSiteCreator, useAuth, useConfig…) |
| Lignes system prompt IA | ~150 (4 couches) |
