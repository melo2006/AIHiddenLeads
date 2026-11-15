// Detected language of a SCANNED WEBSITE's own content (Publish #66,
// 2026-11-15). Ron's rule: when a visitor runs the demo on their own
// website and has NOT explicitly picked a language with the site switch,
// the demo runs in the language that website is published in — the nephew
// in Brazil pastes a Brazilian customer's URL and the whole demo comes up
// in Brazilian Portuguese without anyone touching the language switch.
// Priority (enforced in conversation-language.ts resolveDemoStartLocale):
// explicit site pick > detected site language > English.
//
// Brazilian Portuguese ONLY: this product ships exactly one Portuguese
// (pt-BR — wording, spelling, idioms and the curated voice set are all
// Brazilian). Portuguese text ALWAYS classifies as 'pt-BR' here, never
// 'pt-PT': a European Portuguese site still gets the Brazilian experience,
// which is the product's only Portuguese offering.
//
// Library-free heuristic by design (no new dependency in the edge bundle):
//   - distinctive characters carry heavy weight — ã/õ occur in Portuguese
//     and never in Spanish; ñ/¿/¡ occur in Spanish and never in Portuguese;
//   - high-frequency function/business words score per language;
//   - a verdict needs a minimum sample, a minimum score, and a clear
//     margin over the runner-up, otherwise null (no stamp — the demo then
//     stays on the English default, exactly as before this publish).
// Pure and deterministic so the unit tests can pin real captured site text
// (src/test/fixtures/site-*.txt) against it.

export type DetectedContentLanguage = 'en' | 'es' | 'pt-BR';

/** Bounded sample: the homepage top carries the site's voice; scanning
 *  more only slows the scan. 12k chars is several pages of visible copy. */
const SAMPLE_LIMIT = 12000;
/** Below this much text there is nothing trustworthy to classify. */
const MIN_SAMPLE_CHARS = 200;
/** A winner needs at least this much evidence... */
const MIN_WINNER_SCORE = 10;
/** ...and must beat the runner-up by this factor, so mixed-language
 *  boilerplate (an English cookie banner on a Brazilian site, a Spanish
 *  footer on an English site) never flips the verdict. */
const WINNER_MARGIN = 1.5;

/** Each distinctive-character occurrence is worth this many word hits. */
const DISTINCTIVE_CHAR_WEIGHT = 3;

const PT_WORDS = new Set([
  'não', 'você', 'vocês', 'também', 'obrigado', 'obrigada', 'então', 'isso',
  'esse', 'essa', 'seu', 'sua', 'seus', 'suas', 'pelo', 'pela', 'pelos',
  'pelas', 'são', 'estão', 'imóveis', 'imóvel', 'aluguel', 'serviços',
  'preço', 'preços', 'endereço', 'início', 'nós', 'venda', 'vendas',
  'comprar', 'alugar', 'confira', 'saiba', 'atendimento', 'contato',
  'empresa', 'empresas', 'sobre', 'mais', 'muito', 'quando', 'como',
  'para', 'com', 'uma', 'dos', 'das', 'aos', 'nas', 'nos', 'ele', 'ela',
  'eles', 'elas', 'quem', 'depois', 'entre', 'mesmo', 'até', 'aqui',
  'agora', 'nossa', 'nosso', 'nossas', 'nossos', 'melhor', 'melhores',
  'todos', 'todas', 'anos', 'dia', 'dias', 'cidade', 'brasil', 'são',
  'paulo', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'telefone', 'celular',
  'agende', 'agendar', 'orçamento', 'cliente', 'clientes', 'equipe',
  'trabalho', 'qualidade', 'experiência', 'desde', 'sobre', 'página',
  'inicial', 'direitos', 'reservados', 'privacidade', 'termos',
]);

const ES_WORDS = new Set([
  'también', 'gracias', 'usted', 'ustedes', 'nosotros', 'servicios',
  'precio', 'precios', 'dirección', 'están', 'venta', 'ventas', 'alquiler',
  'inmuebles', 'inmueble', 'teléfono', 'inicio', 'página', 'muy', 'más',
  'cuando', 'como', 'para', 'con', 'una', 'los', 'las', 'del', 'él',
  'ella', 'ellos', 'ellas', 'quien', 'después', 'entre', 'mismo', 'hasta',
  'aquí', 'ahora', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'mejor',
  'mejores', 'todos', 'todas', 'años', 'día', 'días', 'ciudad', 'desde',
  'sobre', 'contacto', 'empresa', 'empresas', 'clientes', 'cliente',
  'equipo', 'trabajo', 'calidad', 'experiencia', 'enero', 'febrero',
  'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre', 'lunes', 'martes', 'miércoles',
  'jueves', 'viernes', 'derechos', 'reservados', 'privacidad', 'términos',
  'comprar', 'alquilar', 'agendar', 'presupuesto', 'atención',
]);

const EN_WORDS = new Set([
  'the', 'and', 'your', 'you', 'with', 'for', 'our', 'are', 'this', 'that',
  'from', 'have', 'will', 'home', 'homes', 'sale', 'rent', 'real', 'estate',
  'about', 'contact', 'services', 'more', 'all', 'new', 'view', 'get',
  'free', 'call', 'today', 'welcome', 'we', 'us', 'business', 'team',
  'years', 'experience', 'quality', 'work', 'customers', 'clients', 'best',
  'top', 'find', 'search', 'browse', 'listings', 'properties', 'property',
  'buy', 'sell', 'rentals', 'neighborhood', 'schedule', 'appointment',
  'phone', 'email', 'address', 'hours', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'rights', 'reserved', 'privacy', 'terms',
]);

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** Classify the language of scanned website text. Returns 'pt-BR' for ANY
 *  Portuguese (Brazilian is the product's only Portuguese), 'es', 'en', or
 *  null when the sample is too thin or too mixed to trust. */
export function detectContentLanguage(rawText: unknown): DetectedContentLanguage | null {
  if (typeof rawText !== 'string') return null;
  const sample = rawText.slice(0, SAMPLE_LIMIT);
  if (sample.trim().length < MIN_SAMPLE_CHARS) return null;
  const lower = sample.toLowerCase();

  let pt = countMatches(lower, /[ãõ]/g) * DISTINCTIVE_CHAR_WEIGHT;
  let es = countMatches(lower, /[ñ¿¡]/g) * DISTINCTIVE_CHAR_WEIGHT;
  let en = 0;

  const words = lower.match(/[a-zà-ÿ']+/g) || [];
  for (const word of words) {
    if (PT_WORDS.has(word)) pt += 1;
    if (ES_WORDS.has(word)) es += 1;
    if (EN_WORDS.has(word)) en += 1;
  }

  const ranked: Array<[DetectedContentLanguage, number]> = [
    ['pt-BR', pt],
    ['es', es],
    ['en', en],
  ].sort((a, b) => b[1] - a[1]);
  const [winner, winnerScore] = ranked[0];
  const runnerUpScore = ranked[1][1];
  if (winnerScore < MIN_WINNER_SCORE) return null;
  if (winnerScore < runnerUpScore * WINNER_MARGIN) return null;
  return winner;
}
