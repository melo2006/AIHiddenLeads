import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarLibraryGrid from "@/components/AvatarLibraryGrid";
import AvatarSettings from "@/components/AvatarSettings";
import {
  ASPEN_FACE_ID,
  EXECUTIVE_D_FACE_ID,
  FRANK_FACE_ID,
  LATINA_FACE_ID,
} from "@/lib/avatarLibrary";
import { DEFAULT_VIDEO_AVATAR, type VideoAvatar } from "../../supabase/functions/_shared/video-avatar";

// Isolate the picker wiring: the live Simli/Gemini surfaces and the clone
// panel are not what is under test here.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: { unlocked: false }, error: null })) } },
}));
vi.mock("@/components/SimliAvatar", () => ({ default: () => null }));
vi.mock("@/components/GeminiConversation", () => ({ default: () => null }));
vi.mock("@/components/VoiceClonePanel", () => ({ default: () => null }));

// jsdom has no ResizeObserver; AvatarDevicePreview requires one.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => cleanup());

const tileButtons = () => screen.getAllByRole("button", { name: /^Choose face / });

describe("AvatarLibraryGrid", () => {
  it("renders our models first, in library order, with the selected tile pressed", () => {
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={vi.fn()} />);
    const labels = tileButtons().slice(0, 7).map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Choose face Aspen",
      "Choose face Frank",
      "Choose face Latina",
      "Choose face Black Professional Lady",
      "Choose face Executive",
      "Choose face Sara",
      "Choose face Alex",
    ]);
    expect(screen.getByRole("button", { name: "Choose face Aspen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Choose face Frank" })).toHaveAttribute("aria-pressed", "false");
  });

  it("hands the picked library entry to the caller", () => {
    const onPick = vi.fn();
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose face Frank" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ faceId: FRANK_FACE_ID, label: "Frank", suggestedName: "Frank", matchedVoice: "Charon" });
  });
});

describe("AvatarSettings — library pick wiring", () => {
  function renderSettings() {
    const onChange = vi.fn();
    const onVoiceChange = vi.fn();
    const onNameChange = vi.fn();
    const value: VideoAvatar = { ...DEFAULT_VIDEO_AVATAR, enabled: true };
    render(
      <AvatarSettings
        value={value}
        onChange={onChange}
        voice="Kore"
        onVoiceChange={onVoiceChange}
        name="Aspen"
        onNameChange={onNameChange}
      />,
    );
    return { onChange, onVoiceChange, onNameChange };
  }

  it("picking Frank sets the face, applies Charon and pre-fills the name Frank", () => {
    const { onChange, onVoiceChange, onNameChange } = renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Choose face Frank" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ faceId: FRANK_FACE_ID }));
    expect(onVoiceChange).toHaveBeenCalledWith("Charon");
    expect(onNameChange).toHaveBeenCalledWith("Frank");
  });

  it("picking Latina sets face + matched voice but never a name", () => {
    const { onChange, onVoiceChange, onNameChange } = renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Choose face Latina" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ faceId: LATINA_FACE_ID }));
    expect(onVoiceChange).toHaveBeenCalledWith("Sulafat");
    expect(onNameChange).not.toHaveBeenCalled();
  });

  it("picking Executive sets face + matched voice but never a name", () => {
    const { onChange, onVoiceChange, onNameChange } = renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Choose face Executive" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ faceId: EXECUTIVE_D_FACE_ID }));
    expect(onVoiceChange).toHaveBeenCalledTimes(1);
    expect(onNameChange).not.toHaveBeenCalled();
  });

  it("picking a Simli preset sets only the face", () => {
    const { onChange, onVoiceChange, onNameChange } = renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Choose face Anna" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].faceId).not.toBe(FRANK_FACE_ID);
    expect(onVoiceChange).not.toHaveBeenCalled();
    expect(onNameChange).not.toHaveBeenCalled();
  });

  it("renaming the assistant afterwards leaves the library tile untouched", () => {
    const { onNameChange } = renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Choose face Frank" }));
    expect(onNameChange).toHaveBeenCalledWith("Frank");
    // The parent now renames their assistant; the tile keeps the library label.
    cleanup();
    const value: VideoAvatar = { ...DEFAULT_VIDEO_AVATAR, enabled: true, faceId: FRANK_FACE_ID };
    render(<AvatarSettings value={value} onChange={vi.fn()} voice="Charon" name="Francesco" />);
    expect(screen.getByRole("button", { name: "Choose face Frank" })).toHaveAttribute("aria-pressed", "true");
  });

  it("labels the live preview as hearing the assistant with the chosen voice", () => {
    const value: VideoAvatar = { ...DEFAULT_VIDEO_AVATAR, enabled: true, faceId: FRANK_FACE_ID };
    render(<AvatarSettings value={value} onChange={vi.fn()} agentId="agent-1" voice="Charon" name="Frank" />);
    expect(screen.getByRole("button", { name: "Preview: hear Frank with this voice" })).toBeInTheDocument();
  });
});
