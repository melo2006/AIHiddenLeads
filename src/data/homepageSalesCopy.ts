import { HOMEPAGE_SERVICE_AREAS, HOMEPAGE_STARTER } from '../../supabase/functions/_shared/homepage-services';

type SalesCopy = { badge: string; headline: string; headlineAccent: string; sub: string; start: string; trust: string; title: string; description: string; technology: string; demo: string; addons: string; scope: string; services: ReadonlyArray<{ id: string; name: string; scope: string; benefits: readonly string[] }> };

const english: SalesCopy = {
  badge: 'More conversations. Fresh prospects. Less busywork.',
  headline: 'AI Hidden Leads',
  headlineAccent: 'Turn conversations into opportunities.',
  sub: 'Help visitors get answers before they leave. Natural, human-like AI voice, website chat and optional live video capture inquiries while your team focuses on customers and closing deals.',
  start: `Start with voice + chat + ${HOMEPAGE_STARTER.leadsPerMonth} B2B prospects/month for $${HOMEPAGE_STARTER.monthlyUsd}/mo.`,
  trust: 'Start with your website URL · Free live simulation · No credit card · Your site stays unchanged',
  title: 'Capture inquiries. Find prospects. Build your pipeline.',
  description: 'We are here to help your business grow: engage website visitors, discover fresh B2B prospects and reduce repetitive work. Add visibility, reputation and approved social content as your needs grow.',
  technology: 'Try your own AI website receptionist: ask questions out loud, interrupt naturally or type in chat. It learns from readable public pages, with optional live video—not a prerecorded greeting.',
  demo: 'Try my website — free live demo',
  addons: 'Explore add-on growth packages',
  scope: 'Website voice is included; live video is optional. Customer phone answering and calendar connections require a separate rollout and verification. Search, reputation and social work require agreed scope and authorized accounts. Prospects are not opt-in buyers; sales and ranking results are not guaranteed.',
  services: HOMEPAGE_SERVICE_AREAS,
};

const spanish: SalesCopy = {
  badge: 'Más conversaciones. Nuevos prospectos. Menos tareas.', headline: 'AI Hidden Leads', headlineAccent: 'Convierte conversaciones en oportunidades.',
  sub: 'Ayuda a los visitantes antes de que se vayan. Voz natural con IA, chat web y video opcional captan consultas mientras tu equipo se enfoca en clientes y ventas.',
  start: `Empieza con voz + chat + ${HOMEPAGE_STARTER.leadsPerMonth} prospectos B2B/mes por US$${HOMEPAGE_STARTER.monthlyUsd}/mes.`, trust: 'Simulación web gratis · Tu nombre + sitio web · Sin tarjeta',
  title: 'Cinco formas de competir. Un punto de partida.', description: 'Empieza captando consultas y nuevos prospectos. Añade búsqueda, reputación y redes sociales a medida que creces.',
  technology: 'Escucha la diferencia: voz conversacional en vivo, conocimiento de tu sitio y chat integrado; no un saludo de buzón pregrabado.',
  demo: 'Probar en mi sitio — gratis', addons: 'Ver paquetes adicionales',
  scope: 'La voz web está incluida. Telefonía y consumo se cobran aparte. Búsqueda, reputación y redes requieren alcance acordado y cuentas conectadas; sin resultados garantizados.',
  services: [
    {id:'voice', name:'Recepción conversacional con IA',scope:'Empieza con Premium',benefits:['Una conversación, no un buzón: responde preguntas y recoge el motivo de la consulta mientras tu equipo está ocupado.','Conocimiento compartido para voz y chat; calendarios y atención humana se conectan durante la configuración.']},
    {id:'leads',name:'Nuevos prospectos B2B',scope:'50/mes en Premium',benefits:['Selecciona empresas por industria y región y revisa la evidencia de contacto disponible; no una lista genérica comprada.','Entregas semanales incluidas; contacta tú o añade seguimiento autorizado y reactivación de tu base.']},
    {id:'search',name:'Google Maps y búsqueda con IA',scope:'Paquetes opcionales',benefits:['Mide 25 ubicaciones, no solo tu oficina: descubre cómo cambia tu visibilidad entre barrios.','Prioriza categorías del perfil, mejoras de búsqueda local y datos estructurados a partir del análisis.']},
    {id:'reputation',name:'Reseñas y reputación',scope:'Alcance opcional acordado',benefits:['Solicita opiniones honestas y supervisa reseñas nuevas, sin incentivos ni selección de clientes satisfechos.','Borradores de respuesta con IA ahorran tiempo; tu equipo aprueba las respuestas sensibles.']},
    {id:'social',name:'Contenido y creación social',scope:'Platinum / cotización',benefits:['Planifica publicaciones, anuncios y videos con IA para tu empresa, con aprobación antes de publicar.','Acuerda programación diaria o semanal y respuestas permitidas tras conectar las cuentas; no mensajes autónomos sin configurar.']},
  ],
};

