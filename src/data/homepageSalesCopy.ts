import { HOMEPAGE_SERVICE_AREAS, HOMEPAGE_STARTER } from '../../supabase/functions/_shared/homepage-services';

type SalesCopy = { badge: string; headline: string; headlineAccent: string; sub: string; start: string; trust: string; title: string; description: string; technology: string; demo: string; addons: string; scope: string; services: ReadonlyArray<{ id: string; name: string; scope: string; benefits: readonly string[] }> };

const english: SalesCopy = {
  badge: 'Phone inquiries. Website visitors. More lead opportunities.',
  headline: 'AI Hidden Leads',
  headlineAccent: 'Don’t let the next lead slip away.',
  sub: 'Calls going to voicemail? Website visitors leaving with unanswered questions? Turn more inquiries into opportunities with natural, two-way AI voice, a website chat widget and optional live video. Answer website visitors today, and forward your existing business number so calls reach Aspen instead of voicemail.',
  start: `Start with voice + chat + ${HOMEPAGE_STARTER.leadsPerMonth} B2B prospects/month for $${HOMEPAGE_STARTER.monthlyUsd}/mo.`,
  trust: 'Start with your website URL · Free live simulation · No credit card · Your site stays unchanged',
  title: 'Capture inquiries. Find prospects. Build your pipeline.',
  description: 'More calls or more website traffic? Start where your customers reach you. Capture website inquiries today, prepare for upcoming phone coverage and find fresh B2B prospects—while your staff focus on customers, not repetitive questions.',
  technology: 'Try your own AI website receptionist: ask about services, parts or appointment requests by voice or chat, with optional live video. It answers from readable public pages; production knowledge can include reviewed FAQs, vendor information and manuals. Your original website stays unchanged, and preparation time varies.',
  demo: 'Try my website — free live demo',
  addons: 'Explore add-on growth packages',
  scope: 'Available now: website voice/chat widgets and optional live video. Upcoming phone service: forward your existing number—not port it—for missed-call, voicemail or after-hours coverage, with manager transfers and a private AI summary after setup and testing. Customer calendars, reminders and callbacks need separate authorization and verification; SMS is coming soon. No guaranteed callback speed, demo preparation time, savings, sales or rankings.',
  services: HOMEPAGE_SERVICE_AREAS,
};

const spanish: SalesCopy = {
  badge: 'Más conversaciones. Nuevos prospectos. Menos tareas.', headline: 'AI Hidden Leads', headlineAccent: 'Convierte conversaciones en oportunidades.',
  sub: '¿Llamadas al buzón de voz? ¿Visitantes web con preguntas sin respuesta? Capta consultas con voz natural, chat web y video opcional mientras tu equipo atiende a sus clientes. Widgets disponibles ahora; atención telefónica y desvío de llamadas próximamente.',
  start: `Empieza con voz + chat + ${HOMEPAGE_STARTER.leadsPerMonth} prospectos B2B/mes por US$${HOMEPAGE_STARTER.monthlyUsd}/mes.`, trust: 'Simulación web gratis · Tu nombre + sitio web · Sin tarjeta',
  title: 'Cinco formas de competir. Un punto de partida.', description: 'Empieza captando consultas y nuevos prospectos. Añade búsqueda, reputación y redes sociales a medida que creces.',
  technology: 'Escucha la diferencia: voz conversacional en vivo, conocimiento de tu sitio y chat integrado; no un saludo de buzón pregrabado.',
  demo: 'Probar en mi sitio — gratis', addons: 'Ver paquetes adicionales',
  scope: 'Widgets de voz y chat disponibles; video opcional. Próximamente: desvío de tu número existente, sin portarlo, y transferencias al responsable con resumen privado tras configuración y pruebas. Calendarios y recordatorios requieren autorización; SMS próximamente. Sin garantías de ventas, ahorro o tiempo de preparación de la demo.',
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
  sub:'Chamadas na caixa postal? Visitantes do site com dúvidas sem resposta? Capture consultas com voz natural, chat e vídeo opcional enquanto sua equipe atende clientes. Widgets disponíveis agora; atendimento telefônico e encaminhamento em breve.',
  start:`Comece com voz + chat + ${HOMEPAGE_STARTER.leadsPerMonth} prospects B2B/mês por US$${HOMEPAGE_STARTER.monthlyUsd}/mês.`,trust:'Simulação gratuita · Seu nome + site · Sem cartão',
  title:'Cinco formas de competir. Um ponto de partida.',description:'Comece atendendo consultas e encontrando novos prospects. Adicione busca, reputação e redes sociais conforme sua empresa cresce.',
  technology:'Ouça a diferença: voz conversacional ao vivo, conhecimento do seu site e chat integrado — não uma saudação gravada de caixa postal.',
  demo:'Testar no meu site — grátis',addons:'Ver pacotes adicionais',
  scope:'Widgets de voz e chat disponíveis; vídeo opcional. Em breve: encaminhamento do número existente, sem portabilidade, e transferência ao responsável com resumo privado após configuração e testes. Calendários e lembretes precisam de autorização; SMS em breve. Sem garantias de vendas, economia ou tempo de preparação da demo.',
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