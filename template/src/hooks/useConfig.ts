import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import defaultConfig from '@/config/config.json';

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
  services: {
    id: string;
    name: string;
    description: string;
    duration: number;
    price: number;
    color: string;
    enabled: boolean;
  }[];
}

// Config chargée depuis config.json injecté par l'orchestrateur au moment du build.
// localStorage preview_config est utilisé uniquement en mode preview Promptly.
export const useConfig = () => {
  const [configuration] = useState<Config>(() => {
    // Mode preview Promptly
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
    // config.json injecté par l'orchestrateur → source de vérité
    return defaultConfig as Config;
  });

  const [loading] = useState(false);

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
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };
    return toHsl(r, g, b);
  };

  useEffect(() => {
    const primaryHsl = hexToHsl(configuration.theme.primaryColor);
    const secondaryHsl = hexToHsl(configuration.theme.secondaryColor);
    if (primaryHsl) {
      document.documentElement.style.setProperty('--primary', primaryHsl);
      document.documentElement.style.setProperty('--ring', primaryHsl);
      document.documentElement.style.setProperty('--accent', primaryHsl);
    }
    if (secondaryHsl) {
      document.documentElement.style.setProperty('--secondary', secondaryHsl);
    }
  }, [configuration]);

  return configuration;
};
