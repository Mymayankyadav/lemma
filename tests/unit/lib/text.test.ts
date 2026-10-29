import { it, expect } from "vitest";
import { slugify, formatMinutes, relativeTime } from "../../../src/lib/text";
import {
  chatLink,
  resumePrompt,
  studyPrompt,
  planPrompt,
  revisePlanPrompt,
  updateCardsPrompt,
} from "../../../src/lib/chat";
import { NOW } from "./fixtures";
it("formats identifiers, duration and relative dates", () => {
  expect(slugify("  Réal Analysis / II  ")).toBe("real-analysis-ii");
  expect(slugify("∫")).toBe("project");
  expect(slugify("A")).toBe("a-project");
  expect(formatMinutes(1120)).toBe("18h 40m");
  expect(relativeTime(NOW - 7200000, NOW)).toBe("2 h ago");
  expect(relativeTime("2026-10-28T09:00:00Z", NOW)).toBe("Wed");
  expect(relativeTime("2026-10-01T09:00:00Z", NOW)).toBe("1 Oct");
});
it("builds the exact tutor prompts and safely encoded cross-app links", () => {
  expect(resumePrompt("Real Analysis")).toBe("Resume Real Analysis");
  expect(studyPrompt("Real Analysis", "CP4", "Compactness")).toBe(
    "Study Real Analysis, CP4 Compactness",
  );
  expect(planPrompt("Real Analysis")).toBe("Plan Real Analysis");
  expect(revisePlanPrompt("Real Analysis", "Add proofs")).toBe(
    "Revise the plan for Real Analysis: Add proofs",
  );
  expect(updateCardsPrompt()).toBe("Update my cards");
  const prompt = "Resume A & B #1";
  expect(new URL(chatLink("claude", prompt)).searchParams.get("q")).toBe(
    prompt,
  );
  expect(new URL(chatLink("chatgpt", prompt)).searchParams.get("q")).toBe(
    prompt,
  );
});
