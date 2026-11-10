/**
 * Sign-in settings: 6-digit codes sent by e-mail (no password, no link to
 * click), with French e-mails. Both templates are set because Supabase uses
 * "confirmation" for a first sign-in and "magic link" afterwards.
 *
 *   npm run supabase:auth -w @maitremot/tools
 */

import { api } from './api';

const subject = 'Ton code de connexion MaitreMot';
const body = `<h2>MaitreMot</h2>
<p>Voici ton code de connexion :</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Il est valable 15 minutes. Si tu n'as pas demandé ce code, ignore cet e-mail.</p>`;

await api('/config/auth', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mailer_otp_length: 6,
    mailer_otp_exp: 900,
    mailer_subjects_magic_link: subject,
    mailer_templates_magic_link_content: body,
    mailer_subjects_confirmation: subject,
    mailer_templates_confirmation_content: body,
  }),
});
console.log('auth settings updated');
