# Services IA — Promptly Generator

## Vue d'ensemble

Ce dossier contient toute la logique d'interaction avec OpenAI.
L'IA a un seul rôle : traduire les intentions de l'utilisateur en JSON de composants React, qui sont ensuite rendus en live dans la preview.

---

## Architecture

```
src/services/ai/
└── openaiService.ts   ← service principal (le seul fichier pour l'instant)
```

---

## Flux complet

```
Questionnaire utilisateur
        ↓
generateInitialConfigs(description)
        ↓
OpenAI lit les 3 bibliothèques de composants + génère les 4 configs
        ↓
SiteCreator met à jour les 4 états React
        ↓
PreviewModal re-render instantané (homepage / auth / booking)
```

```
Message chat utilisateur ("quelque chose de plus élégant")
        ↓
updateConfigsFromChat(message, configsActuelles)
        ↓
OpenAI comprend l'intention → choisit les bons variants selon leur "mood"
        ↓
Retourne uniquement les parties modifiées (patch partiel)
        ↓
SiteCreator applique le patch → preview live
```

---

## Fonctions exposées

### `generateInitialConfigs(businessDescription)`

Appelée une seule fois après le questionnaire.
Prend une description textuelle du business et retourne les 4 configs complètes.

**Input :** string (résumé des réponses au questionnaire)

**Output :** `AIGeneratedConfigs`
```ts
{
  globalConfig: { brandName, businessSector, accentColor, services[], openingHours, contact }
  homepageBlocks: PageBlock[]   // 8 blocs : Header, Hero, Features, Services, OpeningHours, Contact, FooterCTA, Footer
  authBlock: { variant, props } // 1 bloc Auth
  bookingBlocks: PageBlock[]    // 3 blocs : ServiceSelector, TimePicker, BookingList
}
```

---

### `updateConfigsFromChat(userMessage, currentConfigs)`

Appelée à chaque message du chat.
L'utilisateur parle en langage naturel, l'IA modifie uniquement ce qui est pertinent.

**Input :**
- `userMessage` : ce que l'utilisateur a tapé ("ambiance plus zen", "ajoute un service massage")
- `currentConfigs` : l'état actuel des 4 configs (contexte injecté dans le prompt)

**Output :** `Partial<AIGeneratedConfigs>` + `_message`
```ts
{
  _message: "J'ai sélectionné des composants plus épurés..."  // réponse affichée dans le chat
  homepageBlocks?: PageBlock[]   // seulement si modifié
  authBlock?: { variant, props } // seulement si modifié
  bookingBlocks?: PageBlock[]    // seulement si modifié
  globalConfig?: GlobalConfig    // seulement si modifié
}
```

---

## System prompt

Le system prompt est composé de deux parties :

**Partie statique** (ne change jamais)
- Les 3 bibliothèques de composants JSON (`homepage.json`, `auth.json`, `booking.json`)
- Les règles de sortie (format JSON strict, pas de runtimeProps dans booking, accentColor cohérente)
- Le mapping intention → variant via le champ `mood` de chaque composant

**Partie dynamique** (injectée à chaque appel `updateConfigsFromChat`)
- L'état actuel des 4 configs (pour que l'IA sache ce qui est déjà en place)

---

## Bibliothèques de composants

L'IA choisit les variants en lisant le champ `mood` de chaque composant.

| Mood | Variants typiques |
|------|------------------|
| élégant, raffiné, premium | `centered-bordered`, `split-brand` |
| dynamique, moderne, engageant | `centered-icon`, `cards-hover` |
| épuré, zen, minimaliste | `left-accent`, `minimal` |
| professionnel, sobre, direct | `list-compact`, `table-compact` |

Les bibliothèques sont dans `src/config/libraries/`.

---

## Variables d'environnement

```env
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4o-mini   # optionnel, défaut : gpt-4o-mini
```

---

## Ce qui n'est PAS géré ici

- **runtimeProps** des blocs booking (`services[]`, `bookings[]`, callbacks) → injectés par `PageRenderer` depuis Supabase, l'IA ne les touche pas
- **Persistance** des configs → gérée par `SiteCreator` via Supabase (`clients.config_url`)
- **Historique de conversation** → pas de mémoire longue, le contexte = état courant des configs
