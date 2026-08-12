# 🧪 Plan de Tests Complet - BookWise

## 📋 Checklist de Tests

### 🔐 **1. AUTHENTIFICATION**

#### Test 1.1 : Inscription
- [ ] Créer un compte client avec email valide
- [ ] Essayer email déjà utilisé (doit refuser)
- [ ] Essayer mot de passe < 6 caractères (doit refuser)
- [ ] Vérifier que le profil est créé avec role="client"

#### Test 1.2 : Connexion
- [ ] Se connecter avec compte client
- [ ] Se connecter avec compte admin
- [ ] Essayer mauvais mot de passe (doit refuser)
- [ ] Vérifier redirection : client → `/bookings`, admin → `/admin`

#### Test 1.3 : Déconnexion
- [ ] Se déconnecter en tant que client
- [ ] Se déconnecter en tant qu'admin
- [ ] Vérifier redirection vers page de connexion

---

### 👨‍💼 **2. INTERFACE ADMIN - CRÉATION DE SLOTS**

#### Test 2.1 : Créer un slot simple
- [ ] Créer un slot 9h-12h (doit réussir)
- [ ] Vérifier que le slot apparaît dans le calendrier
- [ ] Vérifier la couleur bleue du slot

#### Test 2.2 : Créer plusieurs slots le même jour
- [ ] Créer slot 9h-12h
- [ ] Créer slot 14h-18h (doit réussir, pas de chevauchement)
- [ ] Vérifier que les 2 slots s'affichent

#### Test 2.3 : **CRITIQUE** - Empêcher les chevauchements
- [ ] Créer slot 9h-12h
- [ ] Essayer de créer 11h-13h (doit REFUSER avec message d'erreur)
- [ ] Essayer de créer 8h-10h (doit REFUSER)
- [ ] Essayer de créer 10h-11h (doit REFUSER)
- [ ] Essayer de créer 8h-14h (doit REFUSER, englobe le premier)

#### Test 2.4 : Slots consécutifs (edge case)
- [ ] Créer slot 9h-12h
- [ ] Créer slot 12h-14h (doit RÉUSSIR, pas de chevauchement car `[)`)
- [ ] Créer slot 14h-18h (doit RÉUSSIR)
- [ ] Vérifier les 3 slots s'affichent correctement

#### Test 2.5 : Validation des heures
- [ ] Essayer heure de fin = heure de début (doit refuser)
- [ ] Essayer heure de fin < heure de début (doit refuser)

#### Test 2.6 : Jours fermés
- [ ] Vérifier que samedi/dimanche affichent "Fermé" (selon config)
- [ ] Impossible de créer un slot sur un jour fermé

---

### 📅 **3. INTERFACE ADMIN - GESTION DES SLOTS**

#### Test 3.1 : Voir les détails d'un slot
- [ ] Cliquer sur un slot vide → voir "Disponible - Aucune réservation"
- [ ] Bouton "Supprimer la plage" disponible

#### Test 3.2 : Supprimer un slot vide
- [ ] Créer un slot
- [ ] Le supprimer immédiatement (doit réussir)
- [ ] Vérifier qu'il disparaît du calendrier

#### Test 3.3 : **CRITIQUE** - Empêcher suppression slot avec réservations
- [ ] Créer un slot
- [ ] Faire une réservation client dessus
- [ ] Essayer de supprimer le slot (bouton doit être désactivé)
- [ ] Message "Impossible de supprimer (contient des réservations)"

#### Test 3.4 : Archivage automatique
- [ ] Attendre qu'un slot passe (ou modifier manuellement la date)
- [ ] Vérifier que le slot devient gris (archived)
- [ ] Vérifier qu'on peut créer un nouveau slot au même horaire (car archived n'est pas bloqué)

---

### 👤 **4. INTERFACE CLIENT - RÉSERVATION**

#### Test 4.1 : Sélection de service
- [ ] Vérifier que tous les services configurés s'affichent
- [ ] Vérifier durée et prix affichés correctement
- [ ] Cliquer sur un service → voir le calendrier

