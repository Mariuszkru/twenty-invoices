import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navFolder,
  name: 'Faktury KSeF',
  icon: 'IconFileInvoice',
  position: 0,
  type: NavigationMenuItemType.FOLDER,
});
