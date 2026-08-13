import type { PageBlock } from '@/components/PageRenderer';
import type { Service } from '@/types/service';

// ─── Configs générées par l'IA ───────────────────────────────────────────────

export interface GlobalConfig {
  brandName: string;
  businessSector: string;
  accentColor: string;
  services: Service[];
  openingHours: Record<string, string>;
  contact: { email: string; phone: string; address: string };
}

export interface AIGeneratedConfigs {
  globalConfig: GlobalConfig;
  homepageBlocks: PageBlock[];
  authBlock: { variant: string; props: Record<string, unknown> };
  bookingBlocks: PageBlock[];
}

// ─── Réponse du chat IA ───────────────────────────────────────────────────────

export type AIResponseAction = 'ask' | 'modify' | 'advise';

export interface AIResponse {
  _action: AIResponseAction;
  _message: string;
  // Présent uniquement si _action === 'modify', et seulement les clés qui changent
  globalConfig?: Partial<GlobalConfig>;
  homepageBlocks?: PageBlock[];
  authBlock?: { variant: string; props: Record<string, unknown> };
  bookingBlocks?: PageBlock[];
}

// ─── Messages OpenAI ──────────────────────────────────────────────────────────

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Historique de conversation (format interne) ─────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
}
