import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navCostLines,
  name: 'Koszty do przypisania',
  icon: 'IconReceipt2',
  position: 3,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewCostLines,
  folderUniversalIdentifier: ID.navFolder,
});
