import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navSales,
  name: 'Faktury sprzedaży',
  icon: 'IconFileUpload',
  position: 0,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewSales,
  folderUniversalIdentifier: ID.navFolder,
});
