import { Camera } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { SIMLI_FACE_CATALOG } from "@/lib/simliFaceCatalog";

// A diverse, professional subset of the Simli preset library, Aspen first.
const GALLERY_FACE_IDS = [
  'ed8fedd9-6c86-4dc5-bb3a-017c06146efc', // Aspen
  'bf13113a-355a-4d97-8b90-4edccd1da7b2', // Anna
  '084479bf-de7c-4df0-8d9c-5484193ecd27', // Mei
  'a36d66df-a23d-4569-996b-d0e990019857', // Lukas
  'a6d08e06-038a-4b32-84ae-b02e0f0f1140', // Zahra
  '9fcd5739-bf66-49a5-b525-d02d7f0bc2fc', // Hank
  '99126e69-c224-404c-9aed-80805c1c9a94', // Sophie
];

const AvatarGallerySection = () => {
  const { i18n } = useTranslation();
  const pt = i18n.language.startsWith('pt'); const es = i18n.language.startsWith('es');
  const faces = GALLERY_FACE_IDS
    .map(id => SIMLI_FACE_CATALOG.find(face => face.id === id))
    .filter(face => face?.image);
  const yourPhotoLabel = pt ? 'A sua foto' : es ? 'Tu foto' : 'Your photo';
  return <section className="py-12 sm:py-16"><div className="container mx-auto px-5 sm:px-6">
    <h2 className="text-2xl sm:text-3xl font-bold mb-3">{pt ? 'Escolha o seu rosto — ou use a sua própria foto.' : es ? 'Elige tu rostro — o usa tu propia foto.' : 'Pick your face — or use your own photo.'}</h2>
    <p className="text-sm text-muted-foreground mb-6">{pt ? 'Cada plano inclui um avatar de vídeo ao vivo. Escolha um dos nossos — ou torne-o seu com a sua própria foto.' : es ? 'Cada plan incluye un avatar de video en vivo. Elige uno de los nuestros — o hazlo tuyo con tu propia foto.' : 'Every plan includes a live video avatar. Pick one of ours — or make it yours with your own photo.'}</p>
    <div className="grid grid-cols-4 md:grid-cols-8 gap-3 sm:gap-5">
      {faces.map(face => <figure key={face!.id} className="flex flex-col items-center gap-2">
        <img src={face!.image} alt={face!.name.split(' · ')[0]} loading="lazy" className="aspect-square w-full rounded-lg border border-border object-cover" />
        <figcaption className="text-xs text-muted-foreground">{face!.name.split(' · ')[0]}</figcaption>
      </figure>)}
      <figure className="flex flex-col items-center gap-2">
        <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-card text-muted-foreground">
          <Camera className="h-8 w-8" />
        </div>
        <figcaption className="text-xs text-muted-foreground">{yourPhotoLabel}</figcaption>
      </figure>
    </div>
  </div></section>;
};
export default AvatarGallerySection;
