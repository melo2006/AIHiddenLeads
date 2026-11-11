import { useEffect } from "react";
import AgentLandingTemplate from "@/components/landing/AgentLandingTemplate";
import { REALTOR_VERTICAL } from "@/data/agentVerticals";

/**
 * /agents/realtors — first agent-vertical landing page.
 * Built from the shared AgentLandingTemplate; mortgage and insurance
 * pages clone this file with their own vertical data once the realtor
 * page + pilot prove conversion.
 */
const Realtors = () => {
  useEffect(() => {
    document.title = "AI Receptionist for Real Estate Agents | AI Hidden Leads";
  }, []);

  return <AgentLandingTemplate vertical={REALTOR_VERTICAL} />;
};

export default Realtors;
