# Interface Créateur — SiteCreator & useSiteCreator

## Vue d'ensemble

L'interface créateur est le panneau central de Promptly. Elle orchestre le questionnaire initial, le chat IA, l'édition manuelle de la configuration, l'upload d'images, la prévisualisation et la sauvegarde. La logique complète est encapsulée dans le hook `useSiteCreator`, rendant `SiteCreator.tsx` un orchestrateur pur de ~220 lignes.

## Fichiers concernés

```
src/pages/SiteCreator.tsx              Orchestrateur, layout, slots images
src/hooks/useSiteCreator.ts            Toute la logique (~600 lignes)
src/components/creator/ChatPanel.tsx   UI chat uniquement (~150 lignes)
src/components/creator/ConfigPanel.tsx UI config + images (~250 lignes)
src/components/PreviewModal.tsx        Aperçu 3 pages
src/components/QuestionnaireForm.tsx   Questionnaire 9 questions
```

## SiteCreator.tsx — Orchestrateur

### Layout

La page utilise un layout `h-screen overflow-hidden flex flex-col` pour éviter le scroll global. Seul le chat et la config scrollent en interne via une chaîne `flex-1 min-h-0`.

```
h-screen flex flex-col
  └── container flex-1 flex flex-col min-h-0
        ├── Header (shrink-0) — nom projet, save, retour
        └── Tabs flex-1 flex flex-col min-h-0
              ├── [Créateur] grid 2/3 + 1/3
              │     ├── ChatPanel  (h-full)
              │     └── ConfigPanel (h-full overflow-y-auto)
              └── [Déploiement]
                    └── DeploymentManager
```

### Flux conditionnel

```typescript
if (!questionnaireCompleted) {
  return <QuestionnaireForm onComplete={handleQuestionnaireComplete} onSkip={...} />;
}
return <créateur IA />;
```

### Slots images dynamiques

Les slots d'upload sont construits dynamiquement selon le variant Hero actif :

```typescript
const imageSlots: ImageSlot[] = [
  // Logo — toujours présent
  { blockType: 'Header', propName: 'logoUrl', label: 'Logo', aspectRatio: 'square', ... },

  // Image de fond Hero — sauf si variant split-image
  ...(heroVariant !== 'split-image' ? [{
    blockType: 'Hero', propName: 'backgroundImage', aspectRatio: 'video', ...
  }] : []),

  // Image latérale Hero — uniquement pour split-image
  ...(heroVariant === 'split-image' ? [{
    blockType: 'Hero', propName: 'sideImage', aspectRatio: 'square', ...
  }] : []),

  // Image Auth — uniquement si variant split-image
  ...(authBlock?.variant === 'split-image' ? [{
    blockType: 'Auth', propName: 'backgroundImage', aspectRatio: 'video', ...
  }] : []),
];
```

### Guard "modifications non sauvegardées"

Un `AlertDialog` s'affiche si l'utilisateur tente de quitter avec des changements non sauvegardés :

```typescript
<Button onClick={() => isDirty ? setShowLeaveDialog(true) : navigate('/dashboard')}>
  Mes Projets
</Button>
```

## useSiteCreator.ts — Logique complète

### État géré

```typescript
// Questionnaire
questionnaireCompleted: boolean
businessContext: string

// Projet Supabase
currentProjectId: string | null
projectName: string
isSaving: boolean
lastSaved: Date | null
isDirty: boolean           // True dès qu'une modification non sauvegardée existe

// Configs IA
generatedConfig: GeneratedSiteConfig
homepageBlocks: PageBlock[]
authBlock: { variant: string; props: Record<string, any> }
bookingBlocks: PageBlock[]

// Chat — intentionnellement éphémère, jamais persisté
chatMessages: ChatMessage[]
chatInput: string
aiState: { isGenerating, progress, currentStep }

// Preview
isPreviewOpen: boolean
```

### Session localStorage (`creator-session`)

La session est sauvegardée automatiquement après chaque génération ou modification. Elle **ne contient pas** `chatMessages` — le chat recommence à zéro à chaque ouverture, par choix délibéré.

```typescript
interface CreatorSession {
  generatedConfig: GeneratedSiteConfig;
  homepageBlocks: PageBlock[];
  authBlock: { variant: string; props: Record<string, any> };
  bookingBlocks: PageBlock[];
  businessContext: string;
  projectName: string;
  currentProjectId: string | null;
  questionnaireCompleted: boolean;
  // chatMessages absent intentionnellement
}
```

Au mount, si aucun `projectId` n'est dans l'URL, la session locale est restaurée. Si un `projectId` est présent, la session locale est effacée et le projet Supabase est chargé.

### Message de bienvenue contextuel

À l'ouverture d'un projet existant, un message est généré **localement** (sans appel OpenAI) depuis la config :

