// Verified Simli preset catalog: https://docs.simli.com/api-reference/preset-faces
import aspen from '@/assets/aspen-video-frame-final.webp';
import frankFace from '@/assets/simli/b3f85f7f-57ea-4f24-b1f6-a57229b4fae1.webp';
import latinaFace from '@/assets/simli/e0d7b128-40a7-4d03-ac84-ef4c54b92450.webp';
import blackProfessionalLadyFace from '@/assets/simli/9344d4c1-6b69-43e7-a73f-ddc15d1a3f75.webp';
import face0 from '@/assets/simli/bf13113a-355a-4d97-8b90-4edccd1da7b2.webp';
import face1 from '@/assets/simli/f735e62c-dce7-4c0b-8e85-1c7e21774c45.webp';
import face2 from '@/assets/simli/084479bf-de7c-4df0-8d9c-5484193ecd27.webp';
import face3 from '@/assets/simli/5a83913c-411b-4afd-8432-b7d685e2aee6.webp';
import face4 from '@/assets/simli/a36d66df-a23d-4569-996b-d0e990019857.webp';
import face5 from '@/assets/simli/99767950-9d68-4783-a305-9118006d3363.webp';
import face6 from '@/assets/simli/3dcb9c78-8822-4e6e-913f-b629c602524a.webp';
import face7 from '@/assets/simli/c060fe44-9b14-43e8-b92c-83a0e230db11.webp';
import face8 from '@/assets/simli/80459b57-2d66-4ca7-8682-59e1c649bc53.webp';
import face9 from '@/assets/simli/a6d08e06-038a-4b32-84ae-b02e0f0f1140.webp';
import face10 from '@/assets/simli/9fcd5739-bf66-49a5-b525-d02d7f0bc2fc.webp';
import face11 from '@/assets/simli/3bad681f-1b4a-4507-bc54-fbc675c191b7.webp';
import face12 from '@/assets/simli/66d1f5af-9b9b-49e2-a97f-6f5f3d59a2d5.webp';
import face13 from '@/assets/simli/8b1a04c8-b548-452f-bf7f-04907ea9720f.webp';
import face14 from '@/assets/simli/03ce3ee8-db97-4150-a333-8f643d48fee9.webp';
import face15 from '@/assets/simli/99126e69-c224-404c-9aed-80805c1c9a94.webp';
import face16 from '@/assets/simli/9291a1e2-8290-43ab-b5e1-4a5cdf147402.webp';
import face17 from '@/assets/simli/c1cf7312-5b70-454b-a3c2-a0b0b7e32caf.webp';
import face18 from '@/assets/simli/1d032d8b-0cff-4156-9f0d-f001f0738d9c.webp';
import face19 from '@/assets/simli/545fe1a4-2e42-4b11-81fc-fe0ac8aec4b7.webp';
import face20 from '@/assets/simli/a0426978-2a35-48e1-b353-9afc7538054a.webp';
import face21 from '@/assets/simli/20cfe7d7-cfd7-43ee-9301-72a7c7056eaf.webp';
import face22 from '@/assets/simli/d9c96b08-b2ca-48ef-b458-5c4471d9fe09.webp';
import face23 from '@/assets/simli/fe23cfe4-7d21-48d9-96c1-54aa673b6003.webp';
import face24 from '@/assets/simli/f8df388d-761a-4f0c-bfbd-ff2f6277fbe3.webp';
import face25 from '@/assets/simli/8ef039c1-06d7-4ea7-b01c-6b620c755a92.webp';
import face26 from '@/assets/simli/efcb440b-6a24-4e79-a46a-764c1d4b751d.webp';
import face27 from '@/assets/simli/fb78d7f5-37ad-4b04-9789-8712dcaa791d.webp';
export interface AvatarFace { id: string; name: string; image?: string; category?: string; generation?: boolean; }
export const SIMLI_FACE_CATALOG: AvatarFace[] = [
  { id: 'ed8fedd9-6c86-4dc5-bb3a-017c06146efc', name: 'Aspen · closed smile', image: aspen, category: 'Your face', generation: true },
  { id: "b3f85f7f-57ea-4f24-b1f6-a57229b4fae1", name: "Frank · Senior Owner", category: "Your face", image: frankFace, generation: true },
  { id: "e0d7b128-40a7-4d03-ac84-ef4c54b92450", name: "Latina · Green Eyes", category: "Your face", image: latinaFace, generation: true },
  { id: "9344d4c1-6b69-43e7-a73f-ddc15d1a3f75", name: "Black Professional Lady", category: "Your face", image: blackProfessionalLadyFace, generation: true },
  { id: "bf13113a-355a-4d97-8b90-4edccd1da7b2", name: "Anna", category: "Standard", image: face0 },
  { id: "f735e62c-dce7-4c0b-8e85-1c7e21774c45", name: "Sara", category: "Standard", image: face1 },
  { id: "084479bf-de7c-4df0-8d9c-5484193ecd27", name: "Mei", category: "Standard", image: face2 },
  { id: "5a83913c-411b-4afd-8432-b7d685e2aee6", name: "Claire", category: "Standard", image: face3 },
  { id: "a36d66df-a23d-4569-996b-d0e990019857", name: "Lukas", category: "Standard", image: face4 },
  { id: "99767950-9d68-4783-a305-9118006d3363", name: "Mateo", category: "Standard", image: face5 },
  { id: "3dcb9c78-8822-4e6e-913f-b629c602524a", name: "Jordan", category: "Standard", image: face6 },
  { id: "c060fe44-9b14-43e8-b92c-83a0e230db11", name: "Kate", category: "Standard", image: face7 },
  { id: "80459b57-2d66-4ca7-8682-59e1c649bc53", name: "Elena", category: "Standard", image: face8 },
  { id: "a6d08e06-038a-4b32-84ae-b02e0f0f1140", name: "Zahra", category: "Standard", image: face9 },
  { id: "9fcd5739-bf66-49a5-b525-d02d7f0bc2fc", name: "Hank", category: "Standard", image: face10 },
  { id: "3bad681f-1b4a-4507-bc54-fbc675c191b7", name: "Victor", category: "Standard", image: face11 },
  { id: "66d1f5af-9b9b-49e2-a97f-6f5f3d59a2d5", name: "Tina", category: "Standard", image: face12 },
  { id: "8b1a04c8-b548-452f-bf7f-04907ea9720f", name: "Lina", category: "Standard", image: face13 },
  { id: "03ce3ee8-db97-4150-a333-8f643d48fee9", name: "Daniel", category: "Standard", image: face14 },
  { id: "99126e69-c224-404c-9aed-80805c1c9a94", name: "Sophie", category: "Standard", image: face15 },
  { id: "9291a1e2-8290-43ab-b5e1-4a5cdf147402", name: "Doctor", category: "Standard", image: face16 },
  { id: "c1cf7312-5b70-454b-a3c2-a0b0b7e32caf", name: "Fred", category: "Standard", image: face17 },
  { id: "1d032d8b-0cff-4156-9f0d-f001f0738d9c", name: "Margaret", category: "Standard", image: face18 },
  { id: "545fe1a4-2e42-4b11-81fc-fe0ac8aec4b7", name: "Kenji", category: "Stylized", image: face19 },
  { id: "a0426978-2a35-48e1-b353-9afc7538054a", name: "Nova", category: "Stylized", image: face20 },
  { id: "20cfe7d7-cfd7-43ee-9301-72a7c7056eaf", name: "Ethan", category: "Stylized", image: face21 },
  { id: "d9c96b08-b2ca-48ef-b458-5c4471d9fe09", name: "Professor Gearwright", category: "Stylized", image: face22 },
  { id: "fe23cfe4-7d21-48d9-96c1-54aa673b6003", name: "Grace", category: "Stylized", image: face23 },
  { id: "f8df388d-761a-4f0c-bfbd-ff2f6277fbe3", name: "Hana", category: "Stylized", image: face24 },
  { id: "8ef039c1-06d7-4ea7-b01c-6b620c755a92", name: "Ruby", category: "Stylized", image: face25 },
  { id: "efcb440b-6a24-4e79-a46a-764c1d4b751d", name: "Caesar", category: "Stylized", image: face26 },
  { id: "fb78d7f5-37ad-4b04-9789-8712dcaa791d", name: "Big Foot", category: "Stylized", image: face27 },
];
