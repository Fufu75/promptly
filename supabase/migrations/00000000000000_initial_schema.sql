-- ============================================================================
-- PROMPTLY GENERATOR - SCHÉMA INITIAL (SOURCE DE VÉRITÉ)
-- ============================================================================
-- Version : 3.0.0 — SaaS Multi-tenant
--
-- Architecture :
--   PLATEFORME (application générateur)
--     - profiles      : utilisateurs de la plateforme (créateurs de sites)
--     - clients       : sites de réservation générés et déployés
--     - client_admins : droits d'accès par site
--     - deployment_logs    : logs de déploiement
--     - ai_modifications   : historique des modifications IA
--
--   SITES DÉPLOYÉS (partagent le même Supabase, isolés par client_id)
--     - profiles (client_id non-null) : clients finaux d'un site déployé
--     - bookings                      : réservations d'un site déployé
--     - slots                         : créneaux legacy (optionnel v2)
--     - settings                      : config globale d'un site déployé
-- ============================================================================


-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ============================================================================
-- 1. FONCTIONS UTILITAIRES
-- ============================================================================

-- Vérifie si l'utilisateur courant est admin (rôle 'admin' ou 'super_admin')
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- Vérifie si l'utilisateur courant est super_admin (admin de la plateforme)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Met à jour automatiquement updated_at avant chaque UPDATE
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Helper pour lire client_id sans déclencher la récursion RLS sur profiles
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Crée automatiquement un profil lors de l'inscription
-- Plateforme : metadata = { full_name, role: 'admin' }           → client_id = NULL
-- Template   : metadata = { full_name, role: 'client', client_id } → client_id = <uuid>
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, client_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    CASE
      WHEN NEW.raw_user_meta_data->>'client_id' IS NOT NULL
        AND NEW.raw_user_meta_data->>'client_id' != 'null'
      THEN (NEW.raw_user_meta_data->>'client_id')::UUID
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$;

-- Crée automatiquement une entrée client_admins (owner) lors de la création d'un site
CREATE OR REPLACE FUNCTION public.handle_new_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.client_admins (client_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$;

-- Retourne tous les sites accessibles par un utilisateur
CREATE OR REPLACE FUNCTION public.get_user_clients(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  site_name TEXT,
  slug TEXT,
  status TEXT,
  deployment_url TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.site_name,
    c.slug,
    c.status,
    c.deployment_url,
    COALESCE(ca.role, 'owner') AS role,
    c.created_at
  FROM public.clients c
  LEFT JOIN public.client_admins ca ON ca.client_id = c.id AND ca.user_id = p_user_id
  WHERE c.user_id = p_user_id OR ca.user_id = p_user_id
  ORDER BY c.created_at DESC;
$$;

-- Vérifie si un utilisateur est admin d'un site client
CREATE OR REPLACE FUNCTION public.is_client_admin(p_client_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    LEFT JOIN public.client_admins ca ON ca.client_id = c.id
    WHERE c.id = p_client_id
      AND (c.user_id = p_user_id OR ca.user_id = p_user_id)
  );
$$;


-- ============================================================================
-- 2. TABLES PLATEFORME
-- ============================================================================

-- Table: profiles
-- Utilisateurs de la plateforme (créateurs) ET clients finaux des sites déployés.
-- client_id = NULL  → créateur sur la plateforme
-- client_id = UUID  → client final d'un site déployé
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'client'
                CHECK (role IN ('admin', 'client', 'super_admin')),
  client_id   UUID,  -- FK vers clients ajoutée après (dépendance circulaire)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.profiles.client_id IS
  'NULL = utilisateur de la plateforme. Non-null = client final du site déployé.';

-- Table: clients
-- Chaque site de réservation généré et déployé par la plateforme.
CREATE TABLE public.clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_name         TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  description       TEXT,
  config_url        TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'deploying', 'deployed', 'failed', 'suspended')),
  deployment_url    TEXT,
  container_id      TEXT,
  container_port    INTEGER,
  template_version  TEXT DEFAULT '1.0.0',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_at       TIMESTAMPTZ,
  last_activity_at  TIMESTAMPTZ
);

COMMENT ON TABLE  public.clients IS 'Sites clients générés et déployés par Promptly Generator.';
COMMENT ON COLUMN public.clients.config_url IS 'Path vers config.json dans Supabase Storage ou JSON stringifié.';

-- FK circulaire : profiles.client_id → clients
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Table: client_admins
-- Droits d'accès par site (owner = créateur, admin = gestionnaire ajouté, viewer = lecture)
CREATE TABLE public.client_admins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'admin'
               CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, user_id)
);

-- Table: deployment_logs
-- Logs des déploiements pour debugging.
CREATE TABLE public.deployment_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  level      TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  message    TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: ai_modifications
-- Historique des modifications de code effectuées par l'agent IA.
CREATE TABLE public.ai_modifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  user_prompt  TEXT NOT NULL,
  target_files TEXT[],
  changes      JSONB NOT NULL,
  success      BOOLEAN NOT NULL,
  iterations   INTEGER DEFAULT 1,
  error_logs   TEXT,
  model_used   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 3. TABLES SITES DÉPLOYÉS (partagées, isolées par client_id)
-- ============================================================================

-- Table: settings
-- Configuration globale d'un site déployé.
CREATE TABLE public.settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: slots (legacy — optionnel depuis v2)
-- En v2 les créneaux sont auto-générés depuis openingHours.
-- Conservé pour compatibilité et cas particuliers (jours fermés, exceptions).
CREATE TABLE public.slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_slot_time_range CHECK (end_time > start_time)
);

