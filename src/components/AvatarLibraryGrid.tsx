import { Button } from "@/components/ui/button";
import {
  AVATAR_LIBRARY,
  avatarLibraryEntryByFaceId,
  type AvatarLibraryEntry,
} from "@/lib/avatarLibrary";
import type { AvatarFace } from "@/lib/simliFaceCatalog";

interface Props {
  selectedFaceId: string;
  /** Picking one of OUR models / a preset from the shared library. */
  onPickLibrary: (entry: AvatarLibraryEntry) => void;
  /** Extra faces that are not in the library (e.g. a tenant's own Simli
   *  faces, or the currently selected custom face) — shown after the library. */
  extraFaces?: AvatarFace[];
  onPickExtra?: (face: AvatarFace) => void;
}

const tileChoice = (active: boolean) =>
  `h-auto justify-start whitespace-normal rounded-lg border-2 p-2 text-left text-sm transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`;

function LibraryTile({
  entry,
  active,
  onPick,
}: {
  entry: AvatarLibraryEntry;
  active: boolean;
  onPick: (entry: AvatarLibraryEntry) => void;
}) {
  return (
    <Button
      variant="outline"
      className={`${tileChoice(active)} flex-col items-stretch`}
      aria-pressed={active}
      aria-label={`Choose face ${entry.label}`}
      onClick={() => onPick(entry)}
    >
      {entry.image && (
        <img
          src={entry.image}
          alt={entry.label}
          loading="lazy"
          width={240}
          height={240}
          className="mb-1 aspect-square w-full rounded-md object-cover"
        />
      )}
      <p className="text-xs font-semibold">{entry.label}</p>
      {entry.matchedVoice ? (
        <span className="text-[10px] text-muted-foreground">Voice · {entry.matchedVoice}</span>
      ) : entry.category ? (
        <span className="text-[10px] text-muted-foreground">{entry.category}</span>
      ) : null}
    </Button>
  );
}

function ExtraTile({
  face,
  active,
  onPick,
}: {
  face: AvatarFace;
  active: boolean;
  onPick: (face: AvatarFace) => void;
}) {
  return (
    <Button
      variant="outline"
      className={`${tileChoice(active)} flex-col items-stretch`}
      aria-pressed={active}
      aria-label={`Choose face ${face.name}`}
      onClick={() => onPick(face)}
    >
      {face.image ? (
        <img
          src={face.image}
          alt={face.name}
          loading="lazy"
          width={240}
          height={240}
          className="mb-1 aspect-square w-full rounded-md object-cover"
        />
      ) : (
        <span className="mb-1 flex aspect-square w-full items-center justify-center rounded-md bg-muted text-lg font-semibold text-muted-foreground">
          {face.name.slice(0, 1)}
        </span>
      )}
      <p className="text-xs font-semibold">{face.name}</p>
      {face.category && <span className="text-[10px] text-muted-foreground">{face.category}</span>}
    </Button>
  );
}

/**
 * The scrollable avatar-library picker: our models first (Aspen, created
 * customs, Sara, Alex), then the Simli standard presets, then any extra
 * faces the caller supplies. Square tiles, portrait + name under each,
 * one selected state. Shared by the setup wizard, the admin Video Avatars
 * page and the admin setup tab so every surface offers the same library.
 */
export default function AvatarLibraryGrid({ selectedFaceId, onPickLibrary, extraFaces = [], onPickExtra }: Props) {
  const own = AVATAR_LIBRARY.filter((e) => e.own);
  const presets = AVATAR_LIBRARY.filter((e) => !e.own);
  const extras = extraFaces.filter((f) => !avatarLibraryEntryByFaceId(f.id));
  return (
    <div className="max-h-96 space-y-3 overflow-y-auto pr-0.5">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Our avatars</p>
        <div className="grid grid-cols-3 gap-2">
          {own.map((entry) => (
            <LibraryTile key={entry.key} entry={entry} active={selectedFaceId === entry.faceId} onPick={onPickLibrary} />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Simli standard faces</p>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((entry) => (
            <LibraryTile key={entry.key} entry={entry} active={selectedFaceId === entry.faceId} onPick={onPickLibrary} />
          ))}
        </div>
      </div>
      {extras.length > 0 && onPickExtra && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Your faces</p>
          <div className="grid grid-cols-3 gap-2">
            {extras.map((face) => (
              <ExtraTile key={face.id} face={face} active={selectedFaceId === face.id} onPick={onPickExtra} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
