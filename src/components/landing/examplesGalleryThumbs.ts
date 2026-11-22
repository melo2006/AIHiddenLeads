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
 *
 * 2026-11-21 panel re-shoot (Ron's call: every gallery card shows
 * the business's website WITH the Aspen panel open on it — the
 * presenter's live face and the chat panel in frame, the way a
 * finished implementation looks): the new B2B stills are true
 * in-session captures from the live demos (desktop framed to the
 * demo container, mobile the full phone frame; captions off).
 * First batch: cool-air-usa, essig-pools, paradise-plumbing
 * (desktop + mobile) and national-brick-pavers (desktop).
 *
 * 2026-11-21 panel re-shoot, second batch: true in-session stills
 * for the remaining B2B examples and the realtor re-shoots, shot
 * the same way (captions off). A few stills are composites per the
 * real-capture rule — a REAL in-session panel block over the
 * business's stored site capture at the true anchored position:
 * evo-air, septic-doctor, jj-dental (same-session frames),
 * michael-martinez, richard-steinberg desktop, spodak-dental
 * mobile.
 *
 * 2026-11-21 panel re-shoot, third batch: the parked B2B stills
 * were finished WITHOUT visiting any live business site — real
 * in-session panel blocks from the slugs' own Nov-21 session
 * frames composited over the businesses' stored demo captures
 * (pulled from the demo-capture store) at the true anchored
 * position: it-yall, lan-infotech, john-the-plumber,
 * levine-family-law, meltzer-bell (desktop + mobile),
 * ak-building-services (desktop) and septic-doctor (mobile).
 * B2B stills are now complete (36/36 desktop + mobile). Still
 * parked (no clean keyable current-design panel frame exists in
 * any stored capture; cards keep their previous still):
 * danielle-lazier (desktop + mobile), richard-steinberg mobile,
 * and the James-presenter mobile stills (logan-walter,
 * gian-sexsmith, jean-luc-andriot).
 */

import thumbSpodakDentalMobile from "@/assets/b2b-example-spodak-dental-mobile.webp";
import thumbSpodakDental from "@/assets/b2b-example-spodak-dental.webp";
import thumbTsRoofing from "@/assets/b2b-example-ts-roofing.webp";
import thumbAzPoolsMobile from "@/assets/b2b-example-az-pools-mobile.webp";
import thumbAzPools from "@/assets/b2b-example-az-pools.webp";
import thumbCoolAirUsaMobile from "@/assets/b2b-example-cool-air-usa-mobile.webp";
import thumbCoolAirUsa from "@/assets/b2b-example-cool-air-usa.webp";
import thumbEssigPoolsMobile from "@/assets/b2b-example-essig-pools-mobile.webp";
import thumbEssigPools from "@/assets/b2b-example-essig-pools.webp";
import thumbNationalBrickPavers from "@/assets/b2b-example-national-brick-pavers.webp";
import thumbParadisePlumbingMobile from "@/assets/b2b-example-paradise-plumbing-mobile.webp";
import thumbParadisePlumbing from "@/assets/b2b-example-paradise-plumbing.webp";
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

