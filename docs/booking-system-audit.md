# Audit Système de Réservation - Book-Wise

---

## NOUVELLE LOGIQUE SIMPLIFIÉE (v2)

### Changement majeur

**Avant :** Admin crée manuellement des "slots" (plages horaires)
**Après :** Créneaux auto-générés depuis `openingHours`

### Nouvelles règles

| Règle | Valeur |
|-------|--------|
| Source des créneaux | `openingHours` dans config |
| Fenêtre de réservation | 2 mois glissants |
| Renouvellement | Chaque jour, +1 jour s'ouvre |
| Gestion exceptions | Pas pour l'instant (V2) |

### Nouveau flow

```
openingHours définit les horaires (ex: lundi 9h-17h)
        ↓
Système génère créneaux pour les 60 prochains jours
        ↓
Client choisit service + date/heure
        ↓
Système vérifie pas de conflit avec bookings existants
        ↓
Réservation créée dans `bookings`
```

### Ce qui disparaît

- Table `slots` (plus nécessaire)
- CreateSlotDialog (plus de création manuelle)
- SlotManagementDialog (plus de gestion slots)
- useAdminSlots hook (plus de CRUD slots)

### Ce qui reste

- `bookings` table
- ServiceSelector
- AvailableTimePicker (modifié pour lire openingHours)
- BookingList
- Admin voit les réservations
- useBookings, useAdminBookings

### Fichiers modifiés (v2 implémentée)

| Fichier | Status | Changement |
|---------|--------|------------|
| `availabilityHelpers.ts` | Fait | Génère depuis openingHours |
| `useSlots.ts` | Fait | Fetch uniquement bookings |
| `useBookings.ts` | Fait | Simplifié (plus de slot_id) |
| `ClientBookings.tsx` | Fait | Nouveau flow sans slots |
| `AvailableTimePicker.tsx` | Fait | Reçoit openingHours |
| `types/booking.ts` | Fait | slot_id optionnel |
| `supabase/types.ts` | Fait | Colonnes ajoutées |
| `AdminDashboard.tsx` | ⏳ À adapter | Retirer création slots |

### Migration DB requise

Fichier : `docs/migration-v2-booking.sql`

```sql
-- Ajouter colonnes manquantes
ALTER TABLE bookings ADD COLUMN service_id TEXT;
ALTER TABLE bookings ADD COLUMN duration INTEGER;
ALTER TABLE bookings ADD COLUMN start_time TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN end_time TIMESTAMPTZ;

-- Rendre slot_id optionnel
ALTER TABLE bookings ALTER COLUMN slot_id DROP NOT NULL;
```

---

## ANCIENNE LOGIQUE (v1 - référence)

---

## 1. Vue d'ensemble

### Pages principales

| Route | Page | Rôle |
|-------|------|------|
| `/bookings` | ClientBookings.tsx | Interface client pour réserver |
| `/admin` | AdminDashboard.tsx | Gestion des créneaux/réservations |

### Flow de réservation

```
Client arrive sur /bookings
        ↓
1. Choisit un service (ServiceSelector)
        ↓
2. Choisit une date/heure (AvailableTimePicker)
        ↓
3. Confirme la réservation
        ↓
4. Voit sa réservation dans BookingList
```

---

## 2. Composants

### Côté Client

| Composant | Fichier | Rôle |
|-----------|---------|------|
| ServiceSelector | `src/components/bookings/ServiceSelector.tsx` | Affiche les services, permet la sélection |
| AvailableTimePicker | `src/components/AvailableTimePicker.tsx` | Navigation semaine, sélection jour/heure |
| BookingList | `src/components/bookings/BookingList.tsx` | Liste des réservations du client |
| BookingListItem | `src/components/bookings/BookingListItem.tsx` | Carte individuelle de réservation |
| FutureBookingBlocker | `src/components/bookings/FutureBookingBlocker.tsx` | Bloque si déjà une résa future |

### Côté Admin

