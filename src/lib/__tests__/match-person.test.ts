import { describe, expect, it } from 'vitest';

import { createMemoryStore } from 'src/lib/__tests__/memory-store';
import { findBuyerPersonId, nameVariants } from 'src/lib/manual/match-person';

describe('findBuyerPersonId', () => {
  const { store } = createMemoryStore();

  it('dopasowuje po e-mailu bez rozróżniania wielkości liter', async () => {
    expect(await findBuyerPersonId(store, { email: ' JAN@example.com ', name: 'Ktoś Inny' })).toBe('person-jan');
  });

  it('bez trafienia po e-mailu dopasowuje po imieniu i nazwisku', async () => {
    expect(await findBuyerPersonId(store, { email: 'brak@example.com', name: 'jan kowalski' })).toBe('person-jan');
  });

  it('akceptuje kolejność „Nazwisko Imię”', async () => {
    expect(await findBuyerPersonId(store, { email: null, name: 'Kowalski Jan' })).toBe('person-jan');
  });

  it('nie wiąże, gdy imię i nazwisko pasuje do kilku osób', async () => {
    expect(await findBuyerPersonId(store, { email: null, name: 'Anna Nowak' })).toBeNull();
  });

  it('e-mail rozstrzyga, gdy imię i nazwisko jest niejednoznaczne', async () => {
    expect(await findBuyerPersonId(store, { email: 'anna@example.com', name: 'Anna Nowak' })).toBe('person-anna-2');
  });

  it('nie wiąże, gdy osoby nie ma w CRM', async () => {
    expect(await findBuyerPersonId(store, { email: null, name: 'Piotr Wiśniewski' })).toBeNull();
    expect(await findBuyerPersonId(store, { email: null, name: 'Jan' })).toBeNull();
    expect(await findBuyerPersonId(store, { email: null, name: null })).toBeNull();
  });
});

describe('nameVariants', () => {
  it('zwraca obie kolejności dla nazwiska wieloczłonowego', () => {
    expect(nameVariants('Maria Skłodowska Curie')).toEqual([
      { firstName: 'Maria', lastName: 'Skłodowska Curie' },
      { firstName: 'Curie', lastName: 'Maria Skłodowska' },
    ]);
  });
});
