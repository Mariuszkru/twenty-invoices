import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Projekty poza folderem "Faktury KSeF"; tablica kanban jest drugim widokiem tego obiektu.
export default defineNavigationMenuItem({
  universalIdentifier: ID.navProjects,
  name: 'Projekty',
  icon: 'IconBriefcase',
  position: 1,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: ID.viewProjects,
});
