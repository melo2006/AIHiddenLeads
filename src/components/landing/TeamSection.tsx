import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import aspenWave from "@/assets/aspen-idle-wave.gif";
import aspenPortrait from "@/assets/aspen-transparent-512.webp";
import saraStill from "@/assets/simli/f735e62c-dce7-4c0b-8e85-1c7e21774c45.webp";
import alexStill from "@/assets/simli/a36d66df-a23d-4569-996b-d0e990019857.webp";

// "Meet the team" — Aspen (host), Sara (demo receptionist) and Alex
// (setup & support), presented as the staff who actually serve you.
// Copy is the audit-approved draft (meet-the-team-audit-2026-11-09.md §7),
// EN/ES/PT following the landing sections' inline-copy pattern
// (cf. SpokespersonSection's POINTS table). Presentational only: no
// widget/session imports — Aspen's card talks to the floating homepage
// widget through the same public 'open-homepage-aspen' event the hero
// uses (GeminiAgentWidget listens for it; on /demo, TryDemo's own widget
// mount hears it too, and Sara's card routes to /demo itself).

// Sara's and Alex's real captured loops live in src/assets/team/ as
// sara-loop.webp / alex-loop.webp (animated WebP, live-Simli captures via
// the chroma-key canvas — audit §6). The still props on the cards point
// at the catalogue stills (the loop files' captured sibling posters are
// the same faces at src/assets/team/sara-poster.png / alex-poster.png).
//
// These MUST stay plain static imports — never resolve them through a
// Vite glob import. The glob form silently compiled to an empty map in
// the production build: Vite's toAbsoluteGlob joins the importer dir
// with the RAW "../assets/team/*.webp" pattern via posix.join, which
// normalizes ".." against the LAST segment of the dir
// (src/components/landing → src/components), landing the scan on the
// nonexistent src/components/assets/team/ — zero matches, no warning,
// and both cards fell back to the stills (found live 2026-11-09;
// regression-pinned in meet-the-team.test.ts). Static imports resolve
// ".." against the file's real directory and always emit the asset.
// The loop files are committed, so the imports always resolve; the
// stills remain the save-data / reduced-motion fallback at render time.
import saraLoop from "@/assets/team/sara-loop.webp";
import alexLoop from "@/assets/team/alex-loop.webp";

const COPY = {
  en: {
    title: "Meet the team behind Aspen",
    intro:
      "Three people, one job each — so you are never left talking to a machine with no one behind it.",
    aspen: {
      role: "Aspen — your host",
      text: "Aspen greets your visitors and callers, answers questions about AiHiddenLeads, and starts your free demo. She's the voice you'll hear first — here, and on the phone.",
      cta: "Hear Aspen",
      alt: "Aspen, your AI host, waving",
    },
    sara: {
      role: "Sara — your demo receptionist",
      text: "Sara steps onto a mock-up of your website and shows you exactly how your own AI receptionist would greet customers, answer questions and take the booking. Nothing on your real site is changed.",
      cta: "Hear Sara in your demo",
      alt: "Sara, who runs your website demo",
    },
    alex: {
      role: "Alex — setup & support",
      text: "Once you're on board, Alex walks you — or your tech person — through setup step by step, including the one small snippet that puts your assistant on your site, whether it's WordPress, Wix or plain HTML.",
      cta: "Hear Alex in setup",
      alt: "Alex, your setup and support specialist",
    },
  },
  pt: {
    title: "Conheça a equipa por trás da Aspen",
    intro:
      "Três pessoas, uma função cada — para nunca ficar a falar com uma máquina sem ninguém por trás.",
    aspen: {
      role: "Aspen — a sua anfitriã",
      text: "A Aspen recebe os seus visitantes e quem liga, responde a perguntas sobre a AiHiddenLeads e inicia a sua demonstração gratuita. É a voz que vai ouvir primeiro — aqui e ao telefone.",
      cta: "Ouvir a Aspen",
      alt: "Aspen, a sua anfitriã de IA, a acenar",
    },
    sara: {
      role: "Sara — a rececionista da sua demonstração",
      text: "A Sara entra numa maqueta do seu site e mostra-lhe exatamente como a sua própria rececionista de IA receberia os clientes, responderia a perguntas e faria a marcação. Nada no seu site real é alterado.",
      cta: "Ouvir a Sara na sua demonstração",
      alt: "Sara, que apresenta a demonstração do seu site",
    },
    alex: {
      role: "Alex — configuração e apoio",
      text: "Quando estiver a bordo, o Alex acompanha-o — ou ao seu técnico — na configuração, passo a passo, incluindo o pequeno excerto de código que coloca o seu assistente no seu site, seja WordPress, Wix ou HTML simples.",
      cta: "Ouvir o Alex na configuração",
      alt: "Alex, o seu especialista de configuração e apoio",
    },
  },
  es: {
    title: "Conoce al equipo detrás de Aspen",
    intro:
      "Tres personas, una función cada una, para que nunca hables con una máquina sin nadie detrás.",
    aspen: {
      role: "Aspen — tu anfitriona",
      text: "Aspen recibe a tus visitantes y a quienes llaman, responde preguntas sobre AiHiddenLeads e inicia tu demostración gratuita. Es la voz que escucharás primero, aquí y por teléfono.",
      cta: "Escuchar a Aspen",
      alt: "Aspen, tu anfitriona de IA, saludando",
    },
    sara: {
      role: "Sara — la recepcionista de tu demostración",
      text: "Sara entra en una maqueta de tu sitio web y te muestra exactamente cómo tu propia recepcionista de IA recibiría a los clientes, respondería preguntas y tomaría la reserva. Nada en tu sitio real cambia.",
      cta: "Escuchar a Sara en tu demo",
      alt: "Sara, que presenta la demostración de tu sitio",
    },
    alex: {
      role: "Alex — configuración y soporte",
      text: "Cuando ya estás a bordo, Alex te acompaña a ti —o a tu técnico— en la configuración, paso a paso, incluido el pequeño fragmento de código que pone tu asistente en tu sitio, ya sea WordPress, Wix o HTML simple.",
      cta: "Escuchar a Alex en la configuración",
      alt: "Alex, tu especialista de configuración y soporte",
    },
  },
} as const;

