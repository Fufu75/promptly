# Architecture Brainstorm - Book-Wise

## 1. Vision globale

### Objectif
Permettre à un client de créer son site de réservation personnalisé via un agent IA, sans coder.

### Flow utilisateur
```
Client remplit questionnaire
        ↓
Agent IA configure toutes les pages (page par page)
        ↓
Client navigue, preview, demande des modifs en langage naturel
        ↓
Site déployé dans un container Docker
```

---

## 2. Architecture technique

### Déploiement
- **1 client = 1 container Docker**
- **1 seule image** de base (template)
- **Config JSON injectée** par client
- **Docker Compose** pour orchestrer
- **VPS** pour héberger

### Stockage config
- Configs stockées dans **Supabase** (bucket + table)
- Chaque container reçoit sa config au démarrage

---

## 3. Système de blocks (implémenté)

### Structure
```
src/components/blocks/
├── homepage/
│   ├── Header/     (3 variants)
│   ├── Hero/       (3 variants)
│   ├── Features/   (3 variants)
│   ├── Services/   (3 variants)
│   ├── OpeningHours/ (3 variants)
│   ├── Contact/    (3 variants)
│   ├── FooterCTA/  (3 variants)
│   └── Footer/     (3 variants)
├── auth/           (3 variants)
│   ├── CenteredCard   (carte centrée, fond gradient)
│   ├── SplitImage     (formulaire gauche, image droite)
│   └── Minimal        (épuré, fond uni)
├── booking/        (à faire)
└── ...
```

### Naming convention
- Noms de variants = **descriptif du layout** (pas du style)
- Exemples : `centered-icon`, `split-image`, `cards-grid`
- Évite de biaiser l'agent IA ("modern" → tout le monde choisit modern)

### Fichiers clés

| Fichier | Rôle |
|---------|------|
| `config/pages/homepage-config.json` | Config active homepage |
| `config/pages/auth-config.json` | Config active auth |
| `config/libraries/homepage.json` | Annuaire homepage pour l'agent |
| `config/libraries/auth.json` | Annuaire auth pour l'agent |

---

## 4. L'agent IA

### Rôle
- Lit le **questionnaire** (infos client : nom, secteur, mood voulu, etc.)
- Lit l'**annuaire** (homepage.json) pour comprendre les composants disponibles
- Génère la **config** (homepage-config.json) avec les bons variants/props
- Peut **modifier** la config si le client demande des changements

### Ce que l'agent peut toucher
- Fichiers JSON de config (variants, textes, couleurs)
- **PAS** la logique métier (réservations, auth, etc.)

### Contexte nécessaire
Quand le client parle à l'agent, celui-ci doit savoir :
- Sur quelle page le client se trouve
- Quelle config est active
- Quels variants sont disponibles (via l'annuaire)

---

## 5. Pages à customiser

| Page | Customisable | Status | Variants/Blocks |
|------|--------------|--------|-----------------|
| Homepage | Oui | Fait | 8 blocks × 3 variants |
| Auth | Oui | Fait | 3 variants (centered-card, split-image, minimal) |
| Page réservation | Oui | ⏳ À faire | ServiceSelector, TimeSlotPicker, BookingForm, Confirmation |
| Mes réservations | Oui | ⏳ À faire | À définir |
| Admin dashboard | Non | - | Interne, pas de personnalisation |

---

## 6. Questions ouvertes

- [ ] Comment l'agent accède aux fichiers config ? (API custom ?)
- [ ] Comment le client preview les changements avant déploiement ?
- [ ] Versioning des configs ? (pouvoir annuler un changement)
- [ ] DNS / sous-domaines pour chaque client ?

---

## 7. Prochaines étapes

1. [ ] Créer les blocks pour la page réservation client
2. [ ] Créer l'annuaire `booking.json`
3. [ ] Tester le flow agent → config → rendu
4. [ ] Setup Docker Compose basique
