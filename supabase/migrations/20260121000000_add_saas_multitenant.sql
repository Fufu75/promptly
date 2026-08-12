-- ============================================================================
-- PROMPTLY GENERATOR v2.0 - SAAS MULTI-TENANT ARCHITECTURE
-- ============================================================================
-- Description: Extension du schéma pour supporter le déploiement multi-tenant
-- Ajoute la gestion des clients (sites générés) et leurs admins
-- ============================================================================

-- ============================================================================
-- 1. EXTEND PROFILES ROLE
-- ============================================================================

-- Ajouter le rôle 'super_admin' pour les admins de l'app mère
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'client', 'super_admin'));

COMMENT ON COLUMN public.profiles.role IS 'Role: client (user site), admin (admin site client), super_admin (admin app mère)';


-- ============================================================================
-- 2. TABLE CLIENTS
-- ============================================================================

-- Table: clients
-- Représente chaque site client généré par l'application mère
-- Un client = 1 conteneur Docker déployé avec sa propre config
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Informations du site
  site_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- Ex: "salon-marie-paris"
  description TEXT,
  
  -- Configuration
  config_url TEXT, -- Path vers Storage bucket ou JSON direct
  
  -- Déploiement
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'deployed', 'failed', 'suspended')),
  deployment_url TEXT, -- Ex: client-uuid.vps-ip.nip.io
  container_id TEXT, -- Docker container ID
  container_port INTEGER, -- Port assigné (3001-4000)
  
  -- Métadonnées
  template_version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
);

COMMENT ON TABLE public.clients IS 'Sites clients générés et déployés par Promptly Generator';
COMMENT ON COLUMN public.clients.status IS 'pending: en attente, deploying: déploiement en cours, deployed: actif, failed: erreur, suspended: désactivé';
COMMENT ON COLUMN public.clients.config_url IS 'Path vers le fichier config.json dans Supabase Storage ou JSON stringifié';


-- ============================================================================
-- 3. TABLE CLIENT_ADMINS
-- ============================================================================

-- Table: client_admins
-- Gère les admins de chaque site client
-- Le créateur du site est automatiquement 'owner'
CREATE TABLE public.client_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, user_id)
);

COMMENT ON TABLE public.client_admins IS 'Admins des sites clients (owner = créateur, admin = gestionnaire ajouté)';
COMMENT ON COLUMN public.client_admins.role IS 'owner: créateur du site, admin: gestionnaire complet, viewer: lecture seule';


-- ============================================================================
-- 4. TABLE DEPLOYMENT_LOGS
-- ============================================================================

-- Table: deployment_logs
-- Logs des déploiements pour debugging
CREATE TABLE public.deployment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployment_logs_client_id ON public.deployment_logs(client_id);
CREATE INDEX idx_deployment_logs_created_at ON public.deployment_logs(created_at DESC);

COMMENT ON TABLE public.deployment_logs IS 'Logs des déploiements et opérations sur les sites clients';


-- ============================================================================
-- 5. TABLE AI_MODIFICATIONS
-- ============================================================================

-- Table: ai_modifications
-- Historique des modifications de code par l'IA
CREATE TABLE public.ai_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Modification
  user_prompt TEXT NOT NULL,
  target_files TEXT[], -- ['src/pages/Index.tsx', 'src/index.css']
  changes JSONB NOT NULL, -- { "src/pages/Index.tsx": "new content..." }
  
  -- Résultat
  success BOOLEAN NOT NULL,
  iterations INTEGER DEFAULT 1,
  error_logs TEXT,
  
  -- Métadonnées
  model_used TEXT, -- 'ollama/llama3.2', 'gpt-4'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_modifications_client_id ON public.ai_modifications(client_id);
CREATE INDEX idx_ai_modifications_user_id ON public.ai_modifications(user_id);

COMMENT ON TABLE public.ai_modifications IS 'Historique des modifications de code effectuées par l''agent IA';


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS sur les nouvelles tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_modifications ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 6.1. CLIENTS POLICIES
-- ============================================================================

-- Users peuvent voir leurs propres clients
CREATE POLICY "Users can view their own clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

-- Users peuvent créer leurs propres clients
CREATE POLICY "Users can create clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users peuvent modifier leurs propres clients
CREATE POLICY "Users can update their own clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id);

-- Super admins peuvent tout voir et gérer
CREATE POLICY "Super admins can manage all clients"
  ON public.clients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ));


-- ============================================================================
-- 6.2. CLIENT_ADMINS POLICIES
-- ============================================================================

-- Users peuvent voir les admins de leurs clients
CREATE POLICY "Users can view admins of their clients"
  ON public.client_admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = client_id AND user_id = auth.uid()
    )
  );

-- Owners peuvent ajouter/supprimer des admins
CREATE POLICY "Owners can manage client admins"
  ON public.client_admins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.client_admins AS ca
      WHERE ca.client_id = client_admins.client_id 
        AND ca.user_id = auth.uid() 
        AND ca.role = 'owner'
    )
  );


-- ============================================================================
-- 6.3. DEPLOYMENT_LOGS POLICIES
-- ============================================================================

-- Owners/admins peuvent voir les logs de leurs clients
CREATE POLICY "Client admins can view deployment logs"
  ON public.deployment_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_admins
      WHERE client_id = deployment_logs.client_id 
        AND user_id = auth.uid()
    )
  );

-- Super admins peuvent voir tous les logs
CREATE POLICY "Super admins can view all logs"
  ON public.deployment_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  ));


-- ============================================================================
-- 6.4. AI_MODIFICATIONS POLICIES
-- ============================================================================

-- Users peuvent voir l'historique IA de leurs clients
CREATE POLICY "Users can view AI modifications of their clients"
  ON public.ai_modifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = client_id AND user_id = auth.uid()
    )
  );

-- Users peuvent créer des modifications IA pour leurs clients
CREATE POLICY "Users can create AI modifications for their clients"
  ON public.ai_modifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE id = client_id AND user_id = auth.uid()
    )
  );


-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at sur clients
CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Auto-créer l'owner comme admin du client
CREATE OR REPLACE FUNCTION public.handle_new_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Créer automatiquement une entrée client_admins avec role 'owner'
  INSERT INTO public.client_admins (client_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_client_created
  AFTER INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_client();


-- ============================================================================
-- 8. FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction: Obtenir tous les clients d'un user (y compris ceux où il est admin)
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
    COALESCE(ca.role, 'owner') as role,
    c.created_at
  FROM public.clients c
  LEFT JOIN public.client_admins ca ON ca.client_id = c.id AND ca.user_id = p_user_id
  WHERE c.user_id = p_user_id OR ca.user_id = p_user_id
  ORDER BY c.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_clients IS 'Retourne tous les sites accessibles par un utilisateur (créés ou admin)';


-- Fonction: Vérifier si un user est admin d'un client
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
-- 9. INDEXES POUR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_clients_slug ON public.clients(slug);
CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_client_admins_client_id ON public.client_admins(client_id);
CREATE INDEX idx_client_admins_user_id ON public.client_admins(user_id);


-- ============================================================================
-- 10. STORAGE BUCKET POUR CONFIGS
-- ============================================================================

-- Créer le bucket pour stocker les config.json des clients
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-configs',
  'client-configs',
  false, -- Privé
  1048576, -- 1MB max par fichier
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users peuvent uploader la config de leurs propres clients
CREATE POLICY "Users can upload their client configs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-configs' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users peuvent lire la config de leurs clients
CREATE POLICY "Users can read their client configs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'client-configs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: Users peuvent mettre à jour la config de leurs clients
CREATE POLICY "Users can update their client configs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'client-configs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
