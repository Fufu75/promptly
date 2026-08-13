import type { QuestionnaireAnswer, ServiceAnswer } from '@/types/questionnaire';
import type { Config } from '@/hooks/useConfig';
import configTemplate from '@/config/config.json';

/**
 * Convertit les réponses du questionnaire en configuration de site
 */
export function questionnaireAnswersToConfig(
  answers: Record<string, QuestionnaireAnswer>
): Partial<Config> {
  const config: Partial<Config> = {};
  const baseConfig = configTemplate as Config;

  // Nom du business
  if (answers.business_name?.value) {
    config.brandName = answers.business_name.value as string;
    // Mettre à jour le SEO title avec le nom du business
    config.seo = {
      ...baseConfig.seo,
      title: `${answers.business_name.value as string} - Réservation en ligne`,
    };
  }

  // Type de business -> secteur
  if (answers.business_type?.value) {
    const businessType = answers.business_type.value as string;
    config.businessSector = businessType;
    
    // Générer des services par défaut selon le type (sera écrasé si des services sont fournis)
    config.services = generateServicesByBusinessType(businessType, answers);
  }

  // Horaires d'ouverture
  if (answers.opening_days?.value && answers.opening_hours?.value) {
    // `value` couvre tous les types de réponse (nombre, ServiceAnswer[]…), on
    // resserre donc sur ce que generateOpeningHours sait traiter plutôt que de
    // caster : une réponse d'un autre type donne une liste vide, pas un crash.
    const rawDays = answers.opening_days.value;
    const days: string | string[] =
      typeof rawDays === 'string'
        ? rawDays
        : Array.isArray(rawDays)
          ? rawDays.filter((day): day is string => typeof day === 'string')
          : [];
    const hours = String(answers.opening_hours.value);

    config.openingHours = generateOpeningHours(days, hours);
  }

  // Durée et prix par défaut
  if (answers.service_duration?.value) {
    // Parser la durée (peut être une chaîne comme "1h" ou un nombre)
    const durationStr = String(answers.service_duration.value);
    let duration = 30; // Par défaut
    
    // Parser "1h" ou "60" ou "60min"
    const hourMatch = durationStr.match(/(\d+)\s*h/i);
    const minMatch = durationStr.match(/(\d+)\s*min/i);
    const numMatch = durationStr.match(/(\d+)/);
    
    if (hourMatch) {
      duration = parseInt(hourMatch[1]) * 60;
    } else if (minMatch) {
      duration = parseInt(minMatch[1]);
    } else if (numMatch) {
      duration = parseInt(numMatch[1]);
    }
    
    config.bookingSettings = {
      ...baseConfig.bookingSettings,
      slotDuration: duration,
      timeSlotGranularity: Math.min(Math.floor(duration / 2), 15), // Granularité adaptée
    };
  }

  // Couleur principale
  if (answers.primary_color?.value) {
    config.theme = {
      ...baseConfig.theme,
      primaryColor: answers.primary_color.value as string,
    };
  }

  // Contact
  if (answers.contact_email?.value || answers.contact_phone?.value) {
    config.contact = {
      email: (answers.contact_email?.value as string) || baseConfig.contact.email,
      phone: (answers.contact_phone?.value as string) || baseConfig.contact.phone,
      address: baseConfig.contact.address,
    };
  }

  // Services personnalisés si spécifiés (priorité sur le type de business)
  if (answers.services?.value) {
    const servicesValue = answers.services.value;

    // Nouveau format : tableau de services [{name, duration, price}]
    if (Array.isArray(servicesValue)) {
      const servicesArray = (servicesValue as ServiceAnswer[]).filter(
        (s) => s.name && s.name.trim().length > 0
      );
      if (servicesArray.length > 0) {
        config.services = servicesArray.map((s, index) => ({
          id: `service-${index + 1}`,
          name: s.name,
          description: s.name,
          duration: Number(s.duration) || 30,
          price: Number(s.price) || 0,
          color: (answers.primary_color?.value as string) || '#0EA5E9',
          enabled: true,
        }));
      }
    } else {
      // Ancien format (texte séparé par virgules)
      const selectedServices = (servicesValue as string).split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (selectedServices.length > 0) {
        config.services = generateServicesFromList(selectedServices, answers);
      }
    }
  }

  return config;
}

/**
 * Génère des services selon le type de business
 */
