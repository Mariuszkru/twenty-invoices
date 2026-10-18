import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineNavigationMenuItem({
  universalIdentifier: ID.navBankUnmatched,
  name: 'Nieprzypisane transakcje',
  icon: 'IconLinkOff',
  position: 6,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewBankUnmatched,
  folderUniversalIdentifier: ID.navFolder,
});
