/**
 * Supabase client of the app (online games).
 *
 * The project URL and the publishable key are public by design: what a player
 * may read or do is enforced on the server by Row Level Security and the
 * `game` Edge Function. The session is saved with AsyncStorage, so the player
 * stays signed in.
 */

import './polyfills';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import project from '../../../../supabase/project.json';

export const supabase = createClient(project.url, project.publishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// On phones, only refresh the session while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