const portuguese: SalesCopy = {
  badge:'Mais conversas. Novos prospects. Menos tarefas.',headline:'AI Hidden Leads',headlineAccent:'Transforme conversas em oportunidades.',
  sub:'Ajude visitantes antes que saiam. Voz natural com IA, chat no site e vídeo opcional captam consultas enquanto sua equipe se concentra nos clientes e nas vendas.',
  start:`Comece com voz + chat + ${HOMEPAGE_STARTER.leadsPerMonth} prospects B2B/mês por US$${HOMEPAGE_STARTER.monthlyUsd}/mês.`,trust:'Simulação gratuita · Seu nome + site · Sem cartão',
  title:'Cinco formas de competir. Um ponto de partida.',description:'Comece atendendo consultas e encontrando novos prospects. Adicione busca, reputação e redes sociais conforme sua empresa cresce.',
  technology:'Ouça a diferença: voz conversacional ao vivo, conhecimento do seu site e chat integrado — não uma saudação gravada de caixa postal.',
  demo:'Testar no meu site — grátis',addons:'Ver pacotes adicionais',
  scope:'Voz no navegador incluída. Telefonia e uso da operadora são separados. Busca, reputação e redes exigem escopo acordado e contas conectadas; sem garantia de resultados.',
  services:[
    {id:'voice',name:'Recepção conversacional com IA',scope:'Comece com Premium',benefits:['Uma conversa, não uma caixa postal: responde perguntas e registra o motivo do contato enquanto sua equipe está ocupada.','Uma base de conhecimento para voz e chat; calendários e atendimento humano são conectados na configuração.']},
    {id:'leads',name:'Novos prospects B2B',scope:'50/mês no Premium',benefits:['Encontre empresas por setor e região e revise os dados de contato disponíveis — não uma lista genérica comprada.','Entregas semanais incluídas; faça o contato ou adicione campanhas autorizadas e reativação da sua base.']},
    {id:'search',name:'Google Maps e busca com IA',scope:'Pacotes opcionais',benefits:['Meça 25 locais, não só seu escritório: veja como a visibilidade muda entre bairros.','Use o diagnóstico para priorizar categorias, melhorias de busca local e dados estruturados do site.']},
    {id:'reputation',name:'Avaliações e reputação',scope:'Escopo opcional acordado',benefits:['Peça avaliações honestas e monitore novas respostas, sem incentivos nem seleção de clientes satisfeitos.','Rascunhos com IA economizam tempo; sua equipe aprova respostas sensíveis antes da publicação.']},
    {id:'social',name:'Conteúdo e criação social',scope:'Platinum / orçamento',benefits:['Planeje posts, anúncios e conceitos de vídeo com IA para sua empresa, com aprovação antes de publicar.','Combine agenda diária ou semanal e respostas permitidas após conectar as contas — sem DMs autônomas não configuradas.']},
  ],
};

export function homepageSalesCopy(language: string) {
  return language.startsWith('pt') ? portuguese : language.startsWith('es') ? spanish : english;
}