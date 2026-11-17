import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_VOICE_FILTERS,
  GEMINI_LIVE_VOICES,
  VOICE_MOODS,
  filterVoices,
  liveVoiceById,
  voiceAgeBand,
  voiceLanguageFit,
} from "@/lib/voiceCatalog";
import {
  VoicePreviewPlayer,
  type PreviewAudioElement,
} from "@/lib/voicePreview";
import { VoicePickerGrid } from "@/components/VoicePicker";
import { LOCALE_VOICE_SETS } from "../../supabase/functions/_shared/locale-voices";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

class FakeAudio implements PreviewAudioElement {
  src = "";
  playCalls = 0;
  pauseCalls = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  async play() {
    this.playCalls += 1;
  }
  pause() {
    this.pauseCalls += 1;
  }
}

function makePlayer(fetchImpl?: (voice: string) => Promise<string>) {
  const audio = new FakeAudio();
  const fetches: string[] = [];
  const player = new VoicePreviewPlayer({
    fetchSampleUrl: async (voice: string) => {
      fetches.push(voice);
      return fetchImpl ? fetchImpl(voice) : `blob:sample-${voice}`;
    },
    createAudio: () => audio,
  });
  return { player, audio, fetches };
}

afterEach(() => cleanup());

describe("VoicePreviewPlayer — one voice at a time", () => {
  it("plays the tapped voice through the shared element", async () => {
    const { player, audio, fetches } = makePlayer();
    await player.toggle("Kore");
    expect(fetches).toEqual(["Kore"]);
    expect(audio.src).toBe("blob:sample-Kore");
    expect(audio.playCalls).toBe(1);
    expect(player.getSnapshot().playingId).toBe("Kore");
  });

  it("starting B stops A — the shared element is paused and re-pointed", async () => {
    const { player, audio } = makePlayer();
    await player.toggle("Kore");
    await player.toggle("Puck");
    expect(audio.pauseCalls).toBeGreaterThanOrEqual(1);
    expect(audio.src).toBe("blob:sample-Puck");
    expect(player.getSnapshot().playingId).toBe("Puck");
  });

  it("tapping the playing voice stops it", async () => {
    const { player, audio } = makePlayer();
    await player.toggle("Kore");
    await player.toggle("Kore");
    expect(player.getSnapshot().playingId).toBeNull();
    expect(audio.pauseCalls).toBeGreaterThanOrEqual(1);
  });

  it("stop() (picker unmount) halts playback", async () => {
    const { player, audio } = makePlayer();
    await player.toggle("Kore");
    player.stop();
    expect(player.getSnapshot().playingId).toBeNull();
    expect(audio.pauseCalls).toBeGreaterThanOrEqual(1);
  });

  it("caches the sample per voice — a replay never re-fetches (never re-bills)", async () => {
    const { player, fetches } = makePlayer();
    await player.toggle("Kore");
    player.stop();
    await player.toggle("Kore");
    expect(fetches).toEqual(["Kore"]);
    expect(player.getSnapshot().playingId).toBe("Kore");
  });

  it("a superseded fetch can never start playing late", async () => {
    let releaseSlow: ((url: string) => void) | undefined;
    const { player, audio } = makePlayer((voice) =>
      voice === "Kore"
        ? new Promise<string>((resolve) => {
            releaseSlow = resolve;
          })
        : Promise.resolve(`blob:sample-${voice}`),
    );
    const slow = player.toggle("Kore");
    await player.toggle("Puck");
    expect(player.getSnapshot().playingId).toBe("Puck");
    releaseSlow?.("blob:sample-Kore");
    await slow;
    expect(player.getSnapshot().playingId).toBe("Puck");
    expect(audio.src).toBe("blob:sample-Puck");
  });

  it("a failed synthesis surfaces an error state instead of playing", async () => {
    const { player } = makePlayer(() => Promise.reject(new Error("boom")));
    await player.toggle("Kore");
    expect(player.getSnapshot()).toEqual({
      playingId: null,
      loadingId: null,
      errorId: "Kore",
    });
  });
});