import thumbA2zMarine from "@/assets/b2b-example-a2z-marine.webp";
import thumbAkBuildingServices from "@/assets/b2b-example-ak-building-services.webp";
import thumbAmairaMedspa from "@/assets/b2b-example-amaira-medspa.webp";
import thumbAncoPrecision from "@/assets/b2b-example-anco-precision.webp";
import thumbAstManufacturing from "@/assets/b2b-example-ast-manufacturing.webp";
import thumbAutoscope from "@/assets/b2b-example-autoscope.webp";
import thumbBosGenerators from "@/assets/b2b-example-bos-generators.webp";
import thumbCableMarine from "@/assets/b2b-example-cable-marine.webp";
import thumbCentralBrowardVet from "@/assets/b2b-example-central-broward-vet.webp";
import thumbChiangwellMedical from "@/assets/b2b-example-chiangwell-medical.webp";
import thumbEvoAir from "@/assets/b2b-example-evo-air.webp";
import thumbItYall from "@/assets/b2b-example-it-yall.webp";
import thumbJjDental from "@/assets/b2b-example-jj-dental.webp";
import thumbJohnOrthodontics from "@/assets/b2b-example-john-orthodontics.webp";
import thumbJohnThePlumber from "@/assets/b2b-example-john-the-plumber.webp";
import thumbLanInfotech from "@/assets/b2b-example-lan-infotech.webp";
import thumbLevineFamilyLaw from "@/assets/b2b-example-levine-family-law.webp";
import thumbMadalonLaw from "@/assets/b2b-example-madalon-law.webp";
import thumbMamasBoyAir from "@/assets/b2b-example-mamas-boy-air.webp";
import thumbMeltzerBell from "@/assets/b2b-example-meltzer-bell.webp";
import thumbMjmManufacturing from "@/assets/b2b-example-mjm-manufacturing.webp";
import thumbPrestigeAuto from "@/assets/b2b-example-prestige-auto.webp";
import thumbPrestigeLandscape from "@/assets/b2b-example-prestige-landscape.webp";
import thumbRobsonIndustrial from "@/assets/b2b-example-robson-industrial.webp";
import thumbRoyalElectricalSupply from "@/assets/b2b-example-royal-electrical-supply.webp";
import thumbSepticDoctor from "@/assets/b2b-example-septic-doctor.webp";
import thumbToleElectric from "@/assets/b2b-example-tole-electric.webp";
import thumbTropicSupply from "@/assets/b2b-example-tropic-supply.webp";
import thumbWestwayTowing from "@/assets/b2b-example-westway-towing.webp";
import thumbA2zMarineMobile from "@/assets/b2b-example-a2z-marine-mobile.webp";
import thumbAkBuildingServicesMobile from "@/assets/b2b-example-ak-building-services-mobile.webp";
import thumbAmairaMedspaMobile from "@/assets/b2b-example-amaira-medspa-mobile.webp";
import thumbAncoPrecisionMobile from "@/assets/b2b-example-anco-precision-mobile.webp";
import thumbAstManufacturingMobile from "@/assets/b2b-example-ast-manufacturing-mobile.webp";
import thumbAutoscopeMobile from "@/assets/b2b-example-autoscope-mobile.webp";
import thumbBosGeneratorsMobile from "@/assets/b2b-example-bos-generators-mobile.webp";
import thumbCableMarineMobile from "@/assets/b2b-example-cable-marine-mobile.webp";
import thumbCentralBrowardVetMobile from "@/assets/b2b-example-central-broward-vet-mobile.webp";
import thumbChiangwellMedicalMobile from "@/assets/b2b-example-chiangwell-medical-mobile.webp";
import thumbEvoAirMobile from "@/assets/b2b-example-evo-air-mobile.webp";
import thumbItYallMobile from "@/assets/b2b-example-it-yall-mobile.webp";
import thumbJjDentalMobile from "@/assets/b2b-example-jj-dental-mobile.webp";
import thumbJohnOrthodonticsMobile from "@/assets/b2b-example-john-orthodontics-mobile.webp";
import thumbJohnThePlumberMobile from "@/assets/b2b-example-john-the-plumber-mobile.webp";
import thumbLanInfotechMobile from "@/assets/b2b-example-lan-infotech-mobile.webp";
import thumbLevineFamilyLawMobile from "@/assets/b2b-example-levine-family-law-mobile.webp";
import thumbMadalonLawMobile from "@/assets/b2b-example-madalon-law-mobile.webp";
import thumbMamasBoyAirMobile from "@/assets/b2b-example-mamas-boy-air-mobile.webp";
import thumbMeltzerBellMobile from "@/assets/b2b-example-meltzer-bell-mobile.webp";
import thumbMjmManufacturingMobile from "@/assets/b2b-example-mjm-manufacturing-mobile.webp";
import thumbNationalBrickPaversMobile from "@/assets/b2b-example-national-brick-pavers-mobile.webp";
import thumbPrestigeAutoMobile from "@/assets/b2b-example-prestige-auto-mobile.webp";
import thumbPrestigeLandscapeMobile from "@/assets/b2b-example-prestige-landscape-mobile.webp";
import thumbRobsonIndustrialMobile from "@/assets/b2b-example-robson-industrial-mobile.webp";
import thumbRoyalElectricalSupplyMobile from "@/assets/b2b-example-royal-electrical-supply-mobile.webp";
import thumbSepticDoctorMobile from "@/assets/b2b-example-septic-doctor-mobile.webp";
import thumbToleElectricMobile from "@/assets/b2b-example-tole-electric-mobile.webp";
import thumbTropicSupplyMobile from "@/assets/b2b-example-tropic-supply-mobile.webp";
import thumbWestwayTowingMobile from "@/assets/b2b-example-westway-towing-mobile.webp";

