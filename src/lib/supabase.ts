import { createClient } from '@supabase/supabase-js';

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — set them in .env before building/running.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
