import { defineView, getFieldUniversalIdentifier, ViewSortDirection } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: ID.viewProjects,
  name: 'Projekty',
  objectUniversalIdentifier: ID.projectObject,
  icon: 'IconBriefcase',
  position: 0,
  fields: [
    {
      universalIdentifier: 'f3a3d78f-bcc9-4e36-83d0-a249d437b2af',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.projectObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 240,
    },
    { universalIdentifier: 'a1b4b492-f5a7-49c8-b8cb-07b8b933298d', fieldMetadataUniversalIdentifier: ID.projClientName, position: 1, isVisible: true, size: 200 },
    { universalIdentifier: '1340dd2f-8827-4073-b02c-2786ff20ac85', fieldMetadataUniversalIdentifier: ID.projStatus, position: 2, isVisible: true, size: 140 },
    { universalIdentifier: '5fda120c-2b4d-41af-a8a6-f438e7e8e487', fieldMetadataUniversalIdentifier: ID.projRevenue, position: 3, isVisible: true, size: 150 },
    { universalIdentifier: 'cdd44353-69c0-48fd-b21f-fa29b05ff260', fieldMetadataUniversalIdentifier: ID.projCost, position: 4, isVisible: true, size: 150 },
    { universalIdentifier: '216b9147-807d-4e70-9c9d-6d31d19a1ea1', fieldMetadataUniversalIdentifier: ID.projMargin, position: 5, isVisible: true, size: 150 },
    { universalIdentifier: '3eb44c42-1ff8-4123-a1df-da021e527970', fieldMetadataUniversalIdentifier: ID.projMarginPercent, position: 6, isVisible: true, size: 110 },
    { universalIdentifier: '0d4ec44a-e822-4591-a0c0-7b96b0d66bd1', fieldMetadataUniversalIdentifier: ID.projIssues, position: 7, isVisible: true, size: 220 },
  ],
  sorts: [
    {
      universalIdentifier: 'e6a4b1c8-b867-4395-b349-5a62f9b06024',
      fieldMetadataUniversalIdentifier: ID.projStartDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
