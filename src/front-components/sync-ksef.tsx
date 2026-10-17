import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { Command, enqueueSnackbar } from 'twenty-sdk/front-component';

import { ID } from 'src/constants/ids';

type SyncNowResponse = { ok: boolean; queued?: boolean; message?: string };

// Bezgłowe polecenie: kolejkuje synchronizację i pokazuje komunikat; błąd wyrzucony z execute Command zamienia na snackbar.
const SyncKsef = () => {
  const execute = async () => {
    const result = await new RestApiClient().post<SyncNowResponse>('/s/ksef/sync', {});
    if (!result.ok) {
      throw new Error(result.message ?? 'Nie udało się uruchomić synchronizacji KSeF.');
    }
    await enqueueSnackbar({
      message: 'Synchronizacja KSeF uruchomiona. Nowe faktury pojawią się w ciągu kilku minut.',
      variant: 'success',
    });
  };

  return <Command execute={execute} />;
};

export default defineFrontComponent({
  universalIdentifier: ID.fcSyncCommand,
  name: 'sync-ksef',
  description: 'Uruchamia synchronizację faktur z KSeF.',
  isHeadless: true,
  component: SyncKsef,
});