-- Table: bookings
-- Réservations des clients finaux sur un site déployé.
-- client_id identifie le site auquel appartient la réservation.
CREATE TABLE public.bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  slot_id     UUID REFERENCES public.slots(id) ON DELETE SET NULL,  -- optionnel v2
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id  TEXT,
  duration    INTEGER,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_booking_time_range CHECK (end_time > start_time)
);

COMMENT ON COLUMN public.bookings.client_id IS 'Site déployé auquel appartient cette réservation.';


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_admins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_modifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings        ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 4.1. PROFILES
-- ============================================================================

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Les admins voient tous les profils du même site client
CREATE POLICY "Admins can view profiles of their site"
  ON public.profiles FOR SELECT
  USING (
    public.is_admin()
    AND (
      client_id IS NULL
      OR client_id = public.get_my_client_id()
    )
  );

-- Super admins voient tout
CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_super_admin());


-- ============================================================================
-- 4.2. CLIENTS (sites générés)
-- ============================================================================

CREATE POLICY "Users can view their own clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
  ON public.clients FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage all clients"
  ON public.clients FOR ALL
  USING (public.is_super_admin());


-- ============================================================================
-- 4.3. CLIENT_ADMINS
-- ============================================================================

CREATE POLICY "Users can view admins of their clients"
  ON public.client_admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = client_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage client admins"
  ON public.client_admins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.client_admins ca
      WHERE ca.client_id = client_admins.client_id
        AND ca.user_id = auth.uid()
        AND ca.role = 'owner'
    )
  );


-- ============================================================================
-- 4.4. DEPLOYMENT_LOGS
-- ============================================================================

CREATE POLICY "Client admins can view deployment logs"
  ON public.deployment_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_admins
      WHERE client_id = deployment_logs.client_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can view all logs"
  ON public.deployment_logs FOR SELECT
  USING (public.is_super_admin());


-- ============================================================================
-- 4.5. AI_MODIFICATIONS
-- ============================================================================

CREATE POLICY "Users can view AI modifications of their clients"
  ON public.ai_modifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = client_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create AI modifications for their clients"
  ON public.ai_modifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = client_id AND user_id = auth.uid()
    )
  );


-- ============================================================================
-- 4.6. SETTINGS
-- ============================================================================

CREATE POLICY "Anyone can view settings"
  ON public.settings FOR SELECT
  USING (true);


-- ============================================================================
-- 4.7. SLOTS (legacy)
-- ============================================================================

CREATE POLICY "Anyone can view slots"
  ON public.slots FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage slots"
  ON public.slots FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authenticated users can update slot availability"
  ON public.slots FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================================
-- 4.8. BOOKINGS — isolées par client_id
-- ============================================================================

-- Un utilisateur voit ses propres réservations
CREATE POLICY "Users can view their own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id);

-- Tout utilisateur authentifié du même site voit les réservations confirmées
-- (nécessaire pour vérifier la disponibilité des créneaux)
CREATE POLICY "Authenticated users can view confirmed bookings for availability"
  ON public.bookings FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND status = 'confirmed'
    AND client_id = (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create their own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookings"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookings"
  ON public.bookings FOR DELETE
  USING (auth.uid() = user_id);

-- Les admins voient toutes les réservations de leur site
CREATE POLICY "Admins can view all bookings"
  ON public.bookings FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can delete any booking"
  ON public.bookings FOR DELETE
  USING (public.is_admin());


-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_client_created
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_client();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_settings
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_slots
  BEFORE UPDATE ON public.slots
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_bookings
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- 6. CONTRAINTES
-- ============================================================================

-- Pas de chevauchement de réservations confirmées au sein d'un même site client
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_time_overlap
  EXCLUDE USING gist (
    client_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status = 'confirmed');

-- Pas de chevauchement de créneaux actifs (legacy)
ALTER TABLE public.slots
  ADD CONSTRAINT slots_no_time_overlap
  EXCLUDE USING gist (
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status = 'active');


-- ============================================================================
-- 7. INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_client_id         ON public.profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id            ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_slug               ON public.clients(slug);
CREATE INDEX IF NOT EXISTS idx_clients_status             ON public.clients(status);
CREATE INDEX IF NOT EXISTS idx_client_admins_client_id    ON public.client_admins(client_id);
CREATE INDEX IF NOT EXISTS idx_client_admins_user_id      ON public.client_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_client_id  ON public.deployment_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_created_at ON public.deployment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_mods_client_id          ON public.ai_modifications(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id         ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id           ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id        ON public.bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time        ON public.bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_time_range        ON public.bookings(start_time, end_time);


-- ============================================================================
-- 8. STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-configs',
  'client-configs',
  false,
  1048576,
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their client configs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-configs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can read their client configs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'client-configs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their client configs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'client-configs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Bucket: site-images
-- Images uploadées par les créateurs pour personnaliser leur site (logo, hero, etc.)
-- Structure du path : {user_id}/{project_id}/{filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-images',
  'site-images',
  true,
  5242880,  -- 5 MB max par fichier (avant compression)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read site images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'site-images');

CREATE POLICY "Users upload own images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'site-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'site-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- 9. DONNÉES PAR DÉFAUT
-- ============================================================================

INSERT INTO public.settings (key, value) VALUES
  ('brand_name',      '"BookingHub"'::jsonb),
  ('primary_color',   '"#0EA5E9"'::jsonb),
  ('secondary_color', '"#06B6D4"'::jsonb),
  ('business_sector', '"General Services"'::jsonb),
  ('opening_hours',   '{"monday":"9:00-17:00","tuesday":"9:00-17:00","wednesday":"9:00-17:00","thursday":"9:00-17:00","friday":"9:00-17:00","saturday":"Closed","sunday":"Closed"}'::jsonb);


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
