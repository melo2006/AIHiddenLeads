import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import { AudioLines, HeartHandshake, LifeBuoy, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";
import aspenHero from "@/assets/aspen-hero.jpg";

// Supporting points folded in from the former WhyUsSection (PR: slim homepage).
// The "put a face to the conversation" point was dropped — this whole section
// already makes it. Copy follows the section's inline EN/PT/ES style.
const POINTS = {
  en: [
    { icon: AudioLines, title: "Natural neural voices", text: "Live speech-to-speech AI with fast, natural turn-taking — not robotic text-to-speech or a phone menu." },
    { icon: MessagesSquare, title: "Real two-way conversation", text: "Callers can interrupt and change topics. Aspen listens, adapts and answers from your business knowledge." },
    { icon: HeartHandshake, title: "Built to help you grow", text: "Low entry pricing with 50 B2B prospects a month included, while routine questions are handled for you." },
    { icon: LifeBuoy, title: "Real people supporting you", text: "Our support team is available by phone, live chat and email at info@aihiddenleads.com." },
  ],
  pt: [
    { icon: AudioLines, title: "Vozes neurais naturais", text: "IA de voz ao vivo, com respostas rápidas e naturais — nada de menus telefónicos robóticos." },
    { icon: MessagesSquare, title: "Conversa real nos dois sentidos", text: "Quem liga pode interromper e mudar de assunto. A Aspen ouve, adapta-se e responde com o conhecimento do seu negócio." },
    { icon: HeartHandshake, title: "Feita para ajudar a crescer", text: "Preço inicial baixo, com 50 prospects B2B por mês incluídos, e as perguntas de rotina tratadas por si." },
    { icon: LifeBuoy, title: "Pessoas reais a apoiar", text: "A nossa equipa de apoio está disponível por telefone, chat ao vivo e e-mail em info@aihiddenleads.com." },
  ],
  es: [
    { icon: AudioLines, title: "Voces neuronales naturales", text: "IA de voz en vivo con respuestas rápidas y naturales: nada de menús telefónicos robóticos." },
    { icon: MessagesSquare, title: "Conversación real en ambos sentidos", text: "Quien llama puede interrumpir y cambiar de tema. Aspen escucha, se adapta y responde con el conocimiento de tu negocio." },
    { icon: HeartHandshake, title: "Pensada para ayudarte a crecer", text: "Precio inicial bajo con 50 prospectos B2B al mes incluidos, mientras las preguntas rutinarias se resuelven por ti." },
    { icon: LifeBuoy, title: "Personas reales apoyándote", text: "Nuestro equipo de soporte está disponible por teléfono, chat en vivo y correo en info@aihiddenleads.com." },
  ],
} as const;

const SpokespersonSection = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const copy = homepageSalesCopy(i18n.language);
  const pt = i18n.language.startsWith('pt'); const es = i18n.language.startsWith('es');
  return <section className="py-12 sm:py-16"><div className="container mx-auto px-5 sm:px-6">
    <div className="flex flex-col md:flex-row items-center gap-8 lg:gap-12">
      <div className="w-full md:w-1/2 flex justify-center">
        <img
          src={aspenHero}
          alt={pt ? 'Aspen, a sua porta-voz de IA' : es ? 'Aspen, tu portavoz de IA' : 'Aspen, your AI spokesperson'}
          loading="lazy"
          className="aspect-square w-full max-w-sm rounded-2xl border border-border object-cover"
        />
      </div>
      <div className="w-full md:w-1/2 text-center md:text-left">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">{pt ? 'Não é um robô de voz. É o seu porta-voz de IA.' : es ? 'No es un bot de voz. Es tu portavoz de IA.' : 'Not a voice bot. Your AI spokesperson.'}</h2>
        <p className="text-base text-muted-foreground max-w-xl mx-auto md:mx-0 mb-6">{pt ? 'A Aspen é uma porta-voz ao vivo, com sincronização labial, no seu site — um rosto real que saúda os visitantes pelo nome, responde às suas perguntas e agenda a chamada, 24/7. Escolha um rosto da biblioteca ou use a sua própria foto. Use uma das nossas vozes naturais, ou a sua. Quase ninguém mais pode oferecer isso.' : es ? 'Aspen es una portavoz en vivo, con sincronización labial, en tu sitio web: un rostro real que saluda a los visitantes por su nombre, responde sus preguntas y agenda la llamada, 24/7. Elige un rostro de la biblioteca o usa tu propia foto. Usa una de nuestras voces naturales, o la tuya. Casi nadie más puede ofrecerte eso.' : 'Aspen is a live, lip-synced spokesperson on your website — a real face that greets visitors by name, answers their questions, and books the call, 24/7. Pick a face from the library or use your own photo. Use one of our natural voices, or your own. Almost nobody else can give you that.'}</p>
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-4 max-w-xl mx-auto md:mx-0 mb-7 text-left">
          {(pt ? POINTS.pt : es ? POINTS.es : POINTS.en).map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground leading-relaxed">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <Button
          onClick={() => navigate("/demo")}
          size="lg"
          className="h-auto min-h-12 max-w-full whitespace-normal break-words text-base sm:text-lg px-4 py-3 bg-primary text-primary-foreground hover:bg-primary/90 glow-border rounded-xl font-semibold"
        >
          {i18n.language.startsWith('en') ? 'Try it on your website — free' : copy.demo}
        </Button>
      </div>
    </div>
  </div></section>;
};
export default SpokespersonSection;
