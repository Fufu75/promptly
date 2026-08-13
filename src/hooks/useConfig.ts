import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import config from '@/config/config.json';
import type { Service } from '@/types/service';

export interface Config {
  brandName: string;
  businessSector: string;
  logoUrl: string;
  description: string;
  contact: {
    phone: string;
    email: string;
    address: string;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    darkModeEnabled: boolean;
  };
  openingHours: {
    [key: string]: string;
  };
  bookingSettings: {
    slotDuration: number;
    timeSlotGranularity: number;
    maxAdvanceBookingDays: number;
    minAdvanceBookingHours: number;
    allowCancellation: boolean;
    cancellationDeadlineHours: number;
    maxBookingsPerUser: number;
    requireNotes: boolean;
    autoConfirm: boolean;
  };
  features: {
    showStats: boolean;
    allowMultipleSlots: boolean;
    enableNotifications: boolean;
    showRecentBookings: boolean;
    maxRecentBookings: number;
  };
  texts: {
    welcomeMessage: string;
    bookingSuccessMessage: string;
    bookingInstructions: string;
    cancellationPolicy: string;
    homepage: {
      heroTitle: string;
      heroDescription: string;
      ctaBookNow: string;
      ctaSignIn: string;
      ctaGetStarted: string;
      feature1Title: string;
      feature1Description: string;
      feature2Title: string;
      feature2Description: string;
      feature3Title: string;
      feature3Description: string;
    };
  };
  seo: {
    title: string;
    description: string;
    keywords: string;
  };
  social: {
    facebook: string;
    instagram: string;
    twitter: string;
    linkedin: string;
  };
  // Une seule déclaration fait foi : Service, dans @/types/service. La forme
  // était auparavant recopiée ici et dans services/ai/types.ts, et les copies
  // avaient divergé — le champ `color`, pourtant écrit et lu par le code,
  // manquait aux trois.
  services: Service[];
}

export const useConfig = () => {
  const [configuration, setConfiguration] = useState<Config>(() => {
    // Mode preview Promptly (priorité 2)
    const isPreviewMode = localStorage.getItem('is_preview_mode') === 'true';
    if (isPreviewMode) {
      try {
        const previewConfig = localStorage.getItem('preview_config');
        if (previewConfig) {
          return JSON.parse(previewConfig) as Config;
        }
      } catch (error) {
        console.error('Error loading preview config:', error);
      }
    }
    // Fallback config.json (priorité 3)
    return config as Config;
  });

  useEffect(() => {
    const clientId = import.meta.env.VITE_CLIENT_ID;
    if (!clientId) return;

    // Priorité 1 : fetch depuis Supabase par VITE_CLIENT_ID
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials missing, using default config');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    supabase
      .from('clients')
      .select('config_url')
      .eq('id', clientId)
      .single()
      .then(({ data, error }) => {
        if (error || !data?.config_url) {
          console.error('Failed to load client config from Supabase:', error?.message);
          return;
        }
        try {
          const parsed = typeof data.config_url === 'string'
            ? JSON.parse(data.config_url)
            : data.config_url;
          setConfiguration(parsed as Config);
        } catch (err) {
          console.error('Failed to parse client config:', err);
        }
      });
  }, []);

  // Convertir une couleur hex en HSL string pour Tailwind CSS vars
  const hexToHsl = (hex: string): string | null => {
    if (!hex || typeof hex !== 'string') return null;
    const clean = hex.replace('#', '');
    if (![3, 6].includes(clean.length)) return null;
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const int = parseInt(full, 16);
    if (Number.isNaN(int)) return null;
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    const toHsl = (r: number, g: number, b: number) => {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }
        h /= 6;
      }
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };
    return toHsl(r, g, b);
  };

  return configuration;
};
