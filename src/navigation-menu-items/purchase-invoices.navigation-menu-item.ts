import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navPurchases,
  name: 'Faktury zakupu',
  icon: 'IconFileDownload',
  position: 1,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewPurchases,
  folderUniversalIdentifier: ID.navFolder,
});
