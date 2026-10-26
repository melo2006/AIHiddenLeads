import { HOMEPAGE_SERVICE_AREAS, HOMEPAGE_STARTER } from '../../supabase/functions/_shared/homepage-services';

type SalesCopy = { badge: string; headline: string; headlineAccent: string; sub: string; start: string; trust: string; title: string; description: string; technology: string; demo: string; addons: string; scope: string; services: ReadonlyArray<{ id: string; name: string; scope: string; benefits: readonly string[] }> };

const english: SalesCopy = {
  badge: '2026 AI tools. Practical business advantages.',
  headline: 'AI Hidden Leads',
  headlineAccent: 'Beyond voicemail.',
  sub: 'Conversational reception, fresh B2B prospects, location-aware search, reputation and social content for small and mid-sized businesses.',
  start: `Start with voice + chat + ${HOMEPAGE_STARTER.leadsPerMonth} B2B prospects/month for $${HOMEPAGE_STARTER.monthlyUsd}/mo.`,
  trust: 'Free website simulation · Your name + website · No credit card',
  title: 'Five ways to compete. One place to start.',
  description: 'Start by catching inquiries and finding fresh prospects. Add search, reputation and social support as your business grows.',
  technology: 'Hear the difference: live conversational voice, your website knowledge and a shared chat experience—not a prerecorded voicemail greeting.',
  demo: 'Try it on my website — free',
  addons: 'Explore add-on growth packages',
  scope: 'Browser voice is included. Phone routing and carrier usage are separate. Search, reputation and social work require agreed scope and connected accounts; results are not guaranteed.',
  services: HOMEPAGE_SERVICE_AREAS,
};

const spanish: SalesCopy = {
  badge: 'Herramientas de IA de 2026. Ventajas prácticas.', headline: 'AI Hidden Leads', headlineAccent: 'Más que un buzón de voz.',
  sub: 'Recepción conversacional, prospectos B2B, búsqueda local, reputación y contenido social para pequeñas y medianas empresas.',
  start: `Empieza con voz + chat + ${HOMEPAGE_STARTER.leadsPerMonth} prospectos B2B/mes por US$${HOMEPAGE_STARTER.monthlyUsd}/mes.`, trust: 'Simulación web gratis · Tu nombre + sitio web · Sin tarjeta',
  title: 'Cinco formas de competir. Un punto de partida.', description: 'Empieza captando consultas y nuevos prospectos. Añade búsqueda, reputación y redes sociales a medida que creces.',
  technology: 'Escucha la diferencia: voz conversacional en vivo, conocimiento de tu sitio y chat integrado; no un saludo de buzón pregrabado.',
  demo: 'Probar en mi sitio — gratis', addons: 'Ver paquetes adicionales',
  scope: 'La voz web está incluida. Telefonía y consumo se cobran aparte. Búsqueda, reputación y redes requieren alcance acordado y cuentas conectadas; sin resultados garantizados.',
  services: [
    {id:'voice', name:'Recepción conversacional con IA',scope:'Empieza con Essentials',benefits:['Una conversación, no un buzón: responde preguntas y recoge el motivo de la consulta mientras tu equipo está ocupado.','Conocimiento compartido para voz y chat; calendarios y atención humana se conectan durante la configuración.']},
    {id:'leads',name:'Nuevos prospectos B2B',scope:'50/mes en Essentials',benefits:['Selecciona empresas por industria y región y revisa la evidencia de contacto disponible; no una lista genérica comprada.','Entregas semanales incluidas; contacta tú o añade seguimiento autorizado y reactivación de tu base.']},
    {id:'search',name:'Google Maps y búsqueda con IA',scope:'Paquetes opcionales',benefits:['Mide 25 ubicaciones, no solo tu oficina: descubre cómo cambia tu visibilidad entre barrios.','Prioriza categorías del perfil, mejoras de búsqueda local y datos estructurados a partir del análisis.']},
    {id:'reputation',name:'Reseñas y reputación',scope:'Alcance opcional acordado',benefits:['Solicita opiniones honestas y supervisa reseñas nuevas, sin incentivos ni selección de clientes satisfechos.','Borradores de respuesta con IA ahorran tiempo; tu equipo aprueba las respuestas sensibles.']},
    {id:'social',name:'Contenido y creación social',scope:'Full Service / cotización',benefits:['Planifica publicaciones, anuncios y videos con IA para tu empresa, con aprobación antes de publicar.','Acuerda programación diaria o semanal y respuestas permitidas tras conectar las cuentas; no mensajes autónomos sin configurar.']},
  ],
};

const portuguese: SalesCopy = {
  badge:'Ferramentas de IA de 2026. Vantagens práticas.',headline:'AI Hidden Leads',headlineAccent:'Além da caixa postal.',
  sub:'Recepção por IA, novos prospects B2B, busca local, reputação e conteúdo social para pequenas e médias empresas.',
  start:`Comece com voz + chat + ${HOMEPAGE_STARTER.leadsPerMonth} prospects B2B/mês por US$${HOMEPAGE_STARTER.monthlyUsd}/mês.`,trust:'Simulação gratuita · Seu nome + site · Sem cartão',
  title:'Cinco formas de competir. Um ponto de partida.',description:'Comece atendendo consultas e encontrando novos prospects. Adicione busca, reputação e redes sociais conforme sua empresa cresce.',
  technology:'Ouça a diferença: voz conversacional ao vivo, conhecimento do seu site e chat integrado — não uma saudação gravada de caixa postal.',
  demo:'Testar no meu site — grátis',addons:'Ver pacotes adicionais',
  scope:'Voz no navegador incluída. Telefonia e uso da operadora são separados. Busca, reputação e redes exigem escopo acordado e contas conectadas; sem garantia de resultados.',
  services:[
    {id:'voice',name:'Recepção conversacional com IA',scope:'Comece com Essentials',benefits:['Uma conversa, não uma caixa postal: responde perguntas e registra o motivo do contato enquanto sua equipe está ocupada.','Uma base de conhecimento para voz e chat; calendários e atendimento humano são conectados na configuração.']},
    {id:'leads',name:'Novos prospects B2B',scope:'50/mês no Essentials',benefits:['Encontre empresas por setor e região e revise os dados de contato disponíveis — não uma lista genérica comprada.','Entregas semanais incluídas; faça o contato ou adicione campanhas autorizadas e reativação da sua base.']},
    {id:'search',name:'Google Maps e busca com IA',scope:'Pacotes opcionais',benefits:['Meça 25 locais, não só seu escritório: veja como a visibilidade muda entre bairros.','Use o diagnóstico para priorizar categorias, melhorias de busca local e dados estruturados do site.']},
    {id:'reputation',name:'Avaliações e reputação',scope:'Escopo opcional acordado',benefits:['Peça avaliações honestas e monitore novas respostas, sem incentivos nem seleção de clientes satisfeitos.','Rascunhos com IA economizam tempo; sua equipe aprova respostas sensíveis antes da publicação.']},
    {id:'social',name:'Conteúdo e criação social',scope:'Full Service / orçamento',benefits:['Planeje posts, anúncios e conceitos de vídeo com IA para sua empresa, com aprovação antes de publicar.','Combine agenda diária ou semanal e respostas permitidas após conectar as contas — sem DMs autônomas não configuradas.']},
  ],
};

export function homepageSalesCopy(language: string) {
  return language.startsWith('pt') ? portuguese : language.startsWith('es') ? spanish : english;
}