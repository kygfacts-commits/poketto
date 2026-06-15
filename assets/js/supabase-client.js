// Poketto - Supabase client initialization
// Diimpor sebagai ES module: import { supabase } from './assets/js/supabase-client.js'

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tfsucrcuycrgzfbvbyhm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_56bxgM49qLJ75ryE5C2asg_rfY470r_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
