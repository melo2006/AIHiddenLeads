import { AudioLines, MessagesSquare, Video, Zap, HeartHandshake, LifeBuoy } from "lucide-react";

const ADVANTAGES = [
  { icon: AudioLines, title: "Natural neural voices", text: "Live speech-to-speech AI, not robotic text-to-speech or a phone menu. It sounds like a real person." },
  { icon: MessagesSquare, title: "Real two-way conversation", text: "Callers can interrupt and change topics naturally. Aspen listens, adapts and answers from your business knowledge." },
  { icon: Zap, title: "Fast, natural turn-taking", text: "Streaming audio replies begin quickly after the caller finishes, so it feels like a real conversation instead of a recording." },
  { icon: Video, title: "Put a face to the conversation", text: "An optional lip-synced video assistant gives visitors a face to talk to, alongside website voice and chat." },
  { icon: HeartHandshake, title: "Built to help you grow", text: "Low entry pricing, 50 B2B leads a month and automation of repetitive tasks, so you can focus on customers." },
  { icon: LifeBuoy, title: "Real people supporting you", text: "Our support team is available by phone, live chat and email at info@aihiddenleads.com." },
];

const WhyUsSection = () => (
  <section className="py-12 sm:py-16" aria-labelledby="why-us-title">
    <div className="container mx-auto px-5 sm:px-6">
      <h2 id="why-us-title" className="text-2xl sm:text-3xl font-bold mb-3">More time for customers. More opportunities to grow.</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">Let AI handle routine website questions while your team focuses on relationships, follow-up and closing deals. Try the conversation with Aspen before choosing a plan.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ADVANTAGES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-lg border border-border bg-card p-5">
            <Icon className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{text}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default WhyUsSection;
