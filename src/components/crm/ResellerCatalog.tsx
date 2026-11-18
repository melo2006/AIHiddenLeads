// Reseller avatar / voice catalog (design 2026-11-18 §12.5,
// Phase 2.5). The reseller curates what HIS clients can choose: which
// avatars from the shared library, which voices, and which session
// languages. An untouched list means "everything is offered" — that
// is stored as null server-side, so new library entries reach his
// clients automatically until he curates.
//
// Custom creation: the photo-avatar and voice-clone studios live in
// the assistant setup flow (the same panels his clients use), so the
// entry points below deep-link there — with the creation charge from
// HIS OWN rate card shown up front, before he commits to anything.
// Nothing here names a vendor; creation charges are his wholesale
// prices for "custom avatar creation" and "voice clone".
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mic, UserRoundPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AVATAR_LIBRARY } from "@/lib/avatarLibrary";
import { GEMINI_LIVE_VOICES } from "@/lib/voiceCatalog";
import { CATALOG_LANGUAGES, LANGUAGE_LABELS, type CatalogSelection } from "@/lib/catalogSelection";
import { formatMoney } from "@/lib/currency";

interface CatalogPayload {
  organizationId: string;
  selection: CatalogSelection;
  charges: { avatarCreationUsd: number; voiceCloneUsd: number };
  features: { voiceCloning: boolean; videoAvatar: boolean };
}

export default function ResellerCatalog({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [avatars, setAvatars] = useState<Record<string, boolean>>({});
  const [voices, setVoices] = useState<Record<string, boolean>>({});
  const [languages, setLanguages] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reseller-catalog", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("voice-agents", {
        body: { action: "resellerCatalog", organizationId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as CatalogPayload;
    },
  });

  useEffect(() => {
    if (!data) return;
    const a: Record<string, boolean> = {};
    for (const entry of AVATAR_LIBRARY) {
      a[entry.key] = data.selection.avatars === null || data.selection.avatars.includes(entry.key);
    }
    setAvatars(a);
    const v: Record<string, boolean> = {};
    for (const voice of GEMINI_LIVE_VOICES) {
      v[voice.id] = data.selection.voices === null || data.selection.voices.includes(voice.id);
    }
    setVoices(v);
    const l: Record<string, boolean> = {};
    for (const lang of CATALOG_LANGUAGES) l[lang] = data.selection.languages.includes(lang);
    setLanguages(l);
  }, [data]);

  const offeredCounts = useMemo(
    () => ({
      avatars: Object.values(avatars).filter(Boolean).length,
      voices: Object.values(voices).filter(Boolean).length,
      languages: Object.values(languages).filter(Boolean).length,
    }),
    [avatars, voices, languages],
  );

  const save = async () => {
    const avatarKeys = AVATAR_LIBRARY.filter((e) => avatars[e.key]).map((e) => e.key);
    const voiceIds = GEMINI_LIVE_VOICES.filter((v) => voices[v.id]).map((v) => v.id);
    const langs = CATALOG_LANGUAGES.filter((l) => languages[l]);
    if (!avatarKeys.length || !voiceIds.length || !langs.length) {
      toast({
        title: "Keep at least one of each",
        description: "Your clients need at least one avatar, one voice and one language to choose from.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const catalog: CatalogSelection = {
        avatars: avatarKeys.length === AVATAR_LIBRARY.length ? null : avatarKeys,
        voices: voiceIds.length === GEMINI_LIVE_VOICES.length ? null : voiceIds,
        languages: langs,
      };
      const { data: res, error } = await supabase.functions.invoke("voice-agents", {
        body: { action: "saveResellerCatalog", organizationId, catalog },
      });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      toast({ title: "Catalog saved", description: "Your clients now choose from this selection." });
      void queryClient.invalidateQueries({ queryKey: ["reseller-catalog", organizationId] });
    } catch (e) {
      toast({
        title: "Could not save the catalog",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the catalog…
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-destructive">
          {error instanceof Error ? error.message : "The catalog could not be loaded."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avatars, voices &amp; languages</CardTitle>
          <CardDescription>
            Choose what your clients can pick for their assistants. Everything starts out offered;
            untick anything you do not want your clients to use.{" "}
            {offeredCounts.avatars} of {AVATAR_LIBRARY.length} avatars, {offeredCounts.voices} of{" "}
            {GEMINI_LIVE_VOICES.length} voices and {offeredCounts.languages} languages are offered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save catalog
            </Button>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Avatars</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {AVATAR_LIBRARY.map((entry) => (
                <label
                  key={entry.key}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <Checkbox
                    checked={!!avatars[entry.key]}
                    onCheckedChange={(v) =>
                      setAvatars((p) => ({ ...p, [entry.key]: v === true }))
                    }
                    aria-label={`Offer avatar ${entry.label}`}
                  />
                  {entry.image ? (
                    <img src={entry.image} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.label}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {entry.own ? "Signature model" : "Standard model"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Voices</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {GEMINI_LIVE_VOICES.map((voice) => (
                <label
                  key={voice.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <Checkbox
                    checked={!!voices[voice.id]}
                    onCheckedChange={(v) => setVoices((p) => ({ ...p, [voice.id]: v === true }))}
                    aria-label={`Offer voice ${voice.id}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{voice.id}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {voice.gender} · {voice.style}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Languages</h3>
            <div className="flex flex-wrap gap-2">
              {CATALOG_LANGUAGES.map((lang) => (
                <label
                  key={lang}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={!!languages[lang]}
                    onCheckedChange={(v) => setLanguages((p) => ({ ...p, [lang]: v === true }))}
                    aria-label={`Offer language ${LANGUAGE_LABELS[lang] ?? lang}`}
                  />
                  {LANGUAGE_LABELS[lang] ?? lang}
                </label>
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRoundPlus className="h-4 w-4" /> Create a custom avatar
            </CardTitle>
            <CardDescription>
              A one-of-a-kind face built from a photo — for you or for a client. Creation happens in
              the assistant studio, where the photo upload and review tools live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Your price:{" "}
              <span className="font-semibold">{formatMoney(data.charges.avatarCreationUsd, "USD")}</span>{" "}
              per creation, charged to your account when a creation completes.
            </p>
            {!data.features.videoAvatar && (
              <Badge variant="secondary">Video avatars are switched off for your account</Badge>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="/setup">Open the assistant studio</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4" /> Clone a voice
            </CardTitle>
            <CardDescription>
              Record a short sample and the assistant speaks in that voice — your own, or a
              client&apos;s with their permission. Cloning happens in the assistant studio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Your price:{" "}
              <span className="font-semibold">{formatMoney(data.charges.voiceCloneUsd, "USD")}</span>{" "}
              per clone, charged to your account when a clone completes.
            </p>
            {!data.features.voiceCloning && (
              <Badge variant="secondary">Voice cloning is switched off for your account</Badge>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="/setup">Open the assistant studio</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
