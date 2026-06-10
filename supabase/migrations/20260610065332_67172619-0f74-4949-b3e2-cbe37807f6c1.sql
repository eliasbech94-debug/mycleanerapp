
CREATE TABLE public.customer_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('setup','reminder','cleaner_message','tip','alert','update')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  action_label text,
  action_url text,
  related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_thread_id uuid REFERENCES public.support_threads(id) ON DELETE SET NULL,
  dedupe_key text,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.customer_notifications TO authenticated;
GRANT ALL ON public.customer_notifications TO service_role;

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.customer_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.customer_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.customer_notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX customer_notifications_user_idx
  ON public.customer_notifications(user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

-- Prevent dupes from health-check runs
CREATE UNIQUE INDEX customer_notifications_dedupe_idx
  ON public.customer_notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dismissed_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
