/**
 * Service types - Business services offered
 * Matches config.json structure
 */

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  enabled: boolean;
  /**
   * Couleur d'accent du service : pastilles de réservation, fonds de créneaux
   * dans le calendrier et l'admin. Optionnelle, parce que les configurations
   * générées avant son introduction n'en portent pas — les consommateurs
   * retombent alors sur `theme.primaryColor`.
   */
  color?: string;
}
