# Notes de déploiement — Branche `promptly`

> Ce document récapitule tous les changements apportés dans cette branche et ce que **tu dois faire** pour que tout soit en production.

---

## 1. Supabase — Migrations (déjà appliquées)

Les migrations suivantes ont déjà été poussées et appliquées sur le projet Supabase commun.
**Tu n'as rien à faire côté Supabase**, c'est déjà en prod.

| Fichier | Ce qu'il fait |
|---|---|
| `20260321000000_fix_client_admins_rls.sql` | Permet aux utilisateurs de lire leurs propres entrées `client_admins` (nécessaire pour la vérification admin côté template) |
| `20260321000001_fix_bookings_admin_rls.sql` | Remplace la policy trop permissive `"Admins can view all bookings"` par une policy scopée au `client_id` du site |
| `20260321000002_drop_legacy_admin_delete_bookings.sql` | Supprime l'ancienne policy `"Admins can delete bookings"` (doublon legacy) |
| `20260321000003_cleanup_duplicate_bookings_policies.sql` | Supprime 7 policies dupliquées sur la table `bookings` |
| `20260321000004_fix_rls_recursion_client_admins.sql` | Crée deux fonctions `SECURITY DEFINER` (`is_client_admin_of`, `is_owner_of_client`) pour éviter la récursion infinie RLS sur `client_admins` |

---

## 2. Promptly (app principale) — Déjà commitée

| Fichier | Ce qu'il fait |
|---|---|
| `src/services/ai/systemPrompt.ts` | Ajoute des règles strictes dans le prompt système pour forcer le bon format `openingHours` (`"9:00-18:00"`, tous les 7 jours en anglais, `"Closed"` avec majuscule) — évite les crashes sur les sites déployés |

---

## 3. Template (sites déployés) — **Action requise de ta part**

Ce sont les fichiers du dossier `template/` qui sont copiés et déployés sur Vercel pour chaque site client. **Pour que les sites existants et futurs utilisent le nouveau code, tu dois redéployer l'orchestrateur sur Railway.**

### Fichiers modifiés

| Fichier | Ce qu'il fait |
|---|---|
| `template/src/pages/AdminDashboard.tsx` | **Réécriture complète** — suppression de tout le système de slots, dashboard basé sur les réservations directes filtrées par `VITE_CLIENT_ID`, 3 cartes de stats (aujourd'hui / à venir / terminées), planning hebdomadaire v2 |
| `template/src/components/WeeklyCalendarVertical.tsx` | **Réécriture complète** — plus de props `slots`, `onSlotClick`, `onCreateSlot`, `isAdmin`. Grille calculée automatiquement depuis `config.openingHours`. Chaque réservation est positionnée proportionnellement à son `start_time`/`end_time` |
| `template/src/components/ProtectedRoute.tsx` | **Correction sécurité critique** — la page `/admin` vérifie maintenant que l'utilisateur est bien admin de CE site spécifique (`client_id = VITE_CLIENT_ID`) via la table `client_admins`, et non plus `profile.role === 'admin'` qui permettait à n'importe quel admin Promptly d'accéder à n'importe quel site déployé |
| `template/src/integrations/supabase/types.ts` | Ajout de la table `client_admins` dans les types TypeScript générés (nécessaire pour la requête dans `ProtectedRoute`) |

### Ce que tu dois faire

```bash
# 1. Récupérer la branche sur ta machine (ou sur Railway directement)
git pull origin promptly   # ou la branche concernée

# 2. Redéployer le service orchestrateur sur Railway
#    → Railway va relire le dossier template/ avec les nouveaux fichiers
#    → Les prochains sites créés utiliseront automatiquement le nouveau code
```

> **Important** : les sites déjà déployés sur Vercel ne seront PAS mis à jour automatiquement.
> Pour mettre à jour un site existant, il faudra le redéployer manuellement depuis Promptly
> (ou déclencher un nouveau build Vercel sur ce projet).

---

## 4. Ce qui n'a PAS changé

- La structure de la base de données (aucune colonne ajoutée/supprimée)
- Les variables d'environnement Railway et Vercel (`VITE_CLIENT_ID` est toujours injecté de la même façon)
- Le flux de création de site (`createProject` → trigger `handle_new_client` → `client_admins`)
- La page de réservation client (`/bookings`) — inchangée
- La page d'authentification (`/auth`) — inchangée
