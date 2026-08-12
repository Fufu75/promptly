# Migrations Promptly

## Structure

Ce dossier contient la migration consolidée du schéma de base de données.

### Fichier principal
- `00000000000000_initial_schema.sql` : **Migration complète et consolidée**
  - Tables (profiles, settings, slots, bookings)
  - Policies RLS (Row Level Security)
  - Fonctions helper
  - Triggers automatiques
  - Données par défaut

### Anciens fichiers (archive)
Les fichiers suivants sont conservés pour historique mais ne sont **plus nécessaires** :
- `20251106121806_*.sql` - Migration initiale Lovable
- `20251107000000_*.sql` - Fix permissions slots
- `20251107000001_*.sql` - Fix permissions bookings
- `20251107000003_*.sql` - Fix admin view profiles

---

## Utilisation pour un nouveau client

### 1. Créer un nouveau projet Supabase
```bash
# Via dashboard Supabase : https://supabase.com
```

### 2. Configurer les variables d'environnement
```bash
# Copier le .env.example
cp .env.example .env

# Remplir avec les credentials du nouveau projet
VITE_SUPABASE_PROJECT_ID="votre-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="votre-anon-key"
VITE_SUPABASE_URL="https://votre-project-id.supabase.co"
```

### 3. Lier le projet local
```bash
npx supabase link --project-ref votre-project-id
```

### 4. Appliquer le schéma
```bash
npx supabase db push
```

### 5. Personnaliser pour le client
Modifier dans le dashboard Supabase (Table Editor → settings) :
- `brand_name` : "Mon Salon de Coiffure" / "Club Padel XYZ"
- `business_sector` : "Salon de coiffure" / "Terrain de padel"
- `primary_color` / `secondary_color`
- `opening_hours`

---

## Reset complet (développement)

Si besoin de tout réinitialiser :

```bash
# Supprime toutes les tables et réapplique les migrations
npx supabase db reset

# OU via SQL Editor Supabase :
# DROP SCHEMA public CASCADE;
# CREATE SCHEMA public;
# puis réappliquer la migration
```

---

## Nettoyage (optionnel)

Pour supprimer les anciennes migrations et garder uniquement la version consolidée :

```bash
# Supprimer les anciennes migrations
rm supabase/migrations/20251106*.sql
rm supabase/migrations/20251107*.sql

# Garder uniquement
# - 00000000000000_initial_schema.sql
# - README.md (ce fichier)
```

---

## Checklist déploiement nouveau client

- [ ] Créer projet Supabase
- [ ] Configurer `.env`
- [ ] Link projet : `npx supabase link`
- [ ] Push schema : `npx supabase db push`
- [ ] Personnaliser settings dans Supabase
- [ ] Créer compte admin via signup + modifier role en 'admin' dans table profiles
- [ ] Tester création de créneaux
- [ ] Tester réservation client
- [ ] Configurer domaine custom (optionnel)
