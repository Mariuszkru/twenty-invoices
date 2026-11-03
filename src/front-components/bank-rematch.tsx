import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { Command, enqueueSnackbar } from 'twenty-sdk/front-component';

import { ID } from 'src/constants/ids';

type RematchResponse = { ok: boolean; rematched?: number; invoicesUpdated?: number; days?: number; message?: string };

// Bezgłowe polecenie: ponawia dopasowanie nieprzypisanych przelewów i pokazuje wynik; błąd z execute Command
// zamienia na snackbar.
const BankRematch = () => {
  const execute = async () => {
    const result = await new RestApiClient().post<RematchResponse>('/s/bank/rematch', {});
    if (!result.ok) {
      throw new Error(result.message ?? 'Nie udało się dopasować przelewów.');
    }
    const rematched = result.rematched ?? 0;
    await enqueueSnackbar({
      message: rematched
        ? `Dopasowano przelewy: ${rematched}, zaktualizowane faktury: ${result.invoicesUpdated ?? 0}. Odśwież widok.`
        : `Brak nowych dopasowań wśród nieprzypisanych przelewów z ostatnich ${result.days ?? 60} dni.`,
      variant: rematched ? 'success' : 'info',
    });
  };

  return <Command execute={execute} />;
};

export default defineFrontComponent({
  universalIdentifier: ID.fcBankRematch,
  name: 'bank-rematch',
  description: 'Ponawia automatyczne dopasowanie nieprzypisanych przelewów do faktur.',
  isHeadless: true,
  component: BankRematch,
});