describe("voice metadata — honestly derived, never fabricated", () => {
  it("age band exists ONLY where the style word implies it (Youthful→Young, Mature→Mature)", () => {
    const banded = GEMINI_LIVE_VOICES.filter((v) => voiceAgeBand(v) !== undefined);
    expect(banded.map((v) => v.id).sort()).toEqual(["Gacrux", "Leda"]);
    expect(voiceAgeBand(liveVoiceById("Leda")!)).toBe("Young");
    expect(voiceAgeBand(liveVoiceById("Gacrux")!)).toBe("Mature");
    expect(voiceAgeBand(liveVoiceById("Kore")!)).toBeUndefined();
  });

  it("languageFit matches the locale-voices sets exactly (the derivation source)", () => {
    for (const v of GEMINI_LIVE_VOICES) {
      const fit = voiceLanguageFit(v);
      expect(fit[0]).toBe("en");
      const esSet = [...LOCALE_VOICE_SETS.es.female, ...LOCALE_VOICE_SETS.es.male];
      const ptSet = [
        ...LOCALE_VOICE_SETS["pt-BR"].female,
        ...LOCALE_VOICE_SETS["pt-BR"].male,
      ];
      expect(fit.includes("es")).toBe(esSet.includes(v.id));
      expect(fit.includes("pt-BR")).toBe(ptSet.includes(v.id));
    }
  });

  it("worked examples: Kore→en+es, Zephyr→en+pt-BR, Erinome→en only", () => {
    expect(voiceLanguageFit(liveVoiceById("Kore")!)).toEqual(["en", "es"]);
    expect(voiceLanguageFit(liveVoiceById("Zephyr")!)).toEqual(["en", "pt-BR"]);
    expect(voiceLanguageFit(liveVoiceById("Despina")!)).toEqual(["en", "pt-BR"]);
    expect(voiceLanguageFit(liveVoiceById("Erinome")!)).toEqual(["en"]);
  });
});

describe("filterVoices — compose, fit-first language, reset", () => {
  it("empty filters return the full catalog in order", () => {
    const out = filterVoices(GEMINI_LIVE_VOICES, EMPTY_VOICE_FILTERS);
    expect(out).toHaveLength(30);
    expect(out[0].id).toBe("Zephyr");
    expect(out[29].id).toBe("Sulafat");
  });

  it("gender is a hard filter", () => {
    const out = filterVoices(GEMINI_LIVE_VOICES, {
      ...EMPTY_VOICE_FILTERS,
      gender: "Female",
    });
    expect(out).toHaveLength(15);
    expect(out.every((v) => v.gender === "Female")).toBe(true);
  });

  it("mood is a hard filter over the style words", () => {
    const out = filterVoices(GEMINI_LIVE_VOICES, {
      ...EMPTY_VOICE_FILTERS,
      mood: "Warm",
    });
    expect(out.map((v) => v.id)).toEqual(["Sulafat"]);
    expect(VOICE_MOODS).toContain("Youthful");
    expect(VOICE_MOODS).toContain("Mature");
    expect(new Set(VOICE_MOODS).size).toBe(VOICE_MOODS.length);
  });

  it("filters compose (Female + Bright)", () => {
    const out = filterVoices(GEMINI_LIVE_VOICES, {
      language: "all",
      gender: "Female",
      mood: "Bright",
    });
    expect(out.map((v) => v.id)).toEqual(["Zephyr", "Autonoe"]);
  });

  it("language puts curated picks first but keeps every voice reachable", () => {
    const out = filterVoices(GEMINI_LIVE_VOICES, {
      ...EMPTY_VOICE_FILTERS,
      language: "es",
    });
    expect(out).toHaveLength(30);
    expect(out.slice(0, 6).map((v) => v.id)).toEqual([
      "Puck",
      "Charon",
      "Kore",
      "Orus",
      "Aoede",
      "Sulafat",
    ]);
    const erinome = out.findIndex((v) => v.id === "Erinome");
    const sulafat = out.findIndex((v) => v.id === "Sulafat");
    expect(sulafat).toBeLessThan(erinome);
  });

  it("language composes with gender (Spanish-fit males first, all males kept)", () => {
    const out = filterVoices(GEMINI_LIVE_VOICES, {
      language: "es",
      gender: "Male",
      mood: "all",
    });
    expect(out).toHaveLength(15);
    expect(out.slice(0, 3).map((v) => v.id)).toEqual(["Puck", "Charon", "Orus"]);
  });
});

