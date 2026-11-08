import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScanningAnimation from "@/components/landing/ScanningAnimation";
import {
  inviteLeadToDemoData,
  normalizeInviteSlug,
  resolveDemoInvite,
} from "@/lib/demoInvite";

/**
 * Cold-email invite landing: /demo/<website-slug>/<code>.
 *
 * The link itself is the credential — resolving it server-side validates
 * the code, confirms the prospect's pre-built demo genuinely finished,
 * and stamps the arrival (their email proof, so no 4-digit code gate).
 * Success routes straight into the pre-built demo; ANY failure quietly
 * falls back to the public /demo form with the website prefilled — an
 * invited visitor never sees an error or a dead end here.
 */
const InviteDemo = () => {
  const { slug: slugParam, code: codeParam } = useParams();
  const navigate = useNavigate();
  const startedRef = useRef(false);

  const slug = slugParam ? normalizeInviteSlug(slugParam) : null;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const fallback = () => {
      const target = slug || slugParam || "";
      navigate(target ? `/demo?url=${encodeURIComponent(target)}` : "/demo", { replace: true });
    };

    if (!slug || !codeParam) {
      fallback();
      return;
    }

    let cancelled = false;
    void resolveDemoInvite(slug, codeParam).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.lead.website_url) {
        fallback();
        return;
      }
      const leadData = inviteLeadToDemoData(result.lead);
      const params = new URLSearchParams({
        url: result.lead.website_url,
        leadId: result.lead.id,
        name: result.lead.business_name || "",
        scan: "1",
        invite: "1",
      });
      if (result.lead.email) params.set("callerEmail", result.lead.email);
      navigate(`/demo-site?${params.toString()}`, { replace: true, state: { leadData } });
    });

    return () => {
      cancelled = true;
    };
  }, [slug, slugParam, codeParam, navigate]);

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-4 py-4 text-center">
      <ScanningAnimation
        websiteUrl={slug || "your website"}
        onComplete={() => {}}
        mode="continuous"
      />
    </div>
  );
};

export default InviteDemo;
