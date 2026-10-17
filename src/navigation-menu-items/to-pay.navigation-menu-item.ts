import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navToPay,
  name: 'Do zapłaty',
  icon: 'IconCalendarDue',
  position: 4,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewToPay,
  folderUniversalIdentifier: ID.navFolder,
});