#### Test 4.2 : Affichage des créneaux disponibles
- [ ] Créer slot admin 9h-18h
- [ ] Vérifier que les créneaux de 10 minutes s'affichent
- [ ] Vérifier regroupement : Matin / Après-midi / Soir

#### Test 4.3 : Créer une réservation
- [ ] Sélectionner un service (ex: Coupe, 20min)
- [ ] Choisir un créneau (ex: 10h00)
- [ ] Vérifier message de succès
- [ ] Vérifier que la réservation apparaît dans "Mes réservations"

#### Test 4.4 : **CRITIQUE** - Empêcher réservations multiples
- [ ] Faire une réservation
- [ ] Essayer d'en faire une 2ème (doit REFUSER)
- [ ] Message "Vous avez déjà un rendez-vous à venir"

#### Test 4.5 : **CRITIQUE** - Empêcher chevauchement de réservations
- [ ] Client A réserve 10h00 (service 20min → 10h00-10h20)
- [ ] Client B essaie de réserver 10h10 (doit REFUSER, chevauche)
- [ ] Client B essaie de réserver 10h00 (doit REFUSER, même créneau)
- [ ] Client B réserve 10h20 (doit RÉUSSIR, juste après)

#### Test 4.6 : Affichage des créneaux occupés
- [ ] Faire une réservation 10h00-10h20
- [ ] Recharger le calendrier
- [ ] Vérifier que 10h00 et 10h10 n'apparaissent plus dans les créneaux disponibles
- [ ] Vérifier que 10h20 est toujours disponible

#### Test 4.7 : Services de durées différentes
- [ ] Service A (20min) : réserver 10h00 → occupe 10h00-10h20
- [ ] Service B (30min) : vérifier que 10h00, 10h10, 10h20 sont indisponibles
- [ ] Service B (30min) : peut réserver à 10h30

---

### 🗑️ **5. ANNULATION DE RÉSERVATIONS**

#### Test 5.1 : Client annule sa réservation
- [ ] Créer une réservation
- [ ] Cliquer sur "Annuler" depuis "Mes réservations"
- [ ] Confirmer l'annulation
- [ ] Vérifier que la réservation disparaît
- [ ] Vérifier que le créneau redevient disponible

#### Test 5.2 : Admin annule une réservation
- [ ] Client fait une réservation
- [ ] Admin va dans "Toutes les réservations"
- [ ] Clique sur la réservation → "Annuler la réservation"
- [ ] Vérifier que la réservation disparaît côté client

#### Test 5.3 : **CRITIQUE** - Réservations complétées
- [ ] Créer une réservation dans le passé (ou attendre)
- [ ] Vérifier qu'elle passe en statut "Terminé"
- [ ] Vérifier qu'elle n'est plus dans "à venir"
- [ ] Vérifier qu'elle apparaît dans l'historique

---
m
### 📊 **6. STATISTIQUES ADMIN**

#### Test 6.1 : Compteurs
- [ ] Créer 3 slots → vérifier "Total des plages" = 3
- [ ] Faire 2 réservations → vérifier "Réservations actives" = 2
- [ ] Vérifier "Plages disponibles" se met à jour

#### Test 6.2 : Liste "Toutes les réservations"
- [ ] Vérifier affichage du nom du client
- [ ] Vérifier affichage du service
- [ ] Vérifier badge "À venir" / "Terminé"
- [ ] Vérifier dates en français

---

### 🌍 **7. INTERNATIONALISATION (i18n)**

#### Test 7.1 : Textes en français
- [ ] Vérifier tous les boutons en français
- [ ] Vérifier tous les messages d'erreur en français
- [ ] Vérifier tous les labels de formulaire en français

#### Test 7.2 : Formats de date français
- [ ] Vérifier format "lundi 10 novembre 2025" (pas "Monday, November 10")
- [ ] Vérifier heures "14:30" (pas "2:30 PM")
- [ ] Vérifier jours de semaine abrégés : "lun, mar, mer..."

