import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PHONE_SIMULATION } from '@/data/phoneSimulation';

export default function PhoneFirstOffer() {
  const [scenarioId, setScenarioId] = useState<string>('locked-out');
  const scenario = PHONE_SIMULATION.scenarios.find(s => s.id === scenarioId) || PHONE_SIMULATION.scenarios[0];
  return <section aria-labelledby="phone-first-title" className="mt-8 border-y border-border py-8">
    <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Phone className="h-4 w-4" />Phone-first · website optional</div>
    <h2 id="phone-first-title" className="mt-3 text-2xl font-bold">Your business knowledge. A natural voice for your callers.</h2>
    <p className="mt-3 leading-relaxed text-muted-foreground">A locksmith, repair shop or service business doesn’t need a website widget to benefit from an AI receptionist. Keep your number and choose after-hours, busy-time or all-day forwarding. Telephone answering is activated for each business after setup and testing.</p>
    <h3 className="mt-6 text-lg font-semibold">No website? Start with what you already have.</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Use your brochures, service lists, parts information, FAQs and documents—or enter the details in guided setup. An existing website can help us learn, even if you don’t want a widget. You review the information before your assistant uses it.</p>
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {['Business name, industry, hours and service area', 'Services, parts and approved prices', 'Urgent requests and who should receive them', 'What to say when an answer, price or availability is unknown'].map(item=><li key={item} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}
    </ul>
    <div className="mt-5 flex items-start gap-2 text-sm text-muted-foreground"><FileText className="mt-0.5 h-4 w-4 shrink-0" /><p>Private document learning is part of guided setup. Sending a secure setup link during a telephone call still requires the new phone connection; it is not active yet.</p></div>
    <div className="mt-7 border-t border-border pt-6">
      <p className="text-xs font-semibold uppercase text-primary">Illustrative conversation · fictional business · no live call</p>
      <h3 className="mt-2 text-lg font-semibold">{PHONE_SIMULATION.business}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{PHONE_SIMULATION.hours} · {PHONE_SIMULATION.serviceArea}</p>
      <div role="group" aria-label="Example caller questions" className="mt-4 flex flex-wrap gap-2">
        {PHONE_SIMULATION.scenarios.map(s=><Button key={s.id} size="sm" variant={scenarioId===s.id?'default':'outline'} aria-pressed={scenarioId===s.id} onClick={()=>setScenarioId(s.id)}>{s.label}</Button>)}
      </div>
      <div aria-live="polite" className="mt-4 space-y-3 border-l-2 border-primary pl-4">
        <p className="text-sm"><span className="font-semibold text-muted-foreground">Caller: </span>{scenario.caller}</p>
        <p className="text-sm leading-relaxed"><span className="font-semibold text-primary">Receptionist: </span>{scenario.reply}</p>
      </div>
    </div>
    <h3 className="mt-7 text-lg font-semibold">One plan. Choose where your assistant answers.</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Keep the existing Premium $99, Professional $199 and Platinum $349 monthly plans. Website use is optional for a phone-focused business. Browser minutes are not telephone minutes: phone usage is separate at the published rate. Live transfer and one included local number belong to Professional and Platinum, after activation and testing.</p>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">No additional $49 or $99 phone fee and no telephone-minute bundle have been added. Telephone billing and forwarding are confirmed during setup; this example does not activate a line.</p>
    <div className="mt-5 flex flex-wrap gap-3"><Button asChild><Link to="/book">Discuss my phone setup</Link></Button><Button asChild variant="outline"><Link to="/plans">Compare existing plans</Link></Button></div>
  </section>;
}