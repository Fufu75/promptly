# 🗄️ Configuration Supabase - BookWise Generator v2.0

Ce guide vous aide à configurer Supabase pour la gestion multi-projets.

---

## 📋 Étape 1 : Appliquer les Migrations

### Via Supabase Dashboard (Recommandé)

1. **Ouvrir le SQL Editor**
   - Aller sur https://supabase.com/dashboard
   - Sélectionner votre projet
   - Cliquer sur "SQL Editor" dans le menu gauche

2. **Appliquer la migration**
   - Copier **tout** le contenu du fichier :  
     `supabase/migrations/20260121000000_add_saas_multitenant.sql`
   
   - Coller dans l'éditeur SQL
   
   - Cliquer sur "Run" (en bas à droite)

3. **Vérifier que ça a fonctionné**
   - Aller dans "Table Editor"
   - Vous devriez voir les nouvelles tables :
     - `clients`
     - `client_admins`
     - `deployment_logs`
     - `ai_modifications`

### Via Supabase CLI (Alternative)

```bash
# Si vous avez installé la CLI Supabase
cd /Users/gabinfulcrand/Desktop/PFE/book-wise-76
supabase db push
```

---

## ✅ Étape 2 : Vérifier la Configuration

### Vérifier que les tables existent

Dans le SQL Editor, exécuter :

```sql
-- Lister toutes les tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('clients', 'client_admins', 'deployment_logs', 'ai_modifications', 'profiles');
```

Résultat attendu : 5 lignes

### Vérifier que le Storage Bucket existe

```sql
-- Vérifier le bucket client-configs
SELECT * FROM storage.buckets WHERE id = 'client-configs';
```

Si le bucket n'existe pas, créez-le manuellement :

1. Aller dans "Storage" dans le menu gauche
2. Cliquer sur "Create a new bucket"
3. Nom : `client-configs`
4. Public : **NON** (décocher)
5. File size limit : `1 MB`
6. Allowed MIME types : `application/json`

---

## 🔑 Étape 3 : Tester l'Authentification

### Créer un compte test

1. Ouvrir http://localhost:4173 dans votre navigateur
2. Aller sur `/auth`
3. Créer un compte avec :
   - Email : test@bookwise.dev
   - Mot de passe : TestPassword123!
   - Nom : Test User

### Vérifier que le profil a été créé

Dans le SQL Editor :

```sql
-- Voir tous les utilisateurs
SELECT 
  u.id,
  u.email,
  p.full_name,
  p.role,
  p.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;
```

Vous devriez voir votre utilisateur test avec un profil.

---

## 📊 Étape 4 : Tester la Création de Projet

### Via l'interface

1. Se connecter avec le compte test
2. Vous êtes redirigé vers `/dashboard`
3. Cliquer sur "Nouveau Projet"
4. Remplir le questionnaire
5. Sauvegarder le projet

### Vérifier dans Supabase

```sql
-- Voir tous les projets
SELECT 
  id,
  user_id,
  site_name,
  slug,
  status,
  created_at
FROM public.clients
ORDER BY created_at DESC;
```

Vous devriez voir votre projet avec `status = 'pending'`.

---

## 🔧 Résolution de Problèmes

### Erreur : "relation 'clients' does not exist"

**Cause** : La migration n'a pas été appliquée

**Solution** : Retourner à l'Étape 1 et réappliquer la migration

### Erreur : "new row violates row-level security policy"

**Cause** : Les policies RLS bloquent l'insertion

**Solution** : Vérifier que vous êtes bien authentifié et que l'user_id correspond

```sql
-- Désactiver temporairement RLS pour debug (⚠️ en dev uniquement)
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;

-- Tester l'insertion
INSERT INTO public.clients (user_id, site_name, slug)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'Test Site',
  'test-site'
);

-- Réactiver RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
```

### Erreur : "storage bucket 'client-configs' does not exist"

**Cause** : Le bucket n'a pas été créé

**Solution** : Créer le bucket manuellement (voir Étape 2)

---

## 📝 Commandes SQL Utiles

### Voir tous les projets d'un utilisateur

```sql
SELECT * FROM public.clients 
WHERE user_id = 'USER_ID_HERE'
ORDER BY created_at DESC;
```

### Supprimer tous les projets de test

```sql
-- ⚠️ ATTENTION : supprime TOUS les projets
DELETE FROM public.clients;
```

### Voir les logs de déploiement

```sql
SELECT 
  dl.level,
  dl.message,
  dl.created_at,
  c.site_name
FROM public.deployment_logs dl
JOIN public.clients c ON c.id = dl.client_id
ORDER BY dl.created_at DESC
LIMIT 20;
```

### Voir l'historique des modifications IA

```sql
SELECT 
  am.user_prompt,
  am.success,
  am.iterations,
  am.model_used,
  am.created_at,
  c.site_name
FROM public.ai_modifications am
JOIN public.clients c ON c.id = am.client_id
ORDER BY am.created_at DESC
LIMIT 10;
```

---

## ✅ Checklist Finale

Avant la démo, vérifier que :

- [ ] Les 5 tables existent (`clients`, `client_admins`, `deployment_logs`, `ai_modifications`, `profiles`)
- [ ] Le bucket `client-configs` existe dans Storage
- [ ] L'authentification fonctionne (création compte + login)
- [ ] Un profil est créé automatiquement lors de l'inscription
- [ ] Les projets se sauvegardent dans la table `clients`
- [ ] Le dashboard affiche bien les projets de l'utilisateur
- [ ] Les RLS policies fonctionnent (un user ne voit que ses projets)

---

## 🚀 Prochaines Étapes

Une fois Supabase configuré :

1. Tester le flow complet (Auth → Dashboard → Créer projet → Sauvegarder)
2. Vérifier la persistance (fermer/rouvrir l'app, le projet est toujours là)
3. Tester avec 2 comptes différents (isolation des données)
4. Préparer la démo avec des projets pré-remplis

---

**Besoin d'aide ?** Vérifier les logs dans la console du navigateur et dans Supabase Dashboard > Logs.
