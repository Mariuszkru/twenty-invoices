import { defineApplicationRole, SystemPermissionFlag } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import {
  APP_DISPLAY_NAME,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Synchronizacja tworzy faktury i pozycje, czyta i dopina firmy (Company) oraz zapisuje XML do pola plikowego.
export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `${APP_DISPLAY_NAME} default function role`,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  // wyjątek: panel "Rozlicz przelew" zastępuje rozliczenia transakcji (destroyPaymentAllocations).
  // Bez tego zmiana rozliczenia automatycznego kończy się błędem "does not have permission".
  objectPermissions: [
    {
      universalIdentifier: ID.rolePermAllocDestroy,
      objectUniversalIdentifier: ID.allocObject,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: true,
    },
  ],
  // UPLOAD_FILE: zapis oryginalnego XML faktury do pola FILES (MetadataApiClient.uploadFile)
  // WORKSPACE_APPS: zapis sesji KSeF do własnej zmiennej KSEF_SESSION (updateOneApplicationVariable)
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE, SystemPermissionFlag.WORKSPACE_APPS],
});
