// Poketto - Supabase client initialization
// Diimpor sebagai ES module: import { supabase } from './assets/js/supabase-client.js'

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://udqepcfsezblqablubfm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ImQAuahMth2zwfaiW36tnw_hyBjo5OG';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