| Composant | Fichier | Rôle |
|-----------|---------|------|
| WeeklyCalendarVertical | `src/components/WeeklyCalendarVertical.tsx` | Calendrier semaine vertical |
| CreateSlotDialog | `src/components/admin/CreateSlotDialog.tsx` | Dialog création de créneau |
| SlotManagementDialog | `src/components/admin/SlotManagementDialog.tsx` | Gestion créneau + annulation |
| AdminBookingList | `src/components/admin/AdminBookingList.tsx` | Liste admin des réservations |
| AdminStatsCards | `src/components/admin/AdminStatsCards.tsx` | Stats (créneaux actifs, réservations) |
| BookingDetailsDialog | `src/components/admin/BookingDetailsDialog.tsx` | Détails d'une réservation |

---

## 3. Logique des créneaux

### Algorithme de disponibilité

Fichier : `src/utils/availabilityHelpers.ts`

```
1. Admin crée un "slot" (ex: 9h-17h)
        ↓
2. generateTimeSlots() découpe selon granularité (ex: 10 min)
   → [9:00, 9:10, 9:20, 9:30, ...]
        ↓
3. isTimeSlotAvailable() vérifie chaque créneau
   → Pas de conflit avec réservations existantes
   → Pas dans le passé
        ↓
4. getAvailableTimeSlotsForService() retourne les créneaux libres
```

### Fonctions clés

| Fonction | Rôle |
|----------|------|
| `generateTimeSlots()` | Génère créneaux selon granularité |
| `isTimeSlotAvailable()` | Vérifie disponibilité d'un créneau |
| `getAvailableTimeSlotsForService()` | Retourne tous les créneaux dispo pour un service |

### Détection de conflit

```typescript
// Un créneau est en conflit si :
!(newEnd <= bookingStart || newStart >= bookingEnd)

// Traduction : conflit si les plages se chevauchent
```

---

## 4. Règles métier

### Configuration (useConfig.ts + config.json)

```typescript
bookingSettings: {
  slotDuration: number              // Durée des slots admin
  timeSlotGranularity: number       // Intervalle picker (ex: 10 min)
  maxAdvanceBookingDays: number     // Jours max à l'avance
  minAdvanceBookingHours: number    // Heures min avant résa
  allowCancellation: boolean        // Annulation autorisée ?
  cancellationDeadlineHours: number // Délai annulation
  maxBookingsPerUser: number        // Résas simultanées max
  requireNotes: boolean             // Notes obligatoires ?
  autoConfirm: boolean              // Auto-confirmation ?
}
```

### Horaires d'ouverture

```typescript
openingHours: {
  monday: "09:00-17:00",
  tuesday: "09:00-17:00",
  // ...
  sunday: "Closed"
}
```

### Règles appliquées

| Règle | Où | Description |
|-------|-----|-------------|
| 1 résa future max | ClientBookings.tsx | Bloque si déjà une résa confirmée future |
| Durée = service | Booking creation | end_time = start_time + service.duration |
| Pas de chevauchement slots | AdminDashboard.tsx | Vérifie overlap avant création |
| Pas de créneaux passés | AvailableTimePicker | Filtre start <= now |
| Auto-archive passés | useAdminSlots.ts | Slots passés → status 'archived' |
| Auto-complete passés | useBookings.ts | Bookings passés → status 'completed' |

---

## 5. Base de données (Supabase)

### Tables

**slots** (Créneaux créés par admin)

```sql
- id (UUID)
- start_time (timestamp)
- end_time (timestamp)
- is_available (boolean)
- status ('active' | 'archived')
- created_by (user_id)
- created_at, updated_at
```

**bookings** (Réservations clients)

```sql
- id (UUID)
- slot_id (references slots)
- user_id (references profiles)
- service_id (from config)
- duration (minutes)
- start_time (timestamp)
- end_time (timestamp)
- status ('confirmed' | 'completed' | 'cancelled')
- notes (optional)
- created_at, updated_at
```

