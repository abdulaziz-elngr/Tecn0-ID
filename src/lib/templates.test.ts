import { describe, it, expect } from "vitest";
import { renderTemplate, extractPlaceholders, DEFAULT_TEMPLATES } from "./templates";

describe("renderTemplate", () => {
  it("substitutes a single placeholder", () => {
    expect(renderTemplate("Hello {{name}}!", { name: "Sara" })).toBe("Hello Sara!");
  });

  it("substitutes multiple placeholders", () => {
    const result = renderTemplate("{{student_name}} scored {{score}}/{{max_score}}", {
      student_name: "Ahmed",
      score: 18,
      max_score: 20
    });
    expect(result).toBe("Ahmed scored 18/20");
  });

  it("renders a missing placeholder as an empty string rather than leaking the token", () => {
    expect(renderTemplate("Hi {{name}}, balance: {{amount}}", { name: "Sara" })).toBe("Hi Sara, balance: ");
  });

  it("renders null and undefined values as empty strings", () => {
    expect(renderTemplate("{{a}}-{{b}}", { a: null, b: undefined })).toBe("-");
  });

  it("leaves text with no placeholders unchanged", () => {
    expect(renderTemplate("No placeholders here.", {})).toBe("No placeholders here.");
  });

  it("tolerates extra whitespace inside the braces", () => {
    expect(renderTemplate("Hello {{  name  }}!", { name: "Sara" })).toBe("Hello Sara!");
  });

  it("replaces every occurrence of a repeated placeholder", () => {
    expect(renderTemplate("{{x}} and {{x}} again", { x: "A" })).toBe("A and A again");
  });
});

describe("extractPlaceholders", () => {
  it("finds every distinct placeholder in a body", () => {
    const found = extractPlaceholders("{{student_name}} owes {{amount}} due {{date}}");
    expect(found.sort()).toEqual(["amount", "date", "student_name"]);
  });

  it("deduplicates repeated placeholders", () => {
    expect(extractPlaceholders("{{x}} {{y}} {{x}}")).toEqual(["x", "y"]);
  });

  it("returns an empty array when there are no placeholders", () => {
    expect(extractPlaceholders("Plain text.")).toEqual([]);
  });
});

describe("DEFAULT_TEMPLATES", () => {
  it("has a unique key for every default template", () => {
    const keys = DEFAULT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has matching placeholders between the Arabic and English bodies of every template", () => {
    for (const template of DEFAULT_TEMPLATES) {
      const arPlaceholders = extractPlaceholders(template.ar).sort();
      const enPlaceholders = extractPlaceholders(template.en).sort();
      expect(arPlaceholders).toEqual(enPlaceholders);
    }
  });

  it("renders every default template without leaving any placeholder unresolved when all variables are supplied", () => {
    const sampleVariables = {
      student_name: "Ahmed",
      subject_name: "Math",
      date: "2026-01-01",
      late_minutes: 10,
      period: "2026-01",
      amount: "300 EGP",
      receipt_number: "RCP-0001",
      exam_name: "Unit 1",
      score: 18,
      max_score: 20,
      percentage: 90,
      center_name: "Demo Center",
      message: "Hello"
    };
    for (const template of DEFAULT_TEMPLATES) {
      const rendered = renderTemplate(template.en, sampleVariables);
      expect(rendered).not.toMatch(/\{\{/);
    }
  });
});
