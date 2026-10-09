// Pays soumis à Solvabilité 2 (directive 2009/138/CE) : les 27 États membres de l'UE et l'EEE (Islande, Liechtenstein, Norvège).
// Pays d'une compagnie = pays de son siège (adresse légale du LEI), lu dans le registre public GLEIF puis modifiable.

export const SII_COUNTRIES: [string, string][] = [
  ["DE", "Allemagne"], ["AT", "Autriche"], ["BE", "Belgique"], ["BG", "Bulgarie"], ["CY", "Chypre"], ["HR", "Croatie"],
  ["DK", "Danemark"], ["ES", "Espagne"], ["EE", "Estonie"], ["FI", "Finlande"], ["FR", "France"], ["GR", "Grèce"],
  ["HU", "Hongrie"], ["IE", "Irlande"], ["IS", "Islande"], ["IT", "Italie"], ["LV", "Lettonie"], ["LI", "Liechtenstein"],
  ["LT", "Lituanie"], ["LU", "Luxembourg"], ["MT", "Malte"], ["NO", "Norvège"], ["NL", "Pays-Bas"], ["PL", "Pologne"],
  ["PT", "Portugal"], ["CZ", "République tchèque"], ["RO", "Roumanie"], ["SK", "Slovaquie"], ["SI", "Slovénie"], ["SE", "Suède"],
];

const NAMES = new Map(SII_COUNTRIES);

export const isSiiCountry = (code: string) => NAMES.has(code);

/** Nom français du pays ; code brut si le pays n'est pas soumis à Solvabilité 2. */
export const countryName = (code: string | null | undefined) => (code ? NAMES.get(code) ?? code : "—");

/** Pays présents dans une liste d'entités, triés par nom (options des filtres). */
export function countriesIn(entities: { country: string }[]): [string, string][] {
  return [...new Set(entities.map((e) => e.country))].map((c) => [c, countryName(c)] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], "fr"));
}

/** Pays du siège et dénomination d'après le registre GLEIF ; null si le LEI est inconnu ou le registre injoignable. */
export async function lookupLei(lei: string): Promise<{ country: string; name: string } | null> {
  if (!/^[0-9A-Z]{18}\d{2}$/.test(lei)) return null;
  try {
    const r = await fetch(`https://api.gleif.org/api/v1/lei-records/${lei}`, { headers: { Accept: "application/vnd.api+json" } });
    if (!r.ok) return null;
    const ent = (await r.json())?.data?.attributes?.entity;
    const country = ent?.legalAddress?.country;
    return typeof country === "string" ? { country: country.toUpperCase(), name: ent?.legalName?.name ?? "" } : null;
  } catch {
    return null;
  }
}
