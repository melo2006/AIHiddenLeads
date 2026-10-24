import { typicalConversationCost, type VoicePricing } from '../../../supabase/functions/_shared/voice-usage';

export default function LiveModelPricing({ label, pricing }: { label: string; pricing: VoicePricing | null }) {
  if (!pricing) return <p className="text-xs text-muted-foreground">{label} · Published audio pricing not verified.</p>;
  const money = (value: number | null) => value == null ? 'Unknown' : `$${value.toFixed(4)}`;
  return <div className="space-y-2 text-xs">
    <p className="font-semibold">{label} · USD audio estimates, not invoices</p>
    <div className="grid grid-cols-2 gap-3 border-y border-border py-3 sm:grid-cols-4">
      {[1, 2, 5, 10].map(minutes => <div key={minutes}><p className="text-muted-foreground">{minutes === 1 ? 'Per conversation minute' : `${minutes}-minute conversation`}</p><p className="font-semibold">{money(typicalConversationCost(minutes, pricing))}</p></div>)}
    </div>
    <p className="text-muted-foreground">Assumes continuous input audio and Aspen speaking half the time. Input ${pricing.inputAudioPerMinute.toFixed(3)}/audio minute + output ${pricing.outputAudioPerMinute.toFixed(3)}/audio minute. A full minute of both costs ${(pricing.inputAudioPerMinute + pricing.outputAudioPerMinute).toFixed(3)}.</p>
    <p className="text-muted-foreground">Actual totals depend on recorded audio. Text context, scanning, telephone charges and taxes are additional.</p>
    <a href={pricing.source} target="_blank" rel="noreferrer" className="text-primary underline">Google pricing{pricing.verifiedAt ? ` · checked ${pricing.verifiedAt}` : ''}</a>
  </div>;
}