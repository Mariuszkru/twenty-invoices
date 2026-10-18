// Treści wiadomości o wyciągach bankowych (markdown Rocket.Chat). Wysyłka wyłącznie przez createRocketChatSender.

const formatDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

const transactionsUrl = (crmUrl: string | null) =>
  crmUrl ? `${crmUrl.replace(/\/+$/, '')}/objects/bankTransactions` : null;

export const noConsentMessage = (reason: string) =>
  `:bank: Wyciąg bankowy nie został pobrany: ${reason} Uruchom w CRM polecenie *Połącz konto bankowe (Enable Banking)* i zatwierdź dostęp w banku.`;

export const consentExpiringMessage = (validUntil: string, daysLeft: number) =>
  `:hourglass: Zgoda na odczyt rachunku bankowego wygasa ${formatDate(validUntil)} (za ${daysLeft} ${
    daysLeft === 1 ? 'dzień' : 'dni'
  }). Odnów ją poleceniem *Połącz konto bankowe (Enable Banking)*, żeby płatności nadal były weryfikowane.`;

export const bankErrorMessage = (message: string) =>
  `:warning: Pobieranie wyciągu bankowego nie powiodło się: ${message}`;

export const bankSummaryMessage = (
  summary: { created: number; matched: number; unmatched: number; rematched: number },
  crmUrl: string | null,
) => {
  const url = transactionsUrl(crmUrl);
  const unmatched = summary.unmatched
    ? `, nieprzypisane: *${summary.unmatched}*${url ? ` – [sprawdź](${url})` : ''}`
    : '';
  const rematched = summary.rematched ? `, wcześniejsze dopasowane teraz: ${summary.rematched}` : '';
  return `:bank: Wyciąg bankowy: nowe transakcje ${summary.created}, dopasowane do faktur ${summary.matched}${unmatched}${rematched}.`;
};
