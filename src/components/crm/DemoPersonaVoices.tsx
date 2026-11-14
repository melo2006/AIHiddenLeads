import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import GeminiConversation from "@/components/GeminiConversation";
import { AVATAR_LIBRARY } from "@/lib/avatarLibrary";
import { GEMINI_LIVE_VOICES, VOICE_LANGUAGE_SETS, liveVoiceById, liveVoiceLabel } from "@/lib/voiceCatalog";
import {
  DEMO_PERSONA_VOICE_ROWS,
  effectivePersonaVoice,
  fetchPersonaVoiceOverrides,
  resetPersonaVoiceOverride,
  savePersonaVoiceOverride,
  type PersonaVoiceOverrides,
} from "@/lib/demoPersonaVoices";

const libraryImage = (key: string): string | undefined =>
  AVATAR_LIBRARY.find((e) => e.key === key)?.image;

/**
 * Demo Voices (admin voice control, 2026-11-14): one row per demo
 * persona — pick a voice, hear it, save it. Saves land in
 * persona_voice_overrides and gemini-session stamps the override on
 * the NEXT demo session (no publish needed); Reset deletes the row
 * and the code default (personas.ts / avatar library) applies again.
 * The audition reuses the wizard picker's preview mechanism exactly:
 * GeminiConversation previewOnly + previewVoice, authorized by
 * gemini-session's admin draft path.
 */
export default function DemoPersonaVoices() {
  const [overrides, setOverrides] = useState<PersonaVoiceOverrides>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [busyPersona, setBusyPersona] = useState<string | null>(null);
  const [auditioning, setAuditioning] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const map = await fetchPersonaVoiceOverrides(supabase);
        if (!live) return;
        setOverrides(map);
        setPicked((prev) => {
          const next = { ...prev };
          for (const row of DEMO_PERSONA_VOICE_ROWS) {
            next[row.persona] = effectivePersonaVoice(row, map).voice;
          }
          return next;
        });
      } catch {
        if (!live) return;
        // Table not applied yet (or a read problem): the tab still
        // renders, showing the code defaults that ARE in force, with
        // saving disabled — never a silent pretend-state.
        setLoadError(true);
        setPicked((prev) => {
          const next = { ...prev };
          for (const row of DEMO_PERSONA_VOICE_ROWS) next[row.persona] = row.defaultVoice;
          return next;
        });
      }
    })();
    return () => { live = false; };
  }, []);

  async function save(persona: string) {
    const voice = picked[persona];
    if (!voice) return;
    setBusyPersona(persona);
    try {
      const { data } = await supabase.auth.getUser();
      await savePersonaVoiceOverride(supabase, persona, voice, data.user?.id ?? null);
      setOverrides((prev) => ({ ...prev, [persona]: voice }));
      toast.success(`${DEMO_PERSONA_VOICE_ROWS.find((r) => r.persona === persona)?.label ?? persona} now demos with ${voice} — no publish needed.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the voice override.");
    } finally {
      setBusyPersona(null);
    }
  }

  async function reset(persona: string) {
    setBusyPersona(persona);
    try {
      await resetPersonaVoiceOverride(supabase, persona);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[persona];
        return next;
      });
      const row = DEMO_PERSONA_VOICE_ROWS.find((r) => r.persona === persona);
      if (row) setPicked((prev) => ({ ...prev, [persona]: row.defaultVoice }));
      toast.success(`${row?.label ?? persona} is back to the code default (${row?.defaultVoice}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset the voice override.");
    } finally {
      setBusyPersona(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-4 py-3">
      <div className="space-y-1">
        <h3 className="font-semibold">Demo persona voices</h3>
        <p className="text-xs text-muted-foreground">
          The voice each demo persona speaks with on the live demos. Saving takes effect on the next demo
          session — no publish needed. “Code default” is the voice built into the current release; an
          “Admin override” is a voice saved here. Reset removes the override and the code default applies
          again. This page controls the DEMO personas only — customer agents keep their own voices.
        </p>
        {loadError && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Saved overrides could not be loaded (the persona_voice_overrides table may not be applied yet).
            The voices shown are the code defaults currently in force; saving is disabled until the table loads.
          </p>
        )}
      </div>

      <div className="divide-y divide-border border-y border-border">
        {DEMO_PERSONA_VOICE_ROWS.map((row) => {
          const effective = effectivePersonaVoice(row, overrides);
          const current = picked[row.persona] ?? effective.voice;
          const dirty = current !== effective.voice;
          const busy = busyPersona === row.persona;
          const img = libraryImage(row.libraryKey);
          return (
            <section key={row.persona} data-testid={`persona-row-${row.persona}`} className="space-y-3 py-4">
              <div className="flex flex-wrap items-start gap-4">
                {img
                  ? <img src={img} alt={row.label} className="h-16 w-16 rounded-lg object-cover" />
                  : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-lg font-semibold">{row.label.slice(0, 1)}</div>}
                <div className="min-w-40 flex-1 space-y-1">
                  <p className="font-semibold">{row.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Now demos with <span className="font-medium text-foreground">{effective.voice}</span>
                    {liveVoiceById(effective.voice) ? ` — ${liveVoiceById(effective.voice)!.style} · ${liveVoiceById(effective.voice)!.gender}` : ""}
                    {" · "}
                    <span className={effective.source === "override" ? "font-medium text-primary" : ""}>
                      {effective.source === "override" ? "Admin override" : `Code default`}
                    </span>
                  </p>
                  {!row.sessionResolved && (
                    <p className="text-[11px] text-muted-foreground">
                      Library face — this face fronts no live demo session yet, so a saved voice is stored
                      here for wherever the face is given a voice; the wizard’s library default stays {row.defaultVoice}.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={current} onValueChange={(v) => setPicked((prev) => ({ ...prev, [row.persona]: v }))}>
                  <SelectTrigger aria-label={`${row.label} voice`} className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEMINI_LIVE_VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{liveVoiceLabel(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setAuditioning(auditioning === row.persona ? null : row.persona)}>
                  <Play className="mr-2 h-4 w-4" />{auditioning === row.persona ? "Hide audition" : `Hear ${current}`}
                </Button>
                <Button size="sm" disabled={busy || loadError || !dirty} onClick={() => void save(row.persona)}>
                  <Save className="mr-2 h-4 w-4" />Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || loadError || effective.source !== "override"}
                  onClick={() => void reset(row.persona)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />Reset to default ({row.defaultVoice})
                </Button>
              </div>

              <div className="space-y-1">
                {VOICE_LANGUAGE_SETS.map((setDef) => (
                  <div key={setDef.language} className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-muted-foreground">{setDef.label} set:</span>
                    {[...setDef.female, ...setDef.male].map((id) => (
                      <Button
                        key={id}
                        size="sm"
                        variant={current === id ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setPicked((prev) => ({ ...prev, [row.persona]: id }))}
                      >
                        {id} · {liveVoiceById(id)?.gender === "Female" ? "F" : "M"}
                      </Button>
                    ))}
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  The sets are the wizard picker's curated voices for that language — picking one here changes
                  only the voice; a demo's language still follows the visitor's site-language choice.
                </p>
              </div>

              {auditioning === row.persona && (
                <div className="max-w-xl rounded-lg border border-border p-2">
                  <GeminiConversation
                    key={`${row.persona}-${current}`}
                    previewOnly
                    draft
                    compact
                    name={row.label}
                    previewVoice={current}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
