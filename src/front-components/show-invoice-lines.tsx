import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, Command, navigate, useSelectedRecordIds } from 'twenty-sdk/front-component';

import { ID } from 'src/constants/ids';

// Bezgłowe polecenie: otwiera listę pozycji faktur z filtrem na zaznaczone faktury
// (filtr z adresu URL: filter[<pole relacji>][IS]=<id faktur>).
const ShowInvoiceLines = () => {
  const selectedIds = useSelectedRecordIds();

  const execute = async () => {
    if (selectedIds.length === 0) {
      throw new Error('Zaznacz fakturę, aby zobaczyć jej pozycje.');
    }
    await navigate(
      AppPath.RecordIndexPage,
      { objectNamePlural: 'ksefInvoiceLines' },
      { filter: { invoice: { IS: selectedIds } } },
    );
  };

  return <Command execute={execute} />;
};

export default defineFrontComponent({
  universalIdentifier: ID.fcShowInvoiceLines,
  name: 'show-invoice-lines',
  description: 'Przechodzi do pozycji faktur z filtrem na zaznaczone faktury.',
  isHeadless: true,
  component: ShowInvoiceLines,
});
