/**
 * Brazilian example businesses for the /demo/br page (Publish #71).
 *
 * Six real Brazilian small businesses — one per type — researched and
 * verified live on 2026-11-15 (see ~/workspace/brazil-demo-targets-2026-11-15.md):
 * real pt-BR content for the demo scan to build from, and no AI/live-chat
 * widget of their own (three carry only a WhatsApp click-to-chat button).
 *
 * The cards follow the realtor/B2B one-click pattern: tapping one opens
 * the demo through the sample flow (/demo/br?sample=1&url=…&callerName=…),
 * which /demo-site serves in Portuguese because the /demo/br route forces
 * the pt-BR locale.
 *
 * `leadId` is the PINNED leads row for the example once one has been
 * scanned in advance — the same arrangement as the realtor and B2B
 * examples (the card then opens the ready demo with no scan wait, and
 * pinnedExampleSeed seeds the business name from the first frame). Until
 * a row exists, the field stays undefined and the card opens the demo
 * through a fresh scan of the same URL — never invent an id here: a
 * leadId that does not resolve makes /demo-site wait on a missing lead
 * instead of scanning.
 */
export interface BrazilExample {
  /** Stable slug for the example. */
  slug: string;
  business: string;
  /** i18n key under tryDemo.brTypes for the business-type label. */
  typeKey: "realEstate" | "dental" | "law" | "gym" | "languageSchool" | "autoRepair";
  /** City + state as shown on the card. */
  city: string;
  /** Bare domain (no www) — the durable key for the example. */
  domain: string;
  /** The exact example URL the card opens. */
  url: string;
  /** The pinned leads row id, once the site has been scanned in advance. */
  leadId?: string;
}

export const BRAZIL_EXAMPLES: BrazilExample[] = [
  {
    slug: "metrica-imoveis",
    business: "Métrica Negócios Imobiliários",
    typeKey: "realEstate",
    city: "Campinas, SP",
    domain: "metricaimoveis.com.br",
    url: "https://www.metricaimoveis.com.br",
  },
  {
    slug: "rabelo-sena",
    business: "Rabelo & Sena Ortodontia",
    typeKey: "dental",
    city: "Curitiba, PR",
    domain: "rabeloesenaortodontia.com.br",
    url: "https://rabeloesenaortodontia.com.br/",
  },
  {
    slug: "lgomes-advogados",
    business: "LGomes Advogados",
    typeKey: "law",
    city: "Belo Horizonte, MG",
    domain: "lgomesadvogados.com",
    url: "http://www.lgomesadvogados.com/",
  },
  {
    slug: "ufit-academia",
    business: "UFit Academia",
    typeKey: "gym",
    city: "Florianópolis, SC",
    domain: "ufitacademia.com.br",
    url: "https://ufitacademia.com.br/unidade/ufit-corrego-grande/",
  },
  {
    slug: "acele-idiomas",
    business: "Acele Escola de Idiomas",
    typeKey: "languageSchool",
    city: "Porto Alegre, RS",
    domain: "acele.com.br",
    url: "https://www.acele.com.br/",
  },
  {
    slug: "marrom-motors",
    business: "Marrom Motors",
    typeKey: "autoRepair",
    city: "Goiânia, GO",
    domain: "marrommotors.com.br",
    url: "https://marrommotors.com.br/",
  },
];
