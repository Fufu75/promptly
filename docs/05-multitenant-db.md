# Base de données Multi-tenant — Supabase

## Vue d'ensemble

Promptly utilise Supabase (PostgreSQL) avec une architecture **multi-tenant par ligne** : toutes les données clients coexistent dans les mêmes tables, isolées par des politiques RLS (Row Level Security) basées sur `user_id` ou `client_id`. Un utilisateur de la plateforme ne peut accéder qu'à ses propres projets.

## Fichiers concernés

```
src/integrations/supabase/client.ts   Client Supabase configuré
src/hooks/useAuth.ts                  Authentification et profil
src/services/imageUpload.ts           Upload / suppression images Storage
supabase/migrations/                  20 migrations numérotées
```

## Client Supabase (`src/integrations/supabase/client.ts`)

```typescript
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
```

La session est persistée dans `localStorage` et rafraîchie automatiquement. La clé `PUBLISHABLE_KEY` est la clé anon publique de Supabase — les RLS garantissent la sécurité des données côté base.

## Authentification (`src/hooks/useAuth.ts`)

### AuthContext

```typescript
interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  loading: boolean;
  signIn: (email, password) => Promise<{ error: any }>;
  signUp: (email, password, fullName) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}
```

### Cycle de vie de la session

1. Au mount : `supabase.auth.getSession()` restaure la session existante
2. `onAuthStateChange()` écoute les changements (login, logout, refresh token)
3. À chaque changement : `fetchProfile()` récupère le profil depuis la table `profiles`
4. À la déconnexion : logout Supabase + redirect `/auth`

## Tables principales

### `clients` — Sites générés

Table centrale du projet. Chaque ligne représente un site de réservation généré.

```sql
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  site_name       TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  config_url      TEXT,           -- JSON stringifié (config + blocs + chatState)
  status          TEXT DEFAULT 'pending',
                  -- pending | deploying | deployed | failed | suspended
  deployment_url  TEXT,
  container_id    TEXT,
  container_port  INTEGER,
  template_version TEXT DEFAULT '1.0.0',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deployed_at     TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
);
```

Le champ `config_url` contient la totalité de la configuration du site en JSON :

```json
{
  "brandName": "Studio Zen",
  "businessSector": "Bien-être",
  "theme": { "primaryColor": "#7C3AED" },
  "services": [...],
  "openingHours": {...},
  "contact": {...},
  "_pageBlocks": {
    "homepage": [ ...8 blocs... ],
    "auth": { "variant": "split-image", "props": {...} },
    "booking": [ ...3 blocs... ]
  },
  "_chatState": {
    "businessContext": "Salon de massage, 2 services..."
  }
}
```

**RLS** : un utilisateur ne peut voir et modifier que ses propres projets (`user_id = auth.uid()`).

### `profiles` — Utilisateurs

Créée automatiquement à l'inscription via le trigger `handle_new_user()` :

```sql
CREATE TABLE profiles (
  id         UUID REFERENCES auth.users PRIMARY KEY,
  email      TEXT,
  full_name  TEXT,
  role       TEXT DEFAULT 'user',   -- user | admin | super_admin
  client_id  UUID,                  -- NULL = utilisateur plateforme
  created_at TIMESTAMPTZ DEFAULT now()
);
```

`client_id` distingue les utilisateurs de la plateforme (valeur NULL) des utilisateurs finaux des sites déployés (UUID du site).

### `client_admins` — Gestion des droits

Permet à plusieurs utilisateurs de gérer le même site :

```sql
CREATE TABLE client_admins (
  id         UUID PRIMARY KEY,
  client_id  UUID REFERENCES clients,
  user_id    UUID REFERENCES auth.users,
  role       TEXT DEFAULT 'owner',  -- owner | admin | viewer
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, user_id)
);
```

### `bookings` — Réservations

Réservations effectuées sur les sites déployés :

```sql
CREATE TABLE bookings (
  id         UUID PRIMARY KEY,
  client_id  UUID,        -- Isolation par site
  user_id    UUID,
  slot_id    UUID,
  service_id UUID,
  status     TEXT,        -- pending | confirmed | cancelled
  start_time TIMESTAMPTZ,
  end_time   TIMESTAMPTZ,
  notes      TEXT,
  ...
);
```

