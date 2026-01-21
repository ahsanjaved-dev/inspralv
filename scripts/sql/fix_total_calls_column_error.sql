-- =============================================================================
-- FIX: Column "total_calls" does not exist error
-- The function update_campaign_stats uses "total_calls" but the actual column is "total_recipients"
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Step 1: Drop the trigger first (since it depends on the function)
DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON public.call_recipients;

-- Step 2: Drop ALL versions of update_campaign_stats function
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
    EXECUTE format('DROP FUNCTION IF EXISTS public.update_campaign_stats(%s) CASCADE', r.args);
  END LOOP;
END $$;

-- Step 3: Recreate the function with CORRECT column name (total_recipients, not total_calls)
CREATE OR REPLACE FUNCTION public.update_campaign_stats(p_campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.call_campaigns c
  SET 
    -- FIXED: Using total_recipients instead of total_calls
    total_recipients = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id),
    completed_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'completed'),
    successful_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'completed' AND call_outcome = 'answered'),
    failed_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'failed'),
    pending_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status IN ('pending', 'queued')),
    updated_at = NOW()
  WHERE c.id = p_campaign_id;
END;
$$;

-- Step 4: Recreate the trigger function
CREATE OR REPLACE FUNCTION public.trigger_update_campaign_stats_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Step 5: Recreate the trigger on call_recipients
CREATE TRIGGER trigger_update_campaign_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.call_recipients
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_campaign_stats_fn();

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.update_campaign_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_update_campaign_stats_fn() TO service_role;

-- Done! The function now uses the correct column name: total_recipients

