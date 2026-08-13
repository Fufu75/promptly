import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import type { Service } from '@/types';

export interface ServiceSelectorProps {
  services: Service[];
  selectedServiceId: string | null;
  accentColor: string;
  onServiceSelect: (serviceId: string) => void;
  sectionTitle?: string;
  sectionSubtitle?: string;
}

/**
 * ServiceSelector - Cards Grid
 * Grille 1-2 colonnes, cards avec nom/description/durée/prix
 * Ring + fond coloré sur sélection, icône check
 */
export const ServiceSelectorCardsGrid = ({
  services,
  selectedServiceId,
  accentColor,
  onServiceSelect,
  sectionTitle = 'Choisissez votre service',
  sectionSubtitle = 'Sélectionnez le service que vous souhaitez réserver',
}: ServiceSelectorProps) => {
  const enabledServices = services.filter(s => s.enabled);

  if (enabledServices.length === 0) return null;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg sm:text-xl font-semibold">{sectionTitle}</h3>
        {sectionSubtitle && (
          <p className="text-sm text-muted-foreground mt-1">{sectionSubtitle}</p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {enabledServices.map((service) => {
          const isSelected = selectedServiceId === service.id;
          return (
            <Card
              key={service.id}
              className={`cursor-pointer transition-all ${
                isSelected ? 'ring-2 shadow-md' : 'hover:shadow-md'
              }`}
              // `ringColor` n'existe pas en CSS — c'est un utilitaire Tailwind
              // (--tw-ring-color) qui n'a aucun effet dans un style inline. Le
              // liseré est déjà rendu par le boxShadow ci-dessous, donc le
              // retirer ne change rien à l'apparence.
              style={isSelected ? {
                borderColor: accentColor,
                boxShadow: `0 0 0 2px ${accentColor}`,
                backgroundColor: `${accentColor}08`,
              } : {}}
              onClick={() => onServiceSelect(service.id)}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base sm:text-lg font-semibold">{service.name}</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      {service.description}
                    </p>
                    <div className="flex items-center gap-3 sm:gap-4 mt-2 sm:mt-3">
                      <span className="text-xs sm:text-sm font-medium">
                        {service.duration} min
                      </span>
                      <span
                        className="text-xs sm:text-sm font-medium"
                        style={{ color: accentColor }}
                      >
                        {service.price}€
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle2
                      className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0"
                      style={{ color: accentColor }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