function generateServicesByBusinessType(
  businessType: string,
  answers: Record<string, QuestionnaireAnswer>
): Config['services'] {
  // Parser la durée
  let duration = 30;
  if (answers.service_duration?.value) {
    const durationStr = String(answers.service_duration.value);
    const hourMatch = durationStr.match(/(\d+)\s*h/i);
    const numMatch = durationStr.match(/(\d+)/);
    if (hourMatch) {
      duration = parseInt(hourMatch[1]) * 60;
    } else if (numMatch) {
      duration = parseInt(numMatch[1]);
    }
  }
  
  // Parser le prix
  let price = 25;
  if (answers.service_price?.value) {
    const priceStr = String(answers.service_price.value);
    const priceMatch = priceStr.match(/(\d+)/);
    if (priceMatch) {
      price = parseInt(priceMatch[1]);
    }
  }
  
  const color = (answers.primary_color?.value as string) || '#0EA5E9';

  const services: Config['services'] = [];

  switch (businessType) {
    case 'Salon de coiffure':
      services.push(
        {
          id: 'coupe',
          name: 'Coupe',
          description: 'Coupe de cheveux',
          duration: duration,
          price: price,
          color: color,
          enabled: true,
        },
        {
          id: 'coloration',
          name: 'Coloration',
          description: 'Coloration complète',
          duration: duration * 2,
          price: price * 2,
          color: '#EC4899',
          enabled: true,
        }
      );
      break;

    case 'Cabinet médical / Santé':
      services.push({
        id: 'consultation',
        name: 'Consultation',
        description: 'Consultation médicale',
        duration: duration,
        price: price,
        color: '#10B981',
        enabled: true,
      });
      break;

    case 'Terrain de sport (Padel, Tennis, etc.)':
      services.push({
        id: 'location-1h',
        name: 'Location 1h',
        description: 'Location de terrain pour 1 heure',
        duration: 60,
        price: price,
        color: '#0EA5E9',
        enabled: true,
      });
      break;

    case 'Service de beauté / Esthétique':
      services.push(
        {
          id: 'soin-visage',
          name: 'Soin du visage',
          description: 'Soin complet du visage',
          duration: duration,
          price: price,
          color: '#EC4899',
          enabled: true,
        },
        {
          id: 'manucure',
          name: 'Manucure',
          description: 'Soin des ongles',
          duration: Math.floor(duration * 0.7),
          price: Math.floor(price * 0.8),
          color: '#8B5CF6',
          enabled: true,
        }
      );
      break;

    case 'salon de massage':
    case 'Salon de massage':
    case 'Massage':
      services.push({
        id: 'massage',
        name: 'Massage',
        description: 'Séance de massage relaxant',
        duration: duration,
        price: price,
        color: color,
        enabled: true,
      });
      break;

    default:
      // Si aucun type spécifique, utiliser les services personnalisés ou créer un service générique
      services.push({
        id: 'service-1',
        name: 'Service principal',
        description: 'Service personnalisé',
        duration: duration,
        price: price,
        color: color,
        enabled: true,
      });
  }

  return services;
}

/**
 * Génère des services à partir d'une liste de services sélectionnés
 */
function generateServicesFromList(
  serviceList: string[],
  answers: Record<string, QuestionnaireAnswer>
): Config['services'] {
  // Parser la durée
  let duration = 30;
  if (answers.service_duration?.value) {
    const durationStr = String(answers.service_duration.value);
    const hourMatch = durationStr.match(/(\d+)\s*h/i);
    const numMatch = durationStr.match(/(\d+)/);
    if (hourMatch) {
      duration = parseInt(hourMatch[1]) * 60;
    } else if (numMatch) {
      duration = parseInt(numMatch[1]);
    }
  }
  
  // Parser le prix
  let price = 25;
  if (answers.service_price?.value) {
    const priceStr = String(answers.service_price.value);
    const priceMatch = priceStr.match(/(\d+)/);
    if (priceMatch) {
      price = parseInt(priceMatch[1]);
    }
  }
  
  const color = (answers.primary_color?.value as string) || '#0EA5E9';

  const serviceMap: Record<string, { name: string; duration: number; price: number; color: string }> = {
    'Coupe de cheveux': { name: 'Coupe', duration: 30, price: 25, color: '#0EA5E9' },
    'Coloration': { name: 'Coloration', duration: 120, price: 80, color: '#EC4899' },
    'Mèches / Balayage': { name: 'Mèches', duration: 150, price: 100, color: '#8B5CF6' },
    'Soin capillaire': { name: 'Soin', duration: 45, price: 35, color: '#10B981' },
    'Barbe / Taille de barbe': { name: 'Taille de barbe', duration: 20, price: 15, color: '#F59E0B' },
    'Consultation médicale': { name: 'Consultation', duration: 30, price: 25, color: '#10B981' },
    'Suivi médical': { name: 'Suivi', duration: 20, price: 20, color: '#10B981' },
    'Location de terrain': { name: 'Location', duration: 60, price: 20, color: '#0EA5E9' },
    'Cours particulier': { name: 'Cours', duration: 60, price: 40, color: '#8B5CF6' },
    'Formation en groupe': { name: 'Formation', duration: 120, price: 50, color: '#8B5CF6' },
    'Soin du visage': { name: 'Soin visage', duration: 60, price: 45, color: '#EC4899' },
    'Manucure / Pédicure': { name: 'Manucure', duration: 45, price: 30, color: '#8B5CF6' },
    'Massage': { name: 'Massage', duration: 60, price: 50, color: '#10B981' },
  };

  return serviceList.map((serviceName, index) => {
    const serviceData = serviceMap[serviceName] || {
      name: serviceName,
      duration,
      price,
      color,
    };

    return {
      id: `service-${index + 1}`,
      name: serviceData.name,
      description: serviceName,
      duration: serviceData.duration,
      price: serviceData.price,
      color: serviceData.color,
      enabled: true,
    };
  });
}

