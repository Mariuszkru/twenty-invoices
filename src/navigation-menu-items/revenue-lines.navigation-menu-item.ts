import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navRevenueLines,
  name: 'Pozycje sprzedaży',
  icon: 'IconTrendingUp',
  position: 2,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewRevenueLines,
  folderUniversalIdentifier: ID.navFolder,
});
