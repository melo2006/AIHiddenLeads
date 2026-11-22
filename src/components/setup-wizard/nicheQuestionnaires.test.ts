import { describe, it, expect } from "vitest";
import {
  NICHE_QUESTIONNAIRES, GENERIC_QUESTIONNAIRE, BEHAVIOR_SECTION,
  questionnaireForIndustry, hasNicheQuestionnaire, allNicheQuestions,
} from "./nicheQuestionnaires";
import {
  EMPTY, INDUSTRIES, stepReady, nicheKnowledge, nichePlaybook,
  withNicheKnowledge, withNichePlaybook, prefillNicheAnswers, nicheProgress,
} from "./wizardModel";
import { NICHE_MARK, NICHE_PLAYBOOK_MARK, sectionValue } from "../../../supabase/functions/_shared/wizard-knowledge";

describe("niche questionnaire data", () => {
  it("covers all 30 extracted niches plus a generic fallback", () => {
    expect(NICHE_QUESTIONNAIRES.length).toBe(30);
    expect(GENERIC_QUESTIONNAIRE.key).toBe("generic");
  });

  it("every questionnaire ends with the shared behavior section and has unique question ids", () => {
    for (const q of [...NICHE_QUESTIONNAIRES, GENERIC_QUESTIONNAIRE]) {
      expect(q.sections[q.sections.length - 1].title, q.key).toBe(BEHAVIOR_SECTION.title);
      const ids = allNicheQuestions(q).map((x) => x.id);
      expect(new Set(ids).size, q.key).toBe(ids.length);
      const behavior = q.sections[q.sections.length - 1].questions;
      expect(behavior.length).toBe(6);
      expect(behavior.every((x) => x.kind === "behavior")).toBe(true);
      expect(q.persona.greetingPattern).toContain("{businessName}");
      expect(q.persona.bookingQuestions.length).toBeGreaterThan(0);
    }
  });

  it("maps wizard industries to their niche questionnaires", () => {
    expect(questionnaireForIndustry("Dental").key).toBe("dental");
    expect(questionnaireForIndustry("HVAC").key).toBe("hvac");
    expect(questionnaireForIndustry("Real estate").key).toBe("real-estate");
    expect(questionnaireForIndustry("Mortgage & lending").key).toBe("mortgage");
    expect(questionnaireForIndustry("Fitness & gym").key).toBe("gym-fitness");
    expect(questionnaireForIndustry("Auto services").key).toBe("car-dealership");
    expect(questionnaireForIndustry("Home services").key).toBe("home-services");
    expect(questionnaireForIndustry("Plumbing").key).toBe("home-services");
    expect(questionnaireForIndustry("B2B / industrial").key).toBe("b2b-saas");
    expect(questionnaireForIndustry("Legal").key).toBe("generic");
    expect(questionnaireForIndustry("").key).toBe("generic");
    expect(hasNicheQuestionnaire("Dental")).toBe(true);
    expect(hasNicheQuestionnaire("Legal")).toBe(false);
  });

  it("every questionnaire industry is a real wizard industry", () => {
    for (const q of NICHE_QUESTIONNAIRES) {
      for (const industry of q.industries) expect(INDUSTRIES, `${q.key}:${industry}`).toContain(industry);
    }
    expect(INDUSTRIES).toContain("Mortgage & lending");
    expect(INDUSTRIES).toContain("Fitness & gym");
  });

  it("library-only niches stay out of the wizard industry list", () => {
    for (const key of ["agri-inputs", "nbfc-lending", "microfinance", "ngo-outreach", "maternal-health"]) {
      expect(NICHE_QUESTIONNAIRES.find((q) => q.key === key)?.industries).toEqual([]);
    }
  });
});

describe("niche composer wiring", () => {
  const answers = {
    businessName: "Bright Smile Dental",
    hours: "Mon-Fri 9-5",
    behaviorTransfer: "Pass billing fights to the practice manager.",
  };

  it("renders answered facts into knowledge, grouped by section, without behavior answers", () => {
    const text = nicheKnowledge(answers, "Dental");
    expect(text).toContain("Business Information");
    expect(text).toContain("Bright Smile Dental");
    expect(text).toContain("Business hours: Mon-Fri 9-5");
    expect(text).not.toContain("practice manager");
    expect(nicheKnowledge({}, "Dental")).toBe("");
    expect(nicheKnowledge(undefined, "Dental")).toBe("");
  });

  it("renders the playbook with persona structure and the owner's behavior answers", () => {
    const text = nichePlaybook(answers, "Dental");
    expect(text).toContain("How you should sound:");
    expect(text).toContain("ask in this order:");
    expect(text).toContain("Hand over to a human when:");
    expect(text).toContain("Pass billing fights to the practice manager.");
  });

  it("re-saving replaces the niche sections instead of duplicating them", () => {
    const once = withNicheKnowledge("Base knowledge.", answers, "Dental");
    const twice = withNicheKnowledge(once, answers, "Dental");
    expect(twice).toBe(once);
    expect(twice.split(NICHE_MARK).length - 1).toBe(1);
    const changed = withNicheKnowledge(once, { ...answers, hours: "Sat 10-2" }, "Dental");
    expect(sectionValue(changed, NICHE_MARK)).toContain("Sat 10-2");
    expect(sectionValue(changed, NICHE_MARK)).not.toContain("Mon-Fri 9-5");

    const promptOnce = withNichePlaybook("Base prompt.", answers, "Dental");
    const promptTwice = withNichePlaybook(promptOnce, answers, "Dental");
    expect(promptTwice).toBe(promptOnce);
    expect(promptTwice.split(NICHE_PLAYBOOK_MARK).length - 1).toBe(1);
    expect(withNichePlaybook("Base prompt.", {}, "Legal")).toContain("Base prompt.");
  });

  it("prefills answers the wizard already knows, by question id", () => {
    const pre = prefillNicheAnswers({ ...EMPTY, businessName: " Apex ", websiteUrl: " apex.com " });
    expect(pre.businessName).toBe("Apex");
    expect(pre.website).toBe("apex.com");
    expect(pre.address).toBeUndefined();
    const withAddress = prefillNicheAnswers({ ...EMPTY, serviceArea: { ...EMPTY.serviceArea!, baseAddress: "1 Main St" } });
    expect(withAddress.address).toBe("1 Main St");
  });
});

