# Pipeline IA — OpenAI & Génération de Sites

## Vue d'ensemble

Le pipeline IA convertit la description d'une activité en configuration complète de site. Il opère en deux temps : une **génération initiale** depuis le questionnaire, puis des **modifications conversationnelles** via le chat. Tout repose sur OpenAI gpt-4o-mini avec un system prompt en 4 couches.

## Fichiers concernés

```
src/services/ai/
    openaiService.ts    Appels OpenAI, validation, orchestration
    systemPrompt.ts     4 couches de prompt (~150 lignes)
    types.ts            Interfaces des réponses IA
src/types/
    questionnaire.ts    9 questions + types réponses
    siteConfig.ts       Types config générée
```

## Le questionnaire (`src/types/questionnaire.ts`)

9 questions recueillent le contexte business avant toute génération :

| # | ID | Type | Rôle |
|---|----|------|------|
| 1 | `business_type` | text | Type d'activité |
| 2 | `business_name` | text | Nom de l'établissement |
| 3 | `services` | services | Liste des prestations (nom, durée, prix) |
| 4 | `opening_days` | text | Jours d'ouverture |
| 5 | `opening_hours` | text | Horaires |
| 6 | `ambiance` | text | 3 mots décrivant l'ambiance souhaitée |
| 7 | `primary_color` | color | Couleur principale |
| 8 | `contact_email` | text | Email de contact |
| 9 | `contact_phone` | text | Téléphone |

La question `ambiance` est particulièrement clé : elle guide l'IA vers les variants dont les `mood[]` correspondent à l'atmosphère souhaitée (ex: "luxe, minimaliste, élégant" → variants avec `mood: ["luxueux", "épuré"]`).

Les réponses sont sérialisées en texte lisible par `buildBusinessDescription()` dans `useSiteCreator.ts` :

```typescript
// Exemple de sortie pour les services
"Services proposés : Massage relaxant (60 min, 70€) | Soin visage (45 min, 55€)"
```

## openaiService.ts

### Validation des variants

Au chargement du module, un registre de validation est construit depuis les 3 bibliothèques JSON :

```typescript
const buildValidVariantsMap = (): Record<string, Set<string>> => {
  const map: Record<string, Set<string>> = {};
  const addFromLibrary = (lib: any) => {
    for (const [blockType, def] of Object.entries(lib.componentsLibrary)) {
      map[blockType] = new Set(Object.keys((def as any).variants));
    }
  };
  addFromLibrary(homepageLibrary);
  addFromLibrary(authLibrary);
  addFromLibrary(bookingLibrary);
  return map;
};
```

Si l'IA retourne un variant inexistant (ex: `"cards-hover"` pour un bloc Hero), `fixVariant()` le remplace par le premier variant valide du même type.

### Appel OpenAI

Le client ne parle jamais directement à OpenAI : il poste sur le relais du
serveur, seul détenteur de la clé.

```typescript
const AI_ENDPOINT = `${import.meta.env.VITE_SITEGEN_URL || 'http://localhost:4000'}/ai/chat`;

const callOpenAI = async (messages: OpenAIMessage[]): Promise<string> => {
  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  // ...
  const data = await response.json();
  return data.content;
};
```

Côté serveur (`server/index.js`) :

```javascript
app.post('/ai/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;   // jamais préfixée VITE_
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: req.body.messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },  // Garantit du JSON valide
    }),
  });
  // ...
});
```

`response_format: json_object` est essentiel : il force OpenAI à toujours retourner du JSON parsable, évitant les réponses en texte libre.

### generateInitialConfigs()

Déclenché après le questionnaire. Construit 4 configurations complètes en un seul appel :

```typescript
export const generateInitialConfigs = async (
  businessDescription: string
): Promise<AIGeneratedConfigs>
```

**Entrée** : Texte sérialisé des 9 réponses

**Sortie attendue** :
```json
{
  "globalConfig": {
    "brandName": "Studio Zen",
    "businessSector": "Bien-être",
    "accentColor": "#7C3AED",
    "services": [
      { "id": "s1", "name": "Massage", "duration": 60, "price": 70, "enabled": true }
    ],
    "openingHours": { "monday": "9h-19h", ... },
    "contact": { "email": "...", "phone": "...", "address": "..." }
  },
  "homepageBlocks": [ ... 8 blocs avec variants choisis ... ],
  "authBlock": { "variant": "split-image", "props": { ... } },
  "bookingBlocks": [ ... 3 blocs dans l'ordre immuable ... ]
}
```

Post-traitement : `fixBlockVariants()` corrige tous les variants invalides avant de retourner les configs.

### updateConfigsFromChat()

Déclenché à chaque message utilisateur dans le chat. Passe l'historique de conversation + la config actuelle :