type TeamCopy = {
  title: string;
  intro: string;
  aspen: { role: string; text: string; cta: string; alt: string };
  sara: { role: string; text: string; cta: string; alt: string };
  alex: { role: string; text: string; cta: string; alt: string };
};

/**
 * Whether the visitor asked the browser to save data or cut motion. When
 * either is on, Sara/Alex cards keep their still poster instead of loading
 * the animated loop (Aspen's shipped wave GIF is exempt — it is the
 * hero's own asset and already on the page).
 */
function useSaveDataOrReducedMotion() {
  const [frugal, setFrugal] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData === true;
    setFrugal(reduced || saveData);
  }, []);
  return frugal;
}

interface TeamSectionProps {
  /** Compact = the /demo seam variant: tighter padding, no intro line. */
  compact?: boolean;
}

const TeamSection = ({ compact = false }: TeamSectionProps) => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const frugal = useSaveDataOrReducedMotion();
  const copy: TeamCopy = i18n.language.startsWith("pt")
    ? COPY.pt
    : i18n.language.startsWith("es")
      ? COPY.es
      : COPY.en;

  const people = [
    {
      key: "aspen",
      animated: aspenWave,
      still: aspenPortrait,
      ...copy.aspen,
      onHear: () =>
        window.dispatchEvent(
          new CustomEvent("open-homepage-aspen", {
            detail: { mode: "voice", start: true },
          }),
        ),
    },
    {
      key: "sara",
      animated: saraLoop,
      still: saraStill,
      ...copy.sara,
      onHear: () => navigate("/demo"),
    },
    {
      key: "alex",
      animated: alexLoop,
      still: alexStill,
      ...copy.alex,
      onHear: () => navigate("/setup"),
    },
  ] as const;

  return (
    <section
      aria-labelledby="meet-the-team-title"
      className={compact ? "mt-8" : "py-10 sm:py-12"}
    >
      <div className={compact ? undefined : "container mx-auto px-5 sm:px-6"}>
        <h2
          id="meet-the-team-title"
          className={
            compact
              ? "text-lg font-bold text-foreground"
              : "text-2xl sm:text-3xl font-bold mb-3"
          }
        >
          {copy.title}
        </h2>
        {!compact && (
          <p className="text-sm text-muted-foreground max-w-3xl mb-6">{copy.intro}</p>
        )}
        <div
          className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${
            compact ? "mt-3 max-w-none" : "max-w-4xl"
          }`}
        >
          {people.map((person) => (
            <article
              key={person.key}
              className="flex min-w-0 flex-col items-center rounded-lg border border-border bg-card p-5 text-center"
            >
              <img
                src={frugal ? person.still : person.animated}
                alt={person.alt}
                loading="lazy"
                width={200}
                height={200}
                className="aspect-square w-full max-w-[200px] rounded-lg object-cover object-top"
              />
              <h3 className="mt-4 text-base font-semibold">{person.role}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {person.text}
              </p>
              <button
                type="button"
                onClick={person.onHear}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
              >
                <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
                {person.cta}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
