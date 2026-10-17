import { defineApplicationRole, SystemPermissionFlag } from 'twenty-sdk/define';

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
  // UPLOAD_FILE: zapis oryginalnego XML faktury do pola FILES (MetadataApiClient.uploadFile)
  // APPLICATIONS: zapis sesji KSeF do własnej zmiennej KSEF_SESSION (updateOneApplicationVariable)
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE, SystemPermissionFlag.APPLICATIONS],
});
