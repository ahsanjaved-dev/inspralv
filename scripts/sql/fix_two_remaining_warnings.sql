-- =============================================================================
-- FIX REMAINING 2 FUNCTION WARNINGS
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Drop ALL versions of update_campaign_stats (any signature) with CASCADE
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_campaign_stats'
  LOOP
    EXECUTE format('DROP FUNCTION public.update_campaign_stats(%s) CASCADE', r.args);
  END LOOP;
END $$;

-- Recreate with SET search_path
CREATE FUNCTION public.update_campaign_stats(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.call_campaigns c
  SET 
    -- FIXED: Using total_recipients instead of total_calls (actual column name)
    total_recipients = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id),
    completed_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'completed'),
    successful_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'completed' AND call_outcome = 'answered'),
    failed_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'failed'),
    pending_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status IN ('pending', 'queued')),
    updated_at = NOW()
  WHERE c.id = p_campaign_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Recreate trigger function for auto-updating campaign stats
CREATE OR REPLACE FUNCTION public.trigger_update_campaign_stats_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- Update stats for the affected campaign
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_campaign_stats(OLD.campaign_id);
    RETURN OLD;
  ELSE
    PERFORM public.update_campaign_stats(NEW.campaign_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Recreate the trigger on call_recipients (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'call_recipients') THEN
    DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON public.call_recipients;
    CREATE TRIGGER trigger_update_campaign_stats
      AFTER INSERT OR UPDATE OR DELETE ON public.call_recipients
      FOR EACH ROW EXECUTE FUNCTION public.trigger_update_campaign_stats_fn();
  END IF;
END $$;

-- Drop ALL versions of bulk_update_recipient_status (any signature) with CASCADE
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bulk_update_recipient_status'
  LOOP
    EXECUTE format('DROP FUNCTION public.bulk_update_recipient_status(%s) CASCADE', r.args);
  END LOOP;
END $$;

-- Recreate with SET search_path
CREATE FUNCTION public.bulk_update_recipient_status(
  recipient_ids UUID[],
  new_status TEXT,
  error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..array_length(recipient_ids, 1) LOOP
    UPDATE public.call_recipients
    SET 
      call_status = new_status,
      last_error = error_message,
      updated_at = NOW()
    WHERE id = recipient_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Done!