describe("all-30 niche pass", () => {
  it("exercises every niche: resolve by industry, render knowledge, splice playbook, idempotent re-save", () => {
    let nichesTested = 0;
    let questionsTotal = 0;
    for (const q of NICHE_QUESTIONNAIRES) {
      nichesTested += 1;
      const questions = allNicheQuestions(q);
      questionsTotal += questions.length;
      // Answer every single question in the questionnaire.
      const answers: Record<string, string> = {};
      for (const question of questions) answers[question.id] = `Sample answer for ${question.id}`;

      if (q.industries.length === 0) {
        // Library-only niche: no wizard industry maps to it, so it cannot be
        // resolved or rendered through the wizard path — verify its data is
        // complete instead (question set + persona).
        expect(questions.length, q.key).toBeGreaterThan(6);
        expect(q.persona.bookingQuestions.length, q.key).toBeGreaterThan(0);
        expect(q.persona.greetingPattern, q.key).toContain("{businessName}");
        continue;
      }

      for (const industry of q.industries) {
        // Resolves for the mapped industry.
        expect(questionnaireForIndustry(industry).key, `${q.key} via ${industry}`).toBe(q.key);

        // Every factual question renders into the knowledge text.
        const knowledge = nicheKnowledge(answers, industry);
        for (const question of questions) {
          if (question.kind === "behavior") continue;
          expect(knowledge, `${q.key}:${question.id}`).toContain(`${question.label}:`);
          expect(knowledge, `${q.key}:${question.id}`).toContain(`Sample answer for ${question.id}`);
        }

        // Persona + every behavior answer splice into the playbook.
        const playbook = nichePlaybook(answers, industry);
        expect(playbook, q.key).toContain(q.persona.agentFeel);
        for (const question of questions) {
          if (question.kind !== "behavior") continue;
          expect(playbook, `${q.key}:${question.id}`).toContain(`Sample answer for ${question.id}`);
        }

        // A re-save replaces the sections instead of duplicating them.
        const knowledgeOnce = withNicheKnowledge("Base knowledge.", answers, industry);
        expect(withNicheKnowledge(knowledgeOnce, answers, industry), q.key).toBe(knowledgeOnce);
        expect(knowledgeOnce.split(NICHE_MARK).length - 1, q.key).toBe(1);
        const playbookOnce = withNichePlaybook("Base prompt.", answers, industry);
        expect(withNichePlaybook(playbookOnce, answers, industry), q.key).toBe(playbookOnce);
        expect(playbookOnce.split(NICHE_PLAYBOOK_MARK).length - 1, q.key).toBe(1);
      }
    }
    expect(nichesTested).toBe(30);
    expect(questionsTotal).toBeGreaterThan(1000);
  });
});

describe("real-estate discovery playbook", () => {
  it("carries the no-match commitment and the needs-discovery topics", () => {
    const realEstate = NICHE_QUESTIONNAIRES.find((q) => q.key === "real-estate")!;
    const personaText = [
      realEstate.persona.agentFeel,
      ...realEstate.persona.handles,
      ...realEstate.persona.bookingQuestions,
      ...realEstate.persona.hardRules,
      ...realEstate.persona.escalate,
      ...realEstate.persona.postCall,
    ].join(" ");
    for (const keyword of ["broader market", "price range", "pool", "HOA", "investor", "list"]) {
      expect(personaText, keyword).toContain(keyword);
    }
    // The composed playbook a paying realtor's agent would run carries them too.
    const playbook = nichePlaybook({}, "Real estate");
    for (const keyword of ["broader market", "price range", "pool", "HOA", "investor", "list"]) {
      expect(playbook, keyword).toContain(keyword);
    }
    // The pre-existing hard rule and escalation stay in place.
    expect(personaText).toContain("Never promise a sale price or a valuation figure.");
    expect(realEstate.persona.escalate.join(" ")).toContain("Offers and negotiations");
  });
});

describe("niche composer wiring (continued)", () => {
  const answers = {
    businessName: "Bright Smile Dental",
    hours: "Mon-Fri 9-5",
    behaviorTransfer: "Pass billing fights to the practice manager.",
  };

  it("counts progress and leaves step readiness untouched", () => {
    const q = questionnaireForIndustry("Dental");
    expect(nicheProgress(q, answers).answered).toBe(3);
    expect(nicheProgress(q, {}).answered).toBe(0);
    expect(stepReady(1, EMPTY)).toBe(true);
    expect(stepReady(3, { ...EMPTY, nicheAnswers: answers })).toBe(true);
    expect(stepReady(3, EMPTY)).toBe(true);
  });
});
