/**
 * Gallery thumbnail maps — generated from the real capture assets
 * present in src/assets (realtor captures: 2026-11-15/17 re-shoots;
 * B2B captures: 2026-11-18 in-session shoot). An example whose
 * capture files are absent simply has no entry and is filtered out
 * of the gallery — never rendered with a placeholder.
 *
 * 2026-11-21 re-shoot: the stills whose in-session shots had caught
 * the scan-summary fallback or an unloaded site (desktop: Cusack,
 * Perez, Andriot, Saperstein, Steinberg, Melrose; mobile: Spodak,
 * Cusack, Perez, Sexsmith, Andriot, Walter, Martinez) were re-shot
 * from the leads' current stored demo captures — the same captures
 * the demos themselves run on (Perez mobile from her stored mobile
 * capture; the other mobile stills from the desktop capture the
 * phone demo falls back to).
 *
 * 2026-11-21 (az-pools): the AZ Pools LLC stills were shot from its
 * stored demo capture the same way — desktop from the stored desktop
 * capture; mobile from that same desktop capture (no stored mobile
 * capture on the lead; the phone demo falls back to it).
 */

import thumbSpodakDentalMobile from "@/assets/b2b-example-spodak-dental-mobile.webp";
import thumbSpodakDental from "@/assets/b2b-example-spodak-dental.webp";
import thumbTsRoofing from "@/assets/b2b-example-ts-roofing.webp";
import thumbAzPoolsMobile from "@/assets/b2b-example-az-pools-mobile.webp";
import thumbAzPools from "@/assets/b2b-example-az-pools.webp";
import thumbAnnChamberlainMobile from "@/assets/realtor-example-ann-chamberlain-mobile.webp";
import thumbAnnChamberlain from "@/assets/realtor-example-ann-chamberlain.webp";
import thumbAshleyCusackMobile from "@/assets/realtor-example-ashley-cusack-mobile.webp";
import thumbAshleyCusack from "@/assets/realtor-example-ashley-cusack.webp";
import thumbAureliaPerezMobile from "@/assets/realtor-example-aurelia-perez-mobile.webp";
import thumbAureliaPerez from "@/assets/realtor-example-aurelia-perez.webp";
import thumbBaldemarDeleonMobile from "@/assets/realtor-example-baldemar-deleon-mobile.webp";
import thumbBaldemarDeleon from "@/assets/realtor-example-baldemar-deleon.webp";
import thumbDanielleLazierMobile from "@/assets/realtor-example-danielle-lazier-mobile.webp";
import thumbDanielleLazier from "@/assets/realtor-example-danielle-lazier.webp";
import thumbGianSexsmithMobile from "@/assets/realtor-example-gian-sexsmith-mobile.webp";
import thumbGianSexsmith from "@/assets/realtor-example-gian-sexsmith.webp";
import thumbJeanLucAndriotMobile from "@/assets/realtor-example-jean-luc-andriot-mobile.webp";
import thumbJeanLucAndriot from "@/assets/realtor-example-jean-luc-andriot.webp";
import thumbJulieMelroseMobile from "@/assets/realtor-example-julie-melrose-mobile.webp";
import thumbJulieMelrose from "@/assets/realtor-example-julie-melrose.webp";
import thumbLoganWalterMobile from "@/assets/realtor-example-logan-walter-mobile.webp";
import thumbLoganWalter from "@/assets/realtor-example-logan-walter.webp";
import thumbMauricioBarbaMobile from "@/assets/realtor-example-mauricio-barba-mobile.webp";
import thumbMauricioBarba from "@/assets/realtor-example-mauricio-barba.webp";
import thumbMichaelMartinezMobile from "@/assets/realtor-example-michael-martinez-mobile.webp";
import thumbMichaelMartinez from "@/assets/realtor-example-michael-martinez.webp";
import thumbPaulSapersteinMobile from "@/assets/realtor-example-paul-saperstein-mobile.webp";
import thumbPaulSaperstein from "@/assets/realtor-example-paul-saperstein.webp";
import thumbRayMiramontesMobile from "@/assets/realtor-example-ray-miramontes-mobile.webp";
import thumbRayMiramontes from "@/assets/realtor-example-ray-miramontes.webp";
import thumbRichardSteinbergMobile from "@/assets/realtor-example-richard-steinberg-mobile.webp";
import thumbRichardSteinberg from "@/assets/realtor-example-richard-steinberg.webp";

export const EXAMPLE_THUMBS: Record<string, string> = {
  "spodak-dental": thumbSpodakDental,
  "ts-roofing": thumbTsRoofing,
  "az-pools": thumbAzPools,
  "ann-chamberlain": thumbAnnChamberlain,
  "ashley-cusack": thumbAshleyCusack,
  "aurelia-perez": thumbAureliaPerez,
  "baldemar-deleon": thumbBaldemarDeleon,
  "danielle-lazier": thumbDanielleLazier,
  "gian-sexsmith": thumbGianSexsmith,
  "jean-luc-andriot": thumbJeanLucAndriot,
  "julie-melrose": thumbJulieMelrose,
  "logan-walter": thumbLoganWalter,
  "mauricio-barba": thumbMauricioBarba,
  "michael-martinez": thumbMichaelMartinez,
  "paul-saperstein": thumbPaulSaperstein,
  "ray-miramontes": thumbRayMiramontes,
  "richard-steinberg": thumbRichardSteinberg,
};

export const EXAMPLE_THUMBS_MOBILE: Record<string, string> = {
  "spodak-dental": thumbSpodakDentalMobile,
  "az-pools": thumbAzPoolsMobile,
  "ann-chamberlain": thumbAnnChamberlainMobile,
  "ashley-cusack": thumbAshleyCusackMobile,
  "aurelia-perez": thumbAureliaPerezMobile,
  "baldemar-deleon": thumbBaldemarDeleonMobile,
  "danielle-lazier": thumbDanielleLazierMobile,
  "gian-sexsmith": thumbGianSexsmithMobile,
  "jean-luc-andriot": thumbJeanLucAndriotMobile,
  "julie-melrose": thumbJulieMelroseMobile,
  "logan-walter": thumbLoganWalterMobile,
  "mauricio-barba": thumbMauricioBarbaMobile,
  "michael-martinez": thumbMichaelMartinezMobile,
  "paul-saperstein": thumbPaulSapersteinMobile,
  "ray-miramontes": thumbRayMiramontesMobile,
  "richard-steinberg": thumbRichardSteinbergMobile,
};
