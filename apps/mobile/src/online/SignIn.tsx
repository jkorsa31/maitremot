/**
 * Sign-in screen: e-mail address, then the 6-digit code received by e-mail.
 * Then, the first time, the player chooses their nickname (ProfileSetup).
 */

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { colors, radius } from '../ui/theme';
import { saveProfile } from './api';
import { sendCode, verifyCode } from './auth';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<string | null>, onSuccess?: () => void) => {
    setBusy(true);
    setError(null);
    const message = await action();
    setBusy(false);
    if (message) setError(message);
    else onSuccess?.();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Connexion</Text>
      {step === 'email' ? (
        <>
          <Text style={styles.text}>
            Entre ton adresse e-mail : tu vas recevoir un code à 6 chiffres. Pas de mot de passe à
            retenir.
          </Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="adresse@exemple.fr"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
          <Button
            label={busy ? 'Envoi…' : 'Recevoir un code'}
            disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
            onPress={() =>
              void run(
                () => sendCode(email),
                () => setStep('code'),
              )
            }
          />
        </>
      ) : (
        <>
          <Text style={styles.text}>
            Code envoyé à {email.trim()}. Regarde aussi dans les indésirables.
          </Text>
          <TextInput
            style={[styles.input, styles.code]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <Button
            label={busy ? 'Vérification…' : 'Valider'}
            disabled={busy || code.length !== 6}
            onPress={() => void run(() => verifyCode(email, code))}
          />
          <Button
            label="Changer d'adresse"
            variant="ghost"
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export function ProfileSetup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Ton pseudo</Text>
      <Text style={styles.text}>C'est le nom que verront tes amis.</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Pseudo"
        maxLength={20}
        autoCorrect={false}
      />
      <Button
        label="Continuer"
        disabled={busy || name.trim().length === 0}
        onPress={async () => {
          setBusy(true);
          const profile = await saveProfile(name);
          setBusy(false);
          if (profile) onDone();
          else setError('Impossible d’enregistrer le pseudo. Réessaie.');
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  text: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, fontWeight: '600' },
});

const styles = StyleSheet.create({
  ...cardStyles,
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center' },
});