Contrainte de non-chevauchement des créneaux (per site) :

```sql
EXCLUDE USING gist (
  client_id WITH =,
  tstzrange(start_time, end_time, '[)') WITH &&
) WHERE (status = 'confirmed' AND client_id IS NOT NULL);
```

### `deployment_logs` — Historique déploiements

```sql
CREATE TABLE deployment_logs (
  id        UUID PRIMARY KEY,
  client_id UUID REFERENCES clients,
  level     TEXT,    -- info | warning | error
  message   TEXT,
  details   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `ai_modifications` — Audit des modifications IA

Trace chaque interaction avec le LLM :

```sql
CREATE TABLE ai_modifications (
  id           UUID PRIMARY KEY,
  client_id    UUID REFERENCES clients,
  user_id      UUID,
  user_prompt  TEXT,
  target_files TEXT[],
  changes      JSONB,
  success      BOOLEAN,
  iterations   INTEGER,
  error_logs   TEXT,
  model_used   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

## Row Level Security (RLS)

### Politique principale sur `clients`

```sql
-- Lecture : uniquement ses propres projets
CREATE POLICY "Users can view own clients"
  ON clients FOR SELECT
  USING (user_id = auth.uid());

-- Insertion : uniquement avec son user_id
CREATE POLICY "Users can insert own clients"
  ON clients FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Modification : uniquement ses propres projets
CREATE POLICY "Users can update own clients"
  ON clients FOR UPDATE
  USING (user_id = auth.uid());
```

### Fonctions utilitaires (SECURITY DEFINER)

Définies pour éviter les boucles de récursion RLS :

```sql
-- Vérifie si l'utilisateur est admin ou super_admin
CREATE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Récupère le client_id de l'utilisateur courant
CREATE FUNCTION get_my_client_id() RETURNS UUID AS $$
  SELECT client_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;
```

`SECURITY DEFINER` permet à ces fonctions de s'exécuter avec les droits du définisseur, évitant les récursions infinies quand la RLS appelle elle-même une table soumise à RLS.

## Storage Supabase — `site-images`

Bucket public pour les images uploadées via le créateur.

### Politiques Storage

```sql
-- Lecture publique (images accessibles sur le site déployé)
CREATE POLICY "Public read site images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'site-images');

-- Upload : dans son propre dossier {user_id}/...
CREATE POLICY "Users upload own images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Suppression : uniquement ses propres images
CREATE POLICY "Users delete own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### Structure des chemins

```
site-images/
  {user_id}/
    {project_id}/
      {timestamp}-{filename}.{ext}
```

Exemple : `site-images/abc123/def456/1710000000-logo.png`

### imageUpload.ts — Pipeline de compression

Avant upload, chaque image est compressée côté client via Canvas API :

```typescript
// Compression : max 1920px, qualité JPEG 0.82
// PNG → PNG (préserve la transparence)
// WebP → WebP
// Autres → JPEG
const compressImage = async (file: File): Promise<{ blob: Blob; mime: string; ext: string }> => {
  const isPng = file.type === 'image/png';
  const isWebp = file.type === 'image/webp';
  const outputMime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
  // Canvas resize + toBlob(outputMime, quality)
};
```

`uploadSiteImage()` retourne l'URL publique du fichier une fois uploadé dans Storage.

`deleteSiteImage()` extrait le chemin depuis l'URL publique et le supprime de Storage.

## Migrations Supabase

20 migrations numérotées couvrent l'évolution complète du schéma :

| Migration | Description |
|-----------|-------------|
| `00000000000000` | Schema initial (tables, fonctions, RLS) |
| `20260121000000` | SaaS multi-tenant (tables clients, client_admins, RLS) |
| `20260121000001` | Bucket storage `client-configs` |
| `20260303000000` | Colonne `client_id` sur profiles et bookings |
| `20260303000001` | Correction RLS recursion (profiles) |
| `20260306000000` | Bucket storage `site-images` + RLS upload/delete |

Les migrations antérieures couvrent le système de booking (slots, réservations, disponibilités) qui constitue la couche métier des sites déployés.
