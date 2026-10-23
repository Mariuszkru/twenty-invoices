import { RocketChatApiError } from 'src/lib/notify/rocketchat';

type CreateChannel = (name: string) => Promise<{ id: string; name: string }>;

// Domyślna walidacja nazw kanałów w Rocket.Chat to [0-9a-zA-Z-_.]+, więc usuwamy polskie znaki i resztę zamieniamy na "-".
export const projectChannelName = (projectName: string | null | undefined): string =>
  (projectName ?? '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-z_.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);

// Zajęta nazwa: drugi raz z końcówką z identyfikatora projektu. Końcówka jest stała, więc ponowione zdarzenie
// trafia na ten sam kanał (DUPLICATE) zamiast tworzyć kolejny.
export const createProjectChannel = async (
  createChannel: CreateChannel,
  projectId: string,
  projectName: string | null | undefined,
): Promise<{ created: string } | { skipped: 'DUPLICATE'; name: string }> => {
  const suffix = projectId.replace(/-/g, '').slice(0, 8);
  const base = projectChannelName(projectName);
  const candidates = base ? [base, `${base}-${suffix}`] : [`projekt-${suffix}`];
  for (const name of candidates) {
    try {
      return { created: (await createChannel(name)).name };
    } catch (error) {
      if (!(error instanceof RocketChatApiError) || error.errorType !== 'error-duplicate-channel-name') throw error;
    }
  }
  return { skipped: 'DUPLICATE', name: candidates[candidates.length - 1] };
};
