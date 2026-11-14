import { supabase } from '../lib/supabase.js';

/** Admin overview. The database function runs as the caller, so non-admins only get their own row. */
export async function learnerOverview() {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. The admin overview needs an internet connection.');
  }
  const { data, error } = await supabase.rpc('admin_learner_overview');
  if (error) throw new Error(error.message);
  return data || [];
}
