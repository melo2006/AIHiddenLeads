import { useParams } from 'react-router-dom';
import GeminiAgentWidget from '@/components/GeminiAgentWidget';
export default function AgentEmbed(){const {id}=useParams();return <main className="flex min-h-screen justify-center bg-background p-2 text-foreground"><GeminiAgentWidget agentId={id}/></main>;}