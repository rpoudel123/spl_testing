import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check for required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing required environment variables for Supabase client:\n' +
    (!supabaseUrl ? '- NEXT_PUBLIC_SUPABASE_URL\n' : '') +
    (!supabaseAnonKey ? '- NEXT_PUBLIC_SUPABASE_ANON_KEY\n' : '') +
    'Please check your .env.local file.'
  );
}

// Create Supabase client with proper headers
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'return=representation'
    },
  },
}); 