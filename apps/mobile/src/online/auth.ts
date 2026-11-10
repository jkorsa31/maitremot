/**
 * Sign-in with a code received by e-mail (no password).
 * 1. `sendCode(email)`: Supabase e-mails a 6-digit code (and creates the
 *    account on first sign-in);
 * 2. `verifyCode(email, code)`: opens the session.
 */

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** French message for an authentication error. */
function authMessage(error: { status?: number; message?: string }): string {
  if (error.status === 429) return 'Trop de demandes. Patiente quelques minutes et réessaie.';
  if (/expired|invalid/i.test(error.message ?? '')) return 'Code incorrect ou expiré.';
  if (/email/i.test(error.message ?? '')) return 'Adresse e-mail invalide.';
  return 'Connexion impossible. Vérifie ta connexion à Internet.';
}

export async function sendCode(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  return error ? authMessage(error) : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  return error ? authMessage(error) : null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** The current session: undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