**profiles** (Utilisateurs)

```sql
- id (UUID)
- email
- full_name
- role ('client' | 'admin')
```

---

## 6. Hooks

| Hook | Fichier | Rôle |
|------|---------|------|
| useSlots | `src/hooks/useSlots.ts` | Fetch slots actifs + bookings pour client |
| useBookings | `src/hooks/useBookings.ts` | Gestion réservations client |
| useAdminSlots | `src/hooks/useAdminSlots.ts` | CRUD slots admin |
| useAdminBookings | `src/hooks/useAdminBookings.ts` | Vue admin des réservations |
| useConfig | `src/hooks/useConfig.ts` | Config + theming |
| useAuth | `src/hooks/useAuth.ts` | Auth + profil utilisateur |

---

## 7. Helpers

| Fichier | Fonctions |
|---------|-----------|
| `src/utils/availabilityHelpers.ts` | generateTimeSlots, isTimeSlotAvailable, getAvailableTimeSlotsForService |
| `src/utils/dateHelpers.ts` | parseLocalDateTime, formatLocalDateTime |

---

## 8. Flow complet Client

```
1. /bookings → ClientBookings.tsx
2. useSlots() fetch les slots actifs
3. useBookings() fetch les résas du user
4. Si résa future existe → FutureBookingBlocker affiché
5. Sinon → ServiceSelector affiché
6. User clique service → AvailableTimePicker affiché
7. Navigation semaine (prev/next)
8. Clique jour → créneaux groupés (matin/après-midi/soir)
9. Clique créneau → bookSlotWithService()
   - Vérifie pas de résa future
   - Calcule end_time
   - INSERT booking
   - Refetch data
10. BookingList affiche la nouvelle résa
11. Bouton annuler si allowCancellation = true
```

---

## 9. Flow complet Admin

```
1. /admin → AdminDashboard.tsx
2. useAdminSlots() fetch tous les slots
3. useAdminBookings() fetch toutes les résas
4. WeeklyCalendarVertical affiche le calendrier
5. Clic zone vide → CreateSlotDialog
   - Choix heure début/fin
   - Validation: end > start, pas overlap
   - Création slot
6. Slots affichés en bleu clair
7. Résas affichées avec couleur service
8. Clic sur résa → BookingDetailsDialog
9. Clic sur slot → SlotManagementDialog
   - Liste résas dans le slot
   - Bouton supprimer (si pas de résas)
   - Bouton annuler par résa
```

---

## 10. Points d'attention pour refactoring

### Ce qui fonctionne bien

- Séparation claire client/admin
- Hooks réutilisables
- TypeScript bien typé
- Gestion dates cohérente
- Sécurité (1 résa future max)

### À améliorer potentiellement

1. Calcul disponibilité pourrait être côté backend
2. Logique duplicate booking répétée (ClientBookings + hook)
3. Validation overlap dupliquée (AdminDashboard + useAdminSlots)
4. Services en config statique vs DB

---

## 11. Fichiers clés

```
src/
├── pages/
│   ├── ClientBookings.tsx          ← Interface client
│   └── AdminDashboard.tsx          ← Interface admin
│
├── components/
│   ├── AvailableTimePicker.tsx     ← Picker date/heure
│   ├── WeeklyCalendarVertical.tsx  ← Calendrier admin
│   ├── bookings/
│   │   ├── ServiceSelector.tsx
│   │   ├── BookingList.tsx
│   │   ├── BookingListItem.tsx
│   │   └── FutureBookingBlocker.tsx
│   └── admin/
│       ├── CreateSlotDialog.tsx
│       ├── SlotManagementDialog.tsx
│       └── ...
│
├── hooks/
│   ├── useSlots.ts
│   ├── useBookings.ts
│   ├── useAdminSlots.ts
│   └── useAdminBookings.ts
│
└── utils/
    ├── availabilityHelpers.ts      ← Logique dispo
    └── dateHelpers.ts              ← Helpers dates
```
