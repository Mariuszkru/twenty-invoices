import type { InvoiceStore } from 'src/lib/sync/store';

export type Buyer = { email: string | null; name: string | null };

// Warianty podziału „Imię Nazwisko” oraz „Nazwisko Imię”; nazwisko może być wieloczłonowe po spacji.
export const nameVariants = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const variants = [
    { firstName: parts[0], lastName: parts.slice(1).join(' ') },
    { firstName: parts[parts.length - 1], lastName: parts.slice(0, -1).join(' ') },
  ];
  return variants.filter(
    (v, i) => variants.findIndex((w) => w.firstName === v.firstName && w.lastName === v.lastName) === i,
  );
};

const single = (ids: string[]) => {
  const unique = [...new Set(ids)];
  return unique.length === 1 ? unique[0] : null;
};

// Nabywca B2C → osoba w CRM: najpierw e-mail, potem imię i nazwisko. Wynik tylko przy jednoznacznym trafieniu.
export const findBuyerPersonId = async (
  store: Pick<InvoiceStore, 'findPersonIdsByEmail' | 'findPersonIdsByName'>,
  buyer: Buyer,
): Promise<string | null> => {
  const email = buyer.email?.trim();
  if (email) {
    const byEmail = single(await store.findPersonIdsByEmail(email));
    if (byEmail) return byEmail;
  }
  const variants = buyer.name ? nameVariants(buyer.name) : [];
  if (variants.length === 0) return null;
  return single(await store.findPersonIdsByName(variants));
};
