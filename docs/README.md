# Documentation Technique — Promptly

Promptly est une plateforme SaaS permettant de générer des sites de réservation complets via une interface conversationnelle IA. L'utilisateur décrit son activité, l'IA sélectionne et configure les composants visuels, et le résultat est prévisualisable et déployable en quelques minutes.

## Sommaire

| # | Document | Description |
|---|----------|-------------|
| 01 | [Architecture Générale](./01-architecture.md) | Stack technique, routing, flux de création, persistance |
| 02 | [Moteur de Templates](./02-template-engine.md) | Système de blocs, bibliothèques JSON, PageRenderer |
| 03 | [Pipeline IA](./03-ai-pipeline.md) | OpenAI, questionnaire, system prompt, types de réponses |
| 04 | [Interface Créateur](./04-creator-interface.md) | SiteCreator, useSiteCreator, ChatPanel, ConfigPanel |
| 05 | [Base de données Multi-tenant](./05-multitenant-db.md) | Supabase, RLS, tables, Storage images |
| 06 | [Déploiement](./06-deployment.md) | Vercel (plateforme), Docker/Nginx (sites clients) |

## Chiffres clés

- **37 blocs React** implémentés (26 homepage + 3 auth + 8 booking)
- **12 types de blocs**, 2 à 3 variants chacun
- **9 questions** dans le questionnaire d'onboarding
- **4 couches** de system prompt (~150 lignes)
- **20 migrations** Supabase
- **1 appel OpenAI** pour générer un site complet (questionnaire → 4 configs)

## Démarrage rapide

```bash
git clone <repo>
cp .env.example .env
# Remplir VITE_SUPABASE_*, puis OPENAI_API_KEY (côté serveur, sans préfixe VITE_)
npm install
npm run dev:all   # front + serveur : le relais IA est requis pour générer
```
