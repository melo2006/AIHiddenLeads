import { useState } from "react";
import {
  AVATAR_LIBRARY,
  avatarLibraryEntryByFaceId,
  type AvatarLibraryEntry,
} from "@/lib/avatarLibrary";
import type { AvatarFace } from "@/lib/simliFaceCatalog";
import AvatarPortraitLightbox, { PortraitViewButton } from "@/components/AvatarPortraitLightbox";
import { cn } from "@/lib/utils";

interface Props {
  selectedFaceId: string;
  /** Picking one of OUR models / a preset from the shared library. */
  onPickLibrary: (entry: AvatarLibraryEntry) => void;
  /** Extra faces that are not in the library (e.g. a tenant's own Simli
   *  faces, or the currently selected custom face) — shown after the library. */
  extraFaces?: AvatarFace[];
  onPickExtra?: (face: AvatarFace) => void;
}

/** What the lightbox is currently showing, and how picking from inside
 *  it routes back to the caller's handlers. */
type Viewing =
  | { kind: "library"; entry: AvatarLibraryEntry }
  | { kind: "extra"; face: AvatarFace };

// The tile card: border + selected wash live on the card itself now
// (the portrait and the name are separate buttons inside it — see
// LibraryTile), with a pointer-only hover glow so touch taps never
// leave a stuck highlight.
const tileCard = (active: boolean) =>
  cn(
    "flex flex-col rounded-lg border-2 p-2 text-left text-sm transition",
    active
      ? "border-primary bg-primary/10"
      : "border-border [@media(hover:hover)]:hover:border-primary/60 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:shadow-primary/10",
  );

function LibraryTile({
  entry,
  active,
  onPick,
  onView,
}: {
  entry: AvatarLibraryEntry;
  active: boolean;
  onPick: (entry: AvatarLibraryEntry) => void;
  onView: (entry: AvatarLibraryEntry) => void;
}) {
  return (
    <div className={tileCard(active)}>
      {entry.image && (
        <PortraitViewButton
          name={entry.label}
          image={entry.image}
          onView={() => onView(entry)}
          className="mb-1 rounded-md"
        />
      )}
      <button
        type="button"
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-pressed={active}
        aria-label={`Choose face ${entry.label}`}
        onClick={() => onPick(entry)}
      >
        <p className="text-xs font-semibold">{entry.label}</p>
        {entry.matchedVoice ? (
          <span className="text-[10px] text-muted-foreground">Voice · {entry.matchedVoice}</span>
        ) : entry.category ? (
          <span className="text-[10px] text-muted-foreground">{entry.category}</span>
        ) : null}
      </button>
    </div>
  );
}

function ExtraTile({
  face,
  active,
  onPick,
  onView,
}: {
  face: AvatarFace;
  active: boolean;
  onPick: (face: AvatarFace) => void;
  onView: (face: AvatarFace) => void;
}) {
  return (
    <div className={tileCard(active)}>
      {face.image ? (
        <PortraitViewButton
          name={face.name}
          image={face.image}
          onView={() => onView(face)}
          className="mb-1 rounded-md"
        />
      ) : (
        <span className="mb-1 flex aspect-square w-full items-center justify-center rounded-md bg-muted text-lg font-semibold text-muted-foreground">
          {face.name.slice(0, 1)}
        </span>
      )}
      <button
        type="button"
        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-pressed={active}
        aria-label={`Choose face ${face.name}`}
        onClick={() => onPick(face)}
      >
        <p className="text-xs font-semibold">{face.name}</p>
        {face.category && <span className="text-[10px] text-muted-foreground">{face.category}</span>}
      </button>
    </div>
  );
}

/**
 * The scrollable avatar-library picker: our models first (Aspen, created
 * customs, Sara, Alex), then the Simli standard presets, then any extra
 * faces the caller supplies. Square tiles, portrait + name under each,
 * one selected state. Shared by the setup wizard, the admin Video Avatars
 * page and the admin setup tab so every surface offers the same library.
 *
 * Ron (2026-11-17): the portrait and the pick are separate actions —
 * tapping the portrait opens it large (AvatarPortraitLightbox, with
 * zoom) so the face can be judged up close; the name button picks, and
 * the overlay carries its own "Use this avatar" action so viewing
 * never dead-ends the flow.
 */
export default function AvatarLibraryGrid({ selectedFaceId, onPickLibrary, extraFaces = [], onPickExtra }: Props) {
  const own = AVATAR_LIBRARY.filter((e) => e.own);
  const presets = AVATAR_LIBRARY.filter((e) => !e.own);
  const extras = extraFaces.filter((f) => !avatarLibraryEntryByFaceId(f.id));
  const [viewing, setViewing] = useState<Viewing | null>(null);

  const lightboxPerson =
    viewing?.kind === "library"
      ? {
          name: viewing.entry.label,
          image: viewing.entry.image!,
          detail: viewing.entry.matchedVoice
            ? `Voice · ${viewing.entry.matchedVoice}`
            : viewing.entry.category,
        }
      : viewing?.kind === "extra"
        ? { name: viewing.face.name, image: viewing.face.image!, detail: viewing.face.category }
        : null;

  const lightboxSelect =
    viewing?.kind === "library"
      ? {
          selected: selectedFaceId === viewing.entry.faceId,
          onSelect: () => {
            onPickLibrary(viewing.entry);
            setViewing(null);
          },
        }
      : viewing?.kind === "extra" && onPickExtra
        ? {
            selected: selectedFaceId === viewing.face.id,
            onSelect: () => {
              onPickExtra(viewing.face);
              setViewing(null);
            },
          }
        : undefined;

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto pr-0.5">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Our avatars</p>
        <div className="grid grid-cols-3 gap-2">
          {own.map((entry) => (
            <LibraryTile
              key={entry.key}
              entry={entry}
              active={selectedFaceId === entry.faceId}
              onPick={onPickLibrary}
              onView={(e) => setViewing({ kind: "library", entry: e })}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Standard faces</p>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((entry) => (
            <LibraryTile
              key={entry.key}
              entry={entry}
              active={selectedFaceId === entry.faceId}
              onPick={onPickLibrary}
              onView={(e) => setViewing({ kind: "library", entry: e })}
            />
          ))}
        </div>
      </div>
      {extras.length > 0 && onPickExtra && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Your faces</p>
          <div className="grid grid-cols-3 gap-2">
            {extras.map((face) => (
              <ExtraTile
                key={face.id}
                face={face}
                active={selectedFaceId === face.id}
                onPick={onPickExtra}
                onView={(f) => setViewing({ kind: "extra", face: f })}
              />
            ))}
          </div>
        </div>
      )}
      <AvatarPortraitLightbox
        person={lightboxPerson}
        onClose={() => setViewing(null)}
        selectAction={lightboxSelect}
      />
    </div>
  );
}