```typescript
const buildWelcomeMessage = (config: GeneratedSiteConfig): string => {
  const name = config.brandName || 'votre projet';
  const sector = config.businessSector ? ` dans le secteur **${config.businessSector}**` : '';
  const services = (config.services || []).filter((s: any) => s.enabled !== false);

  let msg = `Bonjour ! Voici votre projet **${name}**${sector}.\n\n`;
  if (services.length) {
    msg += `**Services configurés :**\n`;
    services.forEach((s: any) => {
      msg += `- **${s.name}** — ${s.duration} min · ${s.price}€\n`;
    });
  }
  msg += `Dites-moi ce que vous souhaitez modifier...`;
  return msg;
};
```

### Sauvegarde Supabase

La structure persistée dans `config_url` (JSON stringifié) :

```typescript
const configToSave = {
  ...configRef.current,         // globalConfig complet
  _pageBlocks: {
    homepage: homepageBlocks,   // 8 blocs avec variants et props
    auth: authBlock,
    booking: bookingBlocks,
  },
  _chatState: {
    businessContext,            // Contexte business pour futures sessions IA
    // messages: absent — chat éphémère
  },
};
```

- **Nouveau projet** : génère un slug URL-safe depuis le nom, insère dans `clients`
- **Projet existant** : met à jour `config_url` et `updated_at`
- `isDirty` passe à `false` après sauvegarde réussie

### Synchronisation logo Header ↔ Auth

Le logo est un asset partagé entre la page d'accueil (Header) et la page de connexion (Auth). Un seul slot d'upload est exposé, et `updateBlockProp` synchronise automatiquement les deux blocs :

```typescript
if (blockType === 'Header' && propName === 'logoUrl') {
  setAuthBlock((prevAuth) => ({
    ...prevAuth,
    props: { ...prevAuth.props, logoUrl: value },
  }));
}
```

### isDirty — Suivi des modifications

`isDirty` est mis à `true` par :
- Génération initiale (questionnaire)
- Réponse IA avec `_action: 'modify'`
- `updateConfigField()` — édition inline d'un champ
- `updateServiceField()` — modification d'un service
- `addService()` / `removeService()`

`isDirty` est remis à `false` uniquement après une sauvegarde Supabase réussie.

## ChatPanel.tsx — UI Chat

### Layout interne

```
Card h-full flex flex-col overflow-hidden
  ├── CardHeader shrink-0    — titre + bouton clear
  ├── CardContent flex-1 flex flex-col min-h-0 p-0 overflow-hidden
  │     └── ScrollArea flex-1 min-h-0
  │           └── Messages (user droite / agent gauche)
  └── div shrink-0            — zone input + bouton envoyer
```

### Rendu des messages

- **Utilisateur** : bulle droite, fond `primary/10`
- **Agent** : bulle gauche, texte rendu via `react-markdown` (supporte gras, listes, liens)
- **En cours** : spinner + barre de progression animée

### Interactions clavier

- `Enter` → envoyer le message
- `Shift+Enter` → saut de ligne
- Input et bouton désactivés pendant la génération IA

## ConfigPanel.tsx — Édition manuelle

### Sections

1. **Champs éditables inline** : `brandName`, `businessSector`, `theme.primaryColor` (avec color picker)
2. **Services** : liste avec add/remove, édition nom/durée/prix en ligne
3. **Images** : slots groupés par page (homepage / auth) avec upload/preview/remove
4. **Export ZIP** : bouton en bas de scroll

### ImageSlot — Interface de slot d'image

```typescript
interface ImageSlot {
  blockType: string;         // "Header", "Hero", "Auth"
  propName: string;          // "logoUrl", "backgroundImage", "sideImage"
  label: string;             // Nom affiché
  context: string;           // Description de l'usage visuel
  aspectRatio: 'square' | 'video';  // Détermine le ratio de l'aperçu
  hint: string;              // Conseil format/dimensions
  accept: string;            // Types MIME acceptés
  page: 'homepage' | 'auth'; // Groupement dans l'UI
  currentUrl?: string;       // URL actuelle si image uploadée
}
```

L'aperçu dans ConfigPanel reflète fidèlement le ratio réel d'utilisation dans les composants :
- `square` → miniature 64×64px (logo dans navbar)
- `video` → largeur totale, ratio 16:9 (background cover)

### Inputs services sans spinner natif

Les champs durée et prix utilisent `type="text" inputMode="numeric"` pour éviter les flèches des inputs numériques natifs, avec affichage vide (pas de 0) quand la valeur est absente :

```tsx
<Input
  type="text"
  inputMode="numeric"
  value={service.duration || ''}
  onChange={(e) => onUpdateServiceField(idx, 'duration', e.target.value)}
  placeholder="—"
/>
```

## PreviewModal.tsx — Aperçu 3 pages

Modal plein écran affichant les 3 pages du site générées via `PageRenderer` :

```typescript
const globalOverride = {
  brandName: config.brandName,
  accentColor: config.theme?.primaryColor,
  services: config.services?.filter((s: any) => s.enabled),
  openingHours: config.openingHours,
  contact: config.contact,
};
```

Trois onglets : **Accueil** / **Connexion** / **Réservation**, chacun rendu par `<PageRenderer blocks={...} config={globalOverride} />`.