describe("VoicePickerGrid — preview never selects; unmount stops", () => {
  // The full 30-card grid + filter bar is a heavy jsdom render on this
  // VM; these three carry an explicit timeout for that reason alone.
  it("clicking a card's play button plays that voice WITHOUT selecting it", async () => {
    const { player } = makePlayer();
    const onSelect = vi.fn();
    render(<VoicePickerGrid selectedId={null} onSelect={onSelect} player={player} />);
    fireEvent.click(screen.getByRole("button", { name: "Hear Kore" }));
    await waitFor(() => expect(player.getSnapshot().playingId).toBe("Kore"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop Kore preview" })).toBeTruthy();
  }, 20000);

  it("clicking the card itself still selects", () => {
    const { player } = makePlayer();
    const onSelect = vi.fn();
    render(<VoicePickerGrid selectedId={null} onSelect={onSelect} player={player} />);
    fireEvent.click(screen.getByRole("button", { name: /^Kore/ }));
    expect(onSelect).toHaveBeenCalledWith("Kore");
  }, 20000);

  it("unmounting the picker stops playback", async () => {
    const { player, audio } = makePlayer();
    const view = render(
      <VoicePickerGrid selectedId={null} onSelect={() => {}} player={player} />,
    );
    await player.toggle("Kore");
    expect(player.getSnapshot().playingId).toBe("Kore");
    view.unmount();
    expect(player.getSnapshot().playingId).toBeNull();
    expect(audio.pauseCalls).toBeGreaterThanOrEqual(1);
  }, 20000);

  it("cards show the metadata tags (age band + language picks)", () => {
    const { player } = makePlayer();
    render(<VoicePickerGrid selectedId={null} onSelect={() => {}} player={player} />);
    // selector: "span" — the Mood filter's <option>Mature</option> must
    // not be mistaken for Gacrux's age chip.
    expect(screen.getByText("Young", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Mature", { selector: "span" })).toBeTruthy();
    expect(screen.getAllByText("Spanish pick").length).toBe(6);
    expect(screen.getAllByText("Portuguese pick").length).toBe(6);
  }, 20000);
});

describe("source pins — both pickers carry the per-card preview", () => {
  it("AvatarSettings renders the shared picker grid (old inline grid gone)", () => {
    const src = read("../components/AvatarSettings.tsx");
    expect(src).toContain("VoicePickerGrid");
    expect(src).not.toContain("VOICES.map");
  });

  it("the wizard voice step renders preview buttons, tags and the filter bar", () => {
    const src = read("../components/setup-wizard/SetupWizard.tsx");
    expect(src).toContain("VoicePreviewButton");
    expect(src).toContain("VoiceMetaTags");
    expect(src).toContain("VoiceFilterBar");
    expect(src).toContain("filterVoices(GEMINI_LIVE_VOICES, voiceFilters)");
    expect(src).toContain("pickVoice(v.id, \"en\")");
  });

  it("the preview button can never trigger card selection", () => {
    const src = read("../components/VoicePicker.tsx");
    expect(src).toContain("e.stopPropagation()");
    expect(src).toContain("VoicePreviewScope");
  });

  it("synthesis reuses the chat-read-aloud function with the one shared line", () => {
    const src = read("../lib/voicePreview.ts");
    expect(src).toContain("chat-read-aloud");
    expect(src).toContain("VOICE_PREVIEW_LINE");
  });
});