/**
 * Génère les horaires d'ouverture
 */
function generateOpeningHours(days: string | string[], hours: string): Config['openingHours'] {
  const dayMap: Record<string, string> = {
    'Lundi': 'monday',
    'lundi': 'monday',
    'Mardi': 'tuesday',
    'mardi': 'tuesday',
    'Mercredi': 'wednesday',
    'mercredi': 'wednesday',
    'Jeudi': 'thursday',
    'jeudi': 'thursday',
    'Vendredi': 'friday',
    'vendredi': 'friday',
    'Samedi': 'saturday',
    'samedi': 'saturday',
    'Dimanche': 'sunday',
    'dimanche': 'sunday',
    'Toute la semaine': 'all',
    'toute la semaine': 'all',
    'Tous les jours': 'all',
    'tous les jours': 'all',
  };

  const openingHours: Config['openingHours'] = {
    monday: 'Closed',
    tuesday: 'Closed',
    wednesday: 'Closed',
    thursday: 'Closed',
    friday: 'Closed',
    saturday: 'Closed',
    sunday: 'Closed',
  };

  // Parser les heures (format: "9h00 - 18h00" ou "9:00-18:00" ou "9h - 18h" ou "9-18")
  const hoursMatch = hours.match(/(\d{1,2})[h:]?\s*(\d{2})?\s*-?\s*(\d{1,2})[h:]?\s*(\d{2})?/);
  if (hoursMatch) {
    const startHour = hoursMatch[1];
    const startMin = hoursMatch[2] || '00';
    const endHour = hoursMatch[3];
    const endMin = hoursMatch[4] || '00';
    const formattedHours = `${startHour}:${startMin}-${endHour}:${endMin}`;

    // Convertir days en chaîne pour traitement
    const daysStr = Array.isArray(days) ? days.join(', ') : days;
    const daysLower = daysStr.toLowerCase();
    
    // Détecter les exclusions (sauf, excepté, etc.)
    const exclusionKeywords = ['sauf', 'excepté', 'except', 'pas', 'non'];
    const hasExclusion = exclusionKeywords.some(keyword => daysLower.includes(keyword));
    
    // Si "toute la semaine" ou "tous les jours" avec ou sans exclusion
    if (daysLower.includes('tout') || daysLower.includes('tous')) {
      // Ouvrir tous les jours par défaut
      Object.keys(openingHours).forEach((day) => {
        openingHours[day as keyof typeof openingHours] = formattedHours;
      });
      
      // Appliquer les exclusions si présentes
      if (hasExclusion) {
        // Trouver la partie après "sauf"
        const exclusionMatch = daysLower.match(/(?:sauf|excepté|except|pas|non)\s+(.+)/);
        if (exclusionMatch) {
          const excludedDays = exclusionMatch[1];
          // Fermer les jours exclus
          if (excludedDays.includes('dimanche') || excludedDays.includes('sunday')) {
            openingHours.sunday = 'Closed';
          }
          if (excludedDays.includes('lundi') || excludedDays.includes('monday')) {
            openingHours.monday = 'Closed';
          }
          if (excludedDays.includes('mardi') || excludedDays.includes('tuesday')) {
            openingHours.tuesday = 'Closed';
          }
          if (excludedDays.includes('mercredi') || excludedDays.includes('wednesday')) {
            openingHours.wednesday = 'Closed';
          }
          if (excludedDays.includes('jeudi') || excludedDays.includes('thursday')) {
            openingHours.thursday = 'Closed';
          }
          if (excludedDays.includes('vendredi') || excludedDays.includes('friday')) {
            openingHours.friday = 'Closed';
          }
          if (excludedDays.includes('samedi') || excludedDays.includes('saturday')) {
            openingHours.saturday = 'Closed';
          }
        }
      }
    } else {
      // Sinon, ouvrir uniquement les jours mentionnés explicitement
      const daysArray = daysStr.split(',').map(d => d.trim());
      daysArray.forEach((day) => {
        const dayLower = day.toLowerCase();
        // Ignorer les mots d'exclusion et les jours exclus
        if (!exclusionKeywords.some(kw => dayLower.includes(kw))) {
          const dayKey = dayMap[day] || dayMap[dayLower];
          if (dayKey && dayKey !== 'all') {
            openingHours[dayKey as keyof typeof openingHours] = formattedHours;
          }
        }
      });
    }
  }

  return openingHours;
}

