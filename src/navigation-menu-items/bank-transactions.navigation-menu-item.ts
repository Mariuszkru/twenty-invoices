import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navBankTx,
  name: 'Transakcje bankowe',
  icon: 'IconBuildingBank',
  position: 5,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewBankTx,
  folderUniversalIdentifier: ID.navFolder,
});
