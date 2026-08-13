import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfig } from '@/hooks/useConfig';
import { useBookings } from '@/hooks/useBookings';
import { useSlots } from '@/hooks/useSlots';
import { supabase } from '@/integrations/supabase/client';
import { AvailableTimePicker } from '@/components/AvailableTimePicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calendar } from 'lucide-react';
import { parseLocalDateTime, formatLocalDateTime } from '@/utils/dateHelpers';
import { BOOKING_STATUS } from '@/constants';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ServiceSelector } from '@/components/bookings/ServiceSelector';
import { FutureBookingBlocker } from '@/components/bookings/FutureBookingBlocker';
import { BookingList } from '@/components/bookings/BookingList';

const ClientBookings = () => {
  const { signOut, profile } = useAuth();
  const config = useConfig();

  // Use custom hooks for data management
  const {
    bookings: myBookings,
    isLoading: loadingBookings,
    fetchBookings,
    cancelBooking: cancelBookingHook,
    updatePastBookings
  } = useBookings({ userId: profile?.id });

  // Fetch all confirmed bookings (for conflict detection)
  const {
    bookings: allBookings,
    isLoading: loadingSlots,
    refetch: refetchBookings
  } = useSlots();

  // Sélection de service
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Update past bookings and fetch user bookings when profile is loaded
  useEffect(() => {
    if (profile?.id) {
      updatePastBookings();
      fetchBookings();
    }
  }, [profile?.id, updatePastBookings, fetchBookings]);

  // Réserver un créneau
  const bookTimeSlot = async (startTime: Date) => {
    if (!profile?.id) {
      toast.error('Veuillez vous connecter pour réserver');
      return;
    }

    if (!selectedService) {
      toast.error('Veuillez sélectionner un service');
      return;
    }

    // Récupérer le service sélectionné
    const service = config.services.find(s => s.id === selectedService);
    if (!service) {
      toast.error('Service introuvable');
      return;
    }

    // COUCHE 2 : Vérification de sécurité - empêcher les réservations multiples
    const futureBooking = myBookings.find(b =>
      b.status === BOOKING_STATUS.CONFIRMED &&
      parseLocalDateTime(b.start_time || '') > new Date()
    );

    if (futureBooking) {
      const bookingDate = parseLocalDateTime(futureBooking.start_time || '');

      toast.error(
        `Vous avez déjà un rendez-vous programmé le ${bookingDate.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
        })} à ${bookingDate.toLocaleTimeString('fr-FR', {
          hour: 'numeric',
          minute: '2-digit',
        })}. Veuillez attendre après ce rendez-vous pour réserver à nouveau.`
      );
      return;
    }

    // Calculer l'heure de fin
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + service.duration);

    // bookings.client_id est NOT NULL : c'est la colonne qui rattache la
    // réservation à un site client, et sur laquelle repose l'isolation RLS.
    // Elle vient du profil, renseigné à l'inscription. Elle était absente de
    // l'insert, qui échouait donc côté base — mieux vaut un message clair.
    if (!profile.client_id) {
      toast.error(
        "Votre compte n'est rattaché à aucun établissement. Contactez l'administrateur du site."
      );
      return;
    }

    // Créer la réservation (sans slot_id car on n'utilise plus la table slots)
    const { error: bookingError } = await supabase.from('bookings').insert({
      client_id: profile.client_id,
      user_id: profile.id,
      service_id: service.id,
      duration: service.duration,
      start_time: formatLocalDateTime(startTime),
      end_time: formatLocalDateTime(endTime),
      status: BOOKING_STATUS.CONFIRMED,
    });

    if (bookingError) {
      if (bookingError.code === '23505') {
        toast.error('Ce créneau est déjà réservé');
      } else {
        toast.error('Impossible de réserver ce créneau');
        console.error(bookingError);
      }
    } else {
      toast.success(`${service.name} réservé avec succès pour ${startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} !`);
      refetchBookings();
      fetchBookings();
    }
  };

  // Cancel booking wrapper
  const cancelBooking = async (bookingId: string) => {
    await cancelBookingHook(bookingId);
    refetchBookings();
  };

  const isLoading = loadingBookings || loadingSlots;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <PageHeader
        title={config.brandName}
        subtitle="Mes réservations"
        icon={Calendar}
        onSignOut={signOut}
      />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Sélection de service */}
        <ServiceSelector
          services={config.services}
          selectedServiceId={selectedService}
          onServiceSelect={setSelectedService}
        />

        {/* Sélecteur de créneaux - affiché seulement si un service est sélectionné */}
        {selectedService && (() => {
          const service = config.services.find(s => s.id === selectedService);
          if (!service) return null;

          // Vérifier si le client a déjà un rendez-vous futur confirmé
          const futureBooking = myBookings.find(b =>
            b.status === BOOKING_STATUS.CONFIRMED &&
            new Date(b.start_time || '') > new Date()
          );

          if (futureBooking) {
            return (
              <FutureBookingBlocker
                futureBooking={futureBooking}
                services={config.services}
              />
            );
          }

          // Si pas de rendez-vous futur, afficher le sélecteur normal
          return (
            <Card>
              <CardHeader>
                <CardTitle>Créneaux disponibles</CardTitle>
                <CardDescription>
                  Sélectionnez un jour, puis choisissez un créneau horaire pour votre {service.name} ({service.duration} min)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AvailableTimePicker
                  bookings={allBookings}
                  openingHours={config.openingHours}
                  serviceDuration={service.duration}
                  granularity={config.bookingSettings.timeSlotGranularity}
                  maxAdvanceBookingDays={config.bookingSettings.maxAdvanceBookingDays}
                  onTimeSelect={(startTime) => {
                    bookTimeSlot(startTime);
                  }}
                />
              </CardContent>
            </Card>
          );
        })()}

        <BookingList
          bookings={myBookings}
          services={config.services}
          allowCancellation={config.bookingSettings.allowCancellation}
          onCancel={cancelBooking}
        />
      </main>

    </div>
  );
};

export default ClientBookings;
