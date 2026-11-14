// Starving Simli's returned stream audio (volume-stream fix,
// 2026-11-14): the walk over simli-client's unexposed LiveKit Room
// must reach the audio publication through several SDK shapes,
// degrade one rung at a time, and never throw — the element mute is
// always the floor, this only decides whether an RTC audio receiver
// stays live in the page at all.
import { describe, expect, it, vi } from "vitest";
import { starveSimliStreamAudio, simliAudioTrackState } from "@/lib/simliStreamAudio";

const roomClient = (publications: unknown[]) => ({
  connection: {
    pc: {
      remoteParticipants: new Map([
        ["simli", { trackPublications: new Map(publications.map((p, i) => [`pub-${i}`, p])) }],
      ]),
    },
  },
});

describe("starveSimliStreamAudio", () => {
  it("unsubscribes the audio publication (the SFU stops sending it)", () => {
    const setSubscribed = vi.fn();
    const client = roomClient([
      { kind: "video", setSubscribed: vi.fn() },
      { kind: "audio", setSubscribed, track: { kind: "audio" } },
    ]);
    expect(starveSimliStreamAudio(client)).toBe("unsubscribed");
    expect(setSubscribed).toHaveBeenCalledWith(false);
  });

  it("detaches the track when the publication has no subscription control", () => {
    const detach = vi.fn();
    const client = roomClient([{ kind: "audio", track: { kind: "audio", detach } }]);
    expect(starveSimliStreamAudio(client)).toBe("detached");
    expect(detach).toHaveBeenCalled();
  });

  it("reports muted-only when a track exists but neither control is reachable", () => {
    const client = roomClient([{ kind: "audio", track: { kind: "audio" } }]);
    expect(starveSimliStreamAudio(client)).toBe("muted-only");
  });

  it("the weakest publication decides — a video pub never counts, a stuck audio pub downgrades", () => {
    const client = roomClient([
      { kind: "audio", setSubscribed: vi.fn(), track: { kind: "audio" } },
      { kind: "audio", track: { kind: "audio" } },
    ]);
    expect(starveSimliStreamAudio(client)).toBe("muted-only");
  });

  it("unavailable when the internals cannot be walked (no room / no connection / null)", () => {
    expect(starveSimliStreamAudio(null)).toBe("unavailable");
    expect(starveSimliStreamAudio({})).toBe("unavailable");
    expect(starveSimliStreamAudio({ connection: {} })).toBe("unavailable");
    expect(starveSimliStreamAudio({ connection: { pc: { remoteParticipants: new Map() } } })).toBe("unavailable");
  });

  it("never throws on hostile shapes (throwing getters, non-map collections)", () => {
    const hostile = { get connection() { throw new Error("boom"); } };
    expect(starveSimliStreamAudio(hostile)).toBe("unavailable");
    const plainObjectRoom = {
      connection: { pc: { remoteParticipants: { p1: { trackPublications: { a: { kind: "audio", setSubscribed: vi.fn(), track: { kind: "audio" } } } } } } },
    };
    expect(starveSimliStreamAudio(plainObjectRoom)).toBe("unsubscribed");
  });
});

describe("simliAudioTrackState", () => {
  it("live while a subscribed audio track renders", () => {
    const client = roomClient([{ kind: "audio", track: { kind: "audio", isMuted: false, mediaStreamTrack: { readyState: "live" } } }]);
    expect(simliAudioTrackState(client)).toBe("live");
  });

  it("absent once the publication's track is gone (post-unsubscribe)", () => {
    const client = roomClient([{ kind: "audio", track: undefined }]);
    expect(simliAudioTrackState(client)).toBe("absent");
    expect(simliAudioTrackState(null)).toBe("absent");
    expect(simliAudioTrackState({})).toBe("absent");
  });

  it("muted and ended are reported as such", () => {
    expect(simliAudioTrackState(roomClient([{ kind: "audio", track: { kind: "audio", isMuted: true, mediaStreamTrack: { readyState: "live" } } }]))).toBe("muted");
    expect(simliAudioTrackState(roomClient([{ kind: "audio", track: { kind: "audio", isMuted: false, mediaStreamTrack: { readyState: "ended" } } }]))).toBe("ended");
  });

  it("a live track anywhere wins over muted/ended elsewhere", () => {
    const client = roomClient([
      { kind: "audio", track: { kind: "audio", isMuted: true, mediaStreamTrack: { readyState: "live" } } },
      { kind: "audio", track: { kind: "audio", isMuted: false, mediaStreamTrack: { readyState: "live" } } },
    ]);
    expect(simliAudioTrackState(client)).toBe("live");
  });
});
