import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";
import aspenHero from "@/assets/aspen-hero.jpg";

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
