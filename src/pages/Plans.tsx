import { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PricingSection from '@/components/landing/PricingSection';
import { selectedSalesPlan } from '@/lib/salesActions';

export default function Plans() {
  const [params] = useSearchParams();
  const recommended = selectedSalesPlan(params.get('plan'));
  useEffect(() => {
    requestAnimationFrame(() => document.getElementById(`plan-${recommended}`)?.scrollIntoView({ block: 'start' }));
  }, [recommended]);
  return <main className="min-h-screen bg-background">
    <div className="container mx-auto px-4 pt-4"><Button asChild size="sm" variant="ghost"><Link to="/"><ArrowLeft />Back to homepage</Link></Button></div>
    <PricingSection recommendedPlan={recommended} />
  </main>;
}