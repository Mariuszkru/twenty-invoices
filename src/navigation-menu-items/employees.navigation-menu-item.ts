import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navEmployees,
  name: 'Pracownicy',
  icon: 'IconUsers',
  position: 7,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewEmployees,
  folderUniversalIdentifier: ID.navFolder,
});
