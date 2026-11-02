import { Camera } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { SIMLI_FACE_CATALOG } from "@/lib/simliFaceCatalog";

// A diverse, professional subset of the Simli preset library, Aspen first.
const GALLERY_FACE_IDS = [
  'ed8fedd9-6c86-4dc5-bb3a-017c06146efc', // Aspen
  'bf13113a-355a-4d97-8b90-4edccd1da7b2', // Anna
  'f735e62c-dce7-4c0b-8e85-1c7e21774c45', // Sara
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
    <h2 className="text-2xl sm:text-3xl font-bold mb-3">{pt ? 'Escolha entre dezenas de avatares humanos ao vivo — ou dê vida à sua própria foto.' : es ? 'Elige entre docenas de avatares humanos en vivo — o dale vida a tu propia foto.' : 'Choose from dozens of live human avatars — or bring your own photo to life.'}</h2>
    <p className="text-sm text-muted-foreground max-w-3xl mb-6">{pt ? 'Cada avatar transmite em direto no seu site — um rosto real a falar com os seus clientes com uma voz natural. Escolha um da biblioteca, ou carregue a sua própria foto e veja-a ganhar vida. Use uma das nossas vozes — ou a sua: carregue um clipe ou grave a sua voz, e o seu avatar falará com ela.' : es ? 'Cada avatar se transmite en vivo en tu sitio web: un rostro real que habla con tus clientes con una voz natural. Elige uno de la biblioteca o sube tu propia foto y mírala cobrar vida. Usa una de nuestras voces — o la tuya: sube un clip o graba tu voz y tu avatar hablará con ella.' : 'Every avatar streams live on your website — a real face talking with your customers in a natural voice. Pick one from the library, or upload your own photo and watch it come alive. Use one of our voices — or your own: upload a clip or record your voice, and your avatar speaks with it.'}</p>
    <div className="grid grid-cols-3 gap-3 sm:gap-5 max-w-3xl">
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
    <p className="text-xs text-muted-foreground mt-6">{pt ? 'Os avatares da biblioteca estão incluídos em todos os planos. O seu avatar com a sua própria foto: configuração única de $50.' : es ? 'Los avatares de la biblioteca están incluidos en todos los planes. Tu avatar con tu propia foto: configuración única de $50.' : 'Library avatars are included in every plan. Your own photo avatar: one-time $50 setup.'}</p>
  </div></section>;
};
export default AvatarGallerySection;