export const EXAMPLE_THUMBS: Record<string, string> = {
  "spodak-dental": thumbSpodakDental,
  "ts-roofing": thumbTsRoofing,
  "az-pools": thumbAzPools,
  "cool-air-usa": thumbCoolAirUsa,
  "essig-pools": thumbEssigPools,
  "national-brick-pavers": thumbNationalBrickPavers,
  "paradise-plumbing": thumbParadisePlumbing,
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
  "a2z-marine": thumbA2zMarine,
  "ak-building-services": thumbAkBuildingServices,
  "amaira-medspa": thumbAmairaMedspa,
  "anco-precision": thumbAncoPrecision,
  "ast-manufacturing": thumbAstManufacturing,
  "autoscope": thumbAutoscope,
  "bos-generators": thumbBosGenerators,
  "cable-marine": thumbCableMarine,
  "central-broward-vet": thumbCentralBrowardVet,
  "chiangwell-medical": thumbChiangwellMedical,
  "evo-air": thumbEvoAir,
  "it-yall": thumbItYall,
  "jj-dental": thumbJjDental,
  "john-orthodontics": thumbJohnOrthodontics,
  "john-the-plumber": thumbJohnThePlumber,
  "lan-infotech": thumbLanInfotech,
  "levine-family-law": thumbLevineFamilyLaw,
  "madalon-law": thumbMadalonLaw,
  "mamas-boy-air": thumbMamasBoyAir,
  "meltzer-bell": thumbMeltzerBell,
  "mjm-manufacturing": thumbMjmManufacturing,
  "prestige-auto": thumbPrestigeAuto,
  "prestige-landscape": thumbPrestigeLandscape,
  "robson-industrial": thumbRobsonIndustrial,
  "royal-electrical-supply": thumbRoyalElectricalSupply,
  "septic-doctor": thumbSepticDoctor,
  "tole-electric": thumbToleElectric,
  "tropic-supply": thumbTropicSupply,
  "westway-towing": thumbWestwayTowing,
};

export const EXAMPLE_THUMBS_MOBILE: Record<string, string> = {
  "spodak-dental": thumbSpodakDentalMobile,
  "az-pools": thumbAzPoolsMobile,
  "cool-air-usa": thumbCoolAirUsaMobile,
  "essig-pools": thumbEssigPoolsMobile,
  "paradise-plumbing": thumbParadisePlumbingMobile,
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
  "a2z-marine": thumbA2zMarineMobile,
  "ak-building-services": thumbAkBuildingServicesMobile,
  "amaira-medspa": thumbAmairaMedspaMobile,
  "anco-precision": thumbAncoPrecisionMobile,
  "ast-manufacturing": thumbAstManufacturingMobile,
  "autoscope": thumbAutoscopeMobile,
  "bos-generators": thumbBosGeneratorsMobile,
  "cable-marine": thumbCableMarineMobile,
  "central-broward-vet": thumbCentralBrowardVetMobile,
  "chiangwell-medical": thumbChiangwellMedicalMobile,
  "evo-air": thumbEvoAirMobile,
  "it-yall": thumbItYallMobile,
  "jj-dental": thumbJjDentalMobile,
  "john-orthodontics": thumbJohnOrthodonticsMobile,
  "john-the-plumber": thumbJohnThePlumberMobile,
  "lan-infotech": thumbLanInfotechMobile,
  "levine-family-law": thumbLevineFamilyLawMobile,
  "madalon-law": thumbMadalonLawMobile,
  "mamas-boy-air": thumbMamasBoyAirMobile,
  "meltzer-bell": thumbMeltzerBellMobile,
  "mjm-manufacturing": thumbMjmManufacturingMobile,
  "national-brick-pavers": thumbNationalBrickPaversMobile,
  "prestige-auto": thumbPrestigeAutoMobile,
  "prestige-landscape": thumbPrestigeLandscapeMobile,
  "robson-industrial": thumbRobsonIndustrialMobile,
  "royal-electrical-supply": thumbRoyalElectricalSupplyMobile,
  "septic-doctor": thumbSepticDoctorMobile,
  "tole-electric": thumbToleElectricMobile,
  "tropic-supply": thumbTropicSupplyMobile,
  "westway-towing": thumbWestwayTowingMobile,
};
