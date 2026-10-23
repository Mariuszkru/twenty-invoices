import { AggregateOperations, defineView, getFieldUniversalIdentifier, ViewType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { PROJECT_STATUS } from 'src/constants/options';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Tablica projektów po statusie; nagłówek kolumny sumuje marżę.
export default defineView({
  universalIdentifier: ID.viewProjectsKanban,
  name: 'Projekty – tablica',
  objectUniversalIdentifier: ID.projectObject,
  type: ViewType.KANBAN,
  icon: 'IconLayoutKanban',
  position: 1,
  mainGroupByFieldMetadataUniversalIdentifier: ID.projStatus,
  kanbanAggregateOperation: AggregateOperations.SUM,
  kanbanAggregateOperationFieldMetadataUniversalIdentifier: ID.projMargin,
  fields: [
    {
      universalIdentifier: '28a08cbe-430a-497e-85d3-79303a0933bc',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.projectObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
    },
    { universalIdentifier: '236a05e8-45e2-4450-94f9-8055a7ad3f9a', fieldMetadataUniversalIdentifier: ID.projClientName, position: 1, isVisible: true },
    { universalIdentifier: '32295883-37bf-4d60-a3cf-1fbac598c37f', fieldMetadataUniversalIdentifier: ID.projStatus, position: 2, isVisible: true },
    { universalIdentifier: '96e02c2e-6560-41ce-90c2-1248a509585b', fieldMetadataUniversalIdentifier: ID.projMargin, position: 3, isVisible: true },
    { universalIdentifier: '19d40725-9d4b-48a2-b1c6-5acfaf330ab6', fieldMetadataUniversalIdentifier: ID.projMarginPercent, position: 4, isVisible: true },
  ],
  groups: [
    { universalIdentifier: '06d1d135-a859-4f05-b05e-344caab1e75d', fieldValue: PROJECT_STATUS.PLANNED, position: 0, isVisible: true },
    { universalIdentifier: 'd84b81be-adc7-438b-8fa9-c4bce3386e59', fieldValue: PROJECT_STATUS.IN_PROGRESS, position: 1, isVisible: true },
    { universalIdentifier: '75751e05-5c7a-4bdb-80f9-a8c9e58bdb5a', fieldValue: PROJECT_STATUS.ON_HOLD, position: 2, isVisible: true },
    { universalIdentifier: 'f6521314-9bb6-4f3f-833f-8c34167592c9', fieldValue: PROJECT_STATUS.DONE, position: 3, isVisible: true },
    { universalIdentifier: '4e16f007-314b-4e96-96a2-f4645c620980', fieldValue: PROJECT_STATUS.SETTLED, position: 4, isVisible: true },
    { universalIdentifier: '2ce77e09-c686-4f9a-969f-b5955d8b6ece', fieldValue: PROJECT_STATUS.CANCELLED, position: 5, isVisible: true },
  ],
});
