-- ============================================================================
-- PROMPTLY - INITIAL SCHEMA (FIXED ORDER)
-- ============================================================================
-- Description: Complete database schema for a booking/appointment system
-- Use case: Salons de coiffure, terrains de padel, consultations, etc.
--
-- Features:
--   - User authentication with roles (admin/client)
--   - Slot management (creation, deletion by admin)
--   - Booking management (creation by client, cancellation by admin or client)
--   - Row Level Security (RLS) for data protection
-- ============================================================================


-- ============================================================================
-- 0. EXTENSIONS (ENABLE FIRST)
-- ============================================================================

-- Enable btree_gist extension for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ============================================================================
-- 1. TABLES (CREATE FIRST)
-- ============================================================================

-- Table: profiles
-- Stores user profile information (admin or client)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: settings
-- Stores global application configuration (brand name, colors, hours, etc.)
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: slots
-- Stores available time slots created by admin
CREATE TABLE IF NOT EXISTS public.slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  service_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_slot_overlap EXCLUDE USING gist (
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'active')
);

-- Table: bookings
-- Stores client bookings linked to slots
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_booking_overlap EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'confirmed')
);


-- ============================================================================
-- 2. HELPER FUNCTIONS (CREATE AFTER TABLES)
-- ============================================================================

-- Function: Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function: Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END;
$$;


-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at on profiles
DROP TRIGGER IF EXISTS handle_updated_at_profiles ON public.profiles;
CREATE TRIGGER handle_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Auto-update updated_at on settings
DROP TRIGGER IF EXISTS handle_updated_at_settings ON public.settings;
CREATE TRIGGER handle_updated_at_settings
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Auto-update updated_at on slots
DROP TRIGGER IF EXISTS handle_updated_at_slots ON public.slots;
CREATE TRIGGER handle_updated_at_slots
  BEFORE UPDATE ON public.slots
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Auto-update updated_at on bookings
DROP TRIGGER IF EXISTS handle_updated_at_bookings ON public.bookings;
CREATE TRIGGER handle_updated_at_bookings
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Auto-create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Policies for: profiles
-- Users can view all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any profile
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- Policies for: settings
-- Everyone can read settings
DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;
CREATE POLICY "Anyone can view settings"
  ON public.settings FOR SELECT
  USING (true);

-- Only admins can modify settings
DROP POLICY IF EXISTS "Only admins can insert settings" ON public.settings;
CREATE POLICY "Only admins can insert settings"
  ON public.settings FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Only admins can update settings" ON public.settings;
CREATE POLICY "Only admins can update settings"
  ON public.settings FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Only admins can delete settings" ON public.settings;
CREATE POLICY "Only admins can delete settings"
  ON public.settings FOR DELETE
  USING (public.is_admin());

-- Policies for: slots
-- Everyone can view active slots
DROP POLICY IF EXISTS "Anyone can view slots" ON public.slots;
CREATE POLICY "Anyone can view slots"
  ON public.slots FOR SELECT
  USING (true);

-- Only admins can create slots
DROP POLICY IF EXISTS "Only admins can create slots" ON public.slots;
CREATE POLICY "Only admins can create slots"
  ON public.slots FOR INSERT
  WITH CHECK (public.is_admin());

-- Only admins can delete slots
DROP POLICY IF EXISTS "Only admins can delete slots" ON public.slots;
CREATE POLICY "Only admins can delete slots"
  ON public.slots FOR DELETE
  USING (public.is_admin());

-- Clients can update slot availability when booking
DROP POLICY IF EXISTS "Clients can update slot availability" ON public.slots;
CREATE POLICY "Clients can update slot availability"
  ON public.slots FOR UPDATE
  USING (true);

-- Policies for: bookings
-- Users can view their own bookings
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all confirmed bookings
DROP POLICY IF EXISTS "Admins can view all confirmed bookings" ON public.bookings;
CREATE POLICY "Admins can view all confirmed bookings"
  ON public.bookings FOR SELECT
  USING (public.is_admin() AND status = 'confirmed');

-- Users can create their own bookings
DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
CREATE POLICY "Users can create own bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can cancel their own bookings
DROP POLICY IF EXISTS "Users can cancel own bookings" ON public.bookings;
CREATE POLICY "Users can cancel own bookings"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can delete any booking
DROP POLICY IF EXISTS "Admins can delete bookings" ON public.bookings;
CREATE POLICY "Admins can delete bookings"
  ON public.bookings FOR DELETE
  USING (public.is_admin());


-- ============================================================================
-- 5. INDEXES (for performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_slots_start_time ON public.slots(start_time);
CREATE INDEX IF NOT EXISTS idx_slots_status ON public.slots(status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON public.bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
