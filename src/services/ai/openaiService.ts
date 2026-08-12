import type { AIGeneratedConfigs, AIResponse, ConversationMessage, OpenAIMessage } from './types';
import { buildChatSystemPrompt, buildInitialSystemPrompt } from './systemPrompt';
import homepageLibrary from '@/config/libraries/homepage.json';
import authLibrary from '@/config/libraries/auth.json';
import bookingLibrary from '@/config/libraries/booking.json';
import homepageConfigDefault from '@/config/pages/homepage-config.json';

// ─── Validation des variants ──────────────────────────────────────────────────
// Construit une map { blockType → Set<validVariant> } depuis les library JSONs

const buildValidVariantsMap = (): Record<string, Set<string>> => {
  const map: Record<string, Set<string>> = {};
  const addFromLibrary = (lib: { componentsLibrary: Record<string, { variants: Record<string, unknown> }> }) => {
    for (const [blockType, def] of Object.entries(lib.componentsLibrary)) {
      map[blockType] = new Set(Object.keys(def.variants));
    }
  };
  addFromLibrary(homepageLibrary as any);
  addFromLibrary(authLibrary as any);
  addFromLibrary(bookingLibrary as any);
  return map;
};

const VALID_VARIANTS = buildValidVariantsMap();

const fixVariant = (blockType: string, variant: string): string => {
  const valid = VALID_VARIANTS[blockType];
  if (!valid || valid.has(variant)) return variant;
  // Fallback : premier variant valide disponible
  const fallback = [...valid][0];
  console.warn(`[AI] Variant "${variant}" invalide pour "${blockType}", corrigé en "${fallback}"`);
  return fallback;
};

const fixBlockVariants = (blocks: Array<{ type: string; variant: string; props: Record<string, any> }>) =>
  blocks.map((b) => ({ ...b, variant: fixVariant(b.type, b.variant) }));

export type { AIGeneratedConfigs, AIResponse } from './types';

// ─── Appel OpenAI, via le relais serveur ──────────────────────────────────────
// Le navigateur ne détient aucune clé : il poste sur /ai/chat, et c'est le
// serveur qui porte OPENAI_API_KEY. Une clé lue ici via une variable VITE_
// serait inlinée dans le bundle par Vite, donc servie à chaque visiteur.

const AI_ENDPOINT = `${import.meta.env.VITE_SITEGEN_URL || 'http://localhost:4000'}/ai/chat`;

const callOpenAI = async (messages: OpenAIMessage[]): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new Error(
      `Serveur IA injoignable sur ${AI_ENDPOINT}. Démarre-le avec \`npm run server\`.`
    );
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (err?.error === 'openai_not_configured') {
      throw new Error("OPENAI_API_KEY absente de l'environnement du serveur.");
    }
    throw new Error(`IA ${response.status}: ${err?.details || response.statusText}`);
  }

  const data = await response.json();
  if (!data?.content) throw new Error('Réponse IA vide');
  return data.content as string;
};

// ─── Génération initiale ──────────────────────────────────────────────────────
// Questionnaire → 4 configs complètes

export const generateInitialConfigs = async (
  businessDescription: string
): Promise<AIGeneratedConfigs> => {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: buildInitialSystemPrompt() },
    {
      role: 'user',
      content: `Génère la configuration complète pour ce business :\n\n${businessDescription}`,
    },
  ];

  const content = await callOpenAI(messages);
  const parsed = JSON.parse(content) as AIGeneratedConfigs;

  if (!parsed.globalConfig || !parsed.homepageBlocks || !parsed.authBlock || !parsed.bookingBlocks) {
    throw new Error('Structure JSON incomplète retournée par OpenAI');
  }

  // Corriger les variants invalides avant de retourner
  parsed.homepageBlocks = fixBlockVariants(parsed.homepageBlocks);
  parsed.authBlock = { ...parsed.authBlock, variant: fixVariant('Auth', parsed.authBlock.variant) };
  parsed.bookingBlocks = fixBlockVariants(parsed.bookingBlocks);

  // Filet de sécurité : s'assurer que tous les blocs requis sont présents
  parsed.homepageBlocks = ensureRequiredBlocks(parsed.homepageBlocks);

  return parsed;
};

// ─── Blocs requis sur la page d'accueil ──────────────────────────────────────

const REQUIRED_BLOCK_TYPES = ['Header', 'Hero', 'Features', 'Services', 'OpeningHours', 'Contact', 'FooterCTA', 'Footer'];
const DEFAULT_BLOCKS = (homepageConfigDefault as any).pageBlocks as Array<{ type: string; variant: string; props: Record<string, any> }>;

const ensureRequiredBlocks = (
  blocks: Array<{ type: string; variant: string; props: Record<string, any> }>
): Array<{ type: string; variant: string; props: Record<string, any> }> => {
  const present = new Set(blocks.map((b) => b.type));
  const missing = REQUIRED_BLOCK_TYPES.filter((t) => !present.has(t));

  if (missing.length === 0) return blocks;

  console.warn('[AI] Blocs manquants dans la réponse IA, injection des défauts :', missing);

  // Reconstruire le tableau dans l'ordre canonique
  const merged = REQUIRED_BLOCK_TYPES.map((type) => {
    const fromAI = blocks.find((b) => b.type === type);
    if (fromAI) return fromAI;
    const fallback = DEFAULT_BLOCKS.find((b) => b.type === type);
    return fallback!;
  });

  return merged;
};

// ─── Modification via chat ────────────────────────────────────────────────────
// Message utilisateur + historique + contexte business → réponse IA

export const updateConfigsFromChat = async (
  userMessage: string,
  currentConfigs: AIGeneratedConfigs,
  conversationHistory: ConversationMessage[],
  businessContext: string
): Promise<AIResponse> => {
  const systemPrompt = buildChatSystemPrompt(businessContext, currentConfigs);

  // Historique de conversation → messages OpenAI (agent devient assistant)
  const historyMessages: OpenAIMessage[] = conversationHistory.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content,
  }));

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage },
  ];

  const content = await callOpenAI(messages);
  const parsed = JSON.parse(content) as AIResponse;

  if (!parsed._action || !parsed._message) {
    throw new Error('Réponse IA invalide : _action ou _message manquant');
  }

  // Corriger les variants invalides si c'est une modification
  if (parsed._action === 'modify') {
    if (parsed.homepageBlocks) parsed.homepageBlocks = fixBlockVariants(parsed.homepageBlocks);
    if (parsed.authBlock) parsed.authBlock = { ...parsed.authBlock, variant: fixVariant('Auth', parsed.authBlock.variant) };
    if (parsed.bookingBlocks) parsed.bookingBlocks = fixBlockVariants(parsed.bookingBlocks);
  }

  return parsed;
};
