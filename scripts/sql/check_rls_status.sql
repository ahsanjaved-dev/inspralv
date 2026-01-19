-- =============================================================================
-- CHECK RLS STATUS ON ALL TABLES
-- =============================================================================
-- Run this query in Supabase SQL Editor to see which tables have RLS disabled
-- =============================================================================

-- List all tables and their RLS status
SELECT 
  tablename as "Table Name",
  CASE 
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as "RLS Status"
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma_%'
ORDER BY rowsecurity, tablename;

-- =============================================================================
-- Summary: Count of tables with RLS enabled vs disabled
-- =============================================================================

SELECT 
  CASE 
    WHEN rowsecurity THEN 'RLS Enabled'
    ELSE 'RLS Disabled'
  END as "Status",
  COUNT(*) as "Count"
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma_%'
GROUP BY rowsecurity;

-- =============================================================================
-- List existing RLS policies
-- =============================================================================

SELECT 
  tablename as "Table",
  policyname as "Policy Name",
  cmd as "Command",
  roles as "Roles"
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