```typescript
export const updateConfigsFromChat = async (
  userMessage: string,
  currentConfigs: AIGeneratedConfigs,
  conversationHistory: ConversationMessage[],  // 6 derniers messages max
  businessContext: string
): Promise<AIResponse>
```

L'historique est **tronqué aux 6 derniers messages** (`chatMessages.slice(-6)`) — la config actuelle envoyée dans le system prompt suffit comme mémoire long terme.

## System Prompt — 4 couches (`src/services/ai/systemPrompt.ts`)

### Couche 1 : PERSONA_AND_RULES

Définit le comportement global de l'IA :

- **Persona** : designer web expert en sites de réservation
- **Langue** : français simple, sans noms techniques (pas de "Hero", "ServiceSelector")
- **Ton** : chaleureux, professionnel, concis + markdown sobre + émojis sobres
- **Décision action** :
  - `ask` → demande vague ou manque d'info
  - `modify` → demande claire et actionnable
  - `advise` → suggestion d'exploration
- **Contrainte** : une seule question max par réponse

### Couche 2 : LIBRARY_AND_CONTRACT

Injecte la totalité des 3 bibliothèques JSON dans le prompt. L'IA connaît ainsi exactement :

- Tous les types de blocs disponibles
- Tous les variants avec leurs props obligatoires/optionnelles
- Les règles de props : pas d'invention, `accentColor` identique partout
- Les `runtimeProps` booking (injectés automatiquement côté client, à ne pas inclure)

### Couche 3 : AMBIANCE_GUIDANCE

Guide la sélection des variants par l'ambiance :

- Les champs `mood[]` de chaque variant décrivent son atmosphère
- L'IA est instruite d'aligner ses choix avec les mots-clés ambiance du questionnaire
- Cohérence visuelle garantie entre tous les blocs d'une même page

### Couche 4 : PAGE_STRUCTURE_RULES

Règles structurelles strictes :

- **Homepage** : Header en premier, Footer en dernier, Hero obligatoire, ordre logique
- **Auth** : bloc unique, variant modifiable selon contexte
- **Booking** : ordre **immuable** — ServiceSelector → TimePicker → BookingList
- `homepageBlocks` toujours retourné **complet** (pas uniquement les blocs modifiés)

## Types IA (`src/services/ai/types.ts`)

### AIGeneratedConfigs

Structure retournée par la génération initiale :

```typescript
interface AIGeneratedConfigs {
  globalConfig: GlobalConfig;
  homepageBlocks: PageBlock[];
  authBlock: { variant: string; props: Record<string, any> };
  bookingBlocks: PageBlock[];
}
```

### AIResponse

Structure retournée par le chat conversationnel :

```typescript
interface AIResponse {
  _action: 'ask' | 'modify' | 'advise';
  _message: string;             // Réponse en langage naturel
  globalConfig?: Partial<GlobalConfig>;
  homepageBlocks?: PageBlock[];
  authBlock?: { variant: string; props: Record<string, any> };
  bookingBlocks?: PageBlock[];
}
```

Le champ `_action` détermine ce que l'interface fait :

- `ask` → affiche le message, attend la réponse, ne modifie rien
- `modify` → merge les configs retournées dans le state React, marque `isDirty`
- `advise` → affiche le message comme suggestion, sans modification

### ConversationMessage

```typescript
interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
}
```

## Normalisation des services

L'IA omet parfois le champ `enabled` sur les services. Sans lui, le filtre `s.enabled !== false` les exclurait de l'affichage. `normalizeServices()` est appliqué à tous les points d'entrée (génération initiale, chat modify, chargement Supabase, chargement localStorage) :

```typescript
const normalizeServices = (config: GeneratedSiteConfig): GeneratedSiteConfig => ({
  ...config,
  services: (config.services || []).map((s: any) => ({
    ...s,
    enabled: s.enabled !== false,
  })),
});
```

## Gestion de la clé API

La clé vit dans `OPENAI_API_KEY`, lue par `server/index.js` — **sans préfixe
`VITE_`, et c'est délibéré**. Vite inline toute variable préfixée `VITE_` dans
le bundle client au moment du build : une clé nommée `VITE_OPENAI_API_KEY`
serait servie en clair à chaque visiteur du site déployé et extractible du
JavaScript en quelques secondes.

Le navigateur poste donc sur `POST {VITE_SITEGEN_URL}/ai/chat`, et le serveur
relaie vers OpenAI. Conséquence pratique : **le serveur doit tourner** pour que
la génération fonctionne, y compris en développement (`npm run server`, ou
`npm run dev:all` qui lance front et serveur ensemble).

Si la clé est absente de l'environnement du serveur, la route répond `503
openai_not_configured` et le client affiche un message explicite plutôt que
d'échouer silencieusement.
