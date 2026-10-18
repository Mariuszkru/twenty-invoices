import { defineLogicFunction } from 'twenty-sdk/define';
import { Response, type RoutePayload } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { appKv, bankClientFor, readBankConfig, saveBankSession } from 'src/lib/bank/bank-from-env';
import { BankConfigError, completeAuthorization } from 'src/lib/bank/consent';
import { BANK_KV_KEYS } from 'src/lib/bank/run-bank-sync';
import type { PendingState } from 'src/logic-functions/bank-connect.logic-function';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Odpowiedź dla przeglądarki wracającej z banku. Nagłówek Location nie jest dozwolony, więc zamiast przekierowania
// krótka strona z linkiem do CRM.
const page = (title: string, text: string, status = 200) => {
  const crmUrl = process.env.CRM_URL?.trim().replace(/\/+$/, '');
  const link = crmUrl ? `<p><a href="${escapeHtml(`${crmUrl}/objects/bankTransactions`)}">Wróć do CRM</a></p>` : '';
  return new Response(
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;line-height:1.5;color:#333}a{color:#1961ed}</style></head>` +
      `<body><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${link}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
};

// Powrót z banku po autoryzacji (redirect_url zarejestrowany w Enable Banking). Trasa publiczna, bo wywołuje ją
// przeglądarka wracająca z banku; zabezpiecza ją jednorazowy `state` z bank-connect. Kodu nie zapisujemy w logach.
const handler = async (event: RoutePayload) => {
  const { code, state, error, error_description: errorDescription } = event.queryStringParameters ?? {};

  const pending = await appKv.get<PendingState>(BANK_KV_KEYS.state);
  if (!state || !pending || pending.value !== state || pending.expiresAt < Date.now()) {
    return page('Link wygasł', 'Ten powrót z banku jest nieważny albo przeterminowany. Uruchom połączenie z bankiem ponownie w CRM.', 400);
  }
  await appKv.set(BANK_KV_KEYS.state, null);

  if (error || !code) {
    return page('Bank nie udzielił dostępu', errorDescription || error || 'Autoryzacja została przerwana.', 400);
  }

  const config = readBankConfig();
  if ('error' in config) return page('Brak konfiguracji', config.error, 500);
  try {
    const session = await completeAuthorization(bankClientFor(config), code, config.appId);
    await saveBankSession(session);
    const accounts = session.accounts.map((a) => a.iban ?? a.uid).join(', ');
    console.log(`[bank-callback] połączono ${session.aspsp.name}, rachunków: ${session.accounts.length}, ważna do ${session.validUntil}`);
    return page(
      'Połączono z bankiem',
      `Rachunki: ${accounts}. Zgoda ważna do ${session.validUntil.slice(0, 10)}. Wyciąg będzie pobierany codziennie rano.`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!(e instanceof BankConfigError)) console.error(`[bank-callback] ${message}`);
    return page('Nie udało się połączyć z bankiem', message, 502);
  }
};

export default defineLogicFunction({
  universalIdentifier: ID.fnBankCallback,
  name: 'bank-callback',
  description: 'Odbiera powrót z banku po autoryzacji Enable Banking i zapisuje sesję.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/bank/callback',
    httpMethod: 'GET',
    isAuthRequired: false,
  },
  handler,
});