---

### 🔒 **8. SÉCURITÉ & PERMISSIONS (RLS)**

#### Test 8.1 : Client ne peut pas accéder à l'admin
- [ ] Se connecter en tant que client
- [ ] Essayer d'aller sur `/admin` (doit rediriger)

#### Test 8.2 : Client voit seulement ses réservations
- [ ] Client A fait une réservation
- [ ] Client B se connecte
- [ ] Client B ne doit PAS voir la réservation de Client A dans "Mes réservations"

#### Test 8.3 : Client ne peut pas modifier les slots
- [ ] Se connecter en tant que client
- [ ] Ouvrir la console dev → essayer de créer un slot via API (doit refuser)

#### Test 8.4 : Client ne peut pas voir les infos d'autres clients
- [ ] Client ne doit pas pouvoir lister tous les profiles via Supabase

---

### ⚡ **9. EDGE CASES & BUGS POTENTIELS**

#### Test 9.1 : Slot sur plusieurs jours (ne devrait pas être possible)
- [ ] Essayer de créer un slot 23h (jour 1) - 1h (jour 2)
- [ ] Vérifier le comportement

#### Test 9.2 : Granularité des créneaux
- [ ] Vérifier que les créneaux sont espacés de 10 minutes (config)
- [ ] Service de 25min → vérifier qu'il occupe 3 créneaux (10+10+10)

#### Test 9.3 : Changement de semaine
- [ ] Naviguer entre les semaines avec les flèches
- [ ] Cliquer sur "Aujourd'hui" → revenir à la semaine courante
- [ ] Vérifier que les slots s'affichent correctement sur toutes les semaines

#### Test 9.4 : Réservation dans le passé
- [ ] Essayer de réserver un créneau passé (doit être impossible)
- [ ] Les jours passés doivent être grisés

#### Test 9.5 : Fuseau horaire
- [ ] Créer un slot à 10h
- [ ] Vérifier qu'il s'affiche bien à 10h (pas décalage UTC)
- [ ] Faire une réservation → vérifier l'heure affichée

#### Test 9.6 : Rechargement de page
- [ ] Créer un slot
- [ ] Recharger la page → vérifier qu'il est toujours là
- [ ] Faire une réservation
- [ ] Recharger → vérifier qu'elle est toujours là

#### Test 9.7 : Connexion simultanée
- [ ] Client A et Client B ouvrent le calendrier en même temps
- [ ] Client A réserve 10h00
- [ ] Client B rafraîchit → 10h00 doit disparaître
- [ ] Client B essaie de réserver 10h00 (doit échouer si encore visible)

---

### 🎨 **10. UI/UX**

#### Test 10.1 : Responsive
- [ ] Tester sur mobile (réduire la fenêtre)
- [ ] Vérifier que le calendrier s'adapte
- [ ] Vérifier que les boutons sont cliquables

#### Test 10.2 : Messages de feedback
- [ ] Chaque action doit avoir un toast de succès ou d'erreur
- [ ] Les spinners de chargement s'affichent

#### Test 10.3 : États de chargement
- [ ] Désactiver les boutons pendant le chargement
- [ ] Afficher un spinner sur la page au chargement initial

---

## 🚨 **TESTS CRITIQUES (À PRIORISER)**

### Top 5 des failles potentielles à vérifier en priorité :

1. **Chevauchement de slots** (Test 2.3)
2. **Chevauchement de réservations** (Test 4.5)
3. **Réservations multiples d'un même client** (Test 4.4)
4. **Suppression de slot avec réservations** (Test 3.3)
5. **Sécurité RLS - Client accède à l'admin** (Test 8.1)

---

## 📝 **Comment utiliser cette checklist**

1. Commence par les **tests critiques** (🚨)
2. Coche chaque case ✅ ou note ❌ si ça échoue
3. Pour chaque ❌, note le comportement observé
4. Envoie-moi les résultats et je corrigerai les bugs

Bon courage pour les tests ! 🚀
