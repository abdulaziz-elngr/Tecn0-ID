import { describe, it, expect } from "vitest";
import { analyzeStudent, countTrailingAbsences, DEFAULT_THRESHOLDS, type StudentAnalyticsInput } from "./analytics";

function baseInput(overrides: Partial<StudentAnalyticsInput> = {}): StudentAnalyticsInput {
  return {
    presentCount: 18,
    totalSessions: 20,
    consecutiveAbsences: 0,
    examPercentages: [],
    missingAssignments: 0,
    outstandingAmount: 0,
    ...overrides
  };
}

describe("analyzeStudent", () => {
  it("raises no flags for a healthy student", () => {
    const result = analyzeStudent(baseInput({ examPercentages: [80, 82, 85] }));
    expect(result.flags).toEqual([]);
    expect(result.attendancePercentage).toBe(90);
  });

  it("flags LOW_ATTENDANCE when below the threshold", () => {
    const result = analyzeStudent(baseInput({ presentCount: 10, totalSessions: 20 }));
    expect(result.flags.some((f) => f.code === "LOW_ATTENDANCE")).toBe(true);
  });

  it("does not flag attendance when there are no sessions yet", () => {
    const result = analyzeStudent(baseInput({ presentCount: 0, totalSessions: 0 }));
    expect(result.flags.some((f) => f.code === "LOW_ATTENDANCE")).toBe(false);
  });

  it("flags REPEATED_ABSENCE at the configured threshold", () => {
    const result = analyzeStudent(baseInput({ consecutiveAbsences: 3 }));
    expect(result.flags.some((f) => f.code === "REPEATED_ABSENCE" && f.severity === "critical")).toBe(true);
  });

  it("does not flag repeated absence just below the threshold", () => {
    const result = analyzeStudent(baseInput({ consecutiveAbsences: 2 }));
    expect(result.flags.some((f) => f.code === "REPEATED_ABSENCE")).toBe(false);
  });

  it("flags LOW_GRADES when the average is below the threshold", () => {
    const result = analyzeStudent(baseInput({ examPercentages: [30, 40, 35] }));
    expect(result.flags.some((f) => f.code === "LOW_GRADES")).toBe(true);
  });

  it("flags DECLINING for a clearly worsening trend over enough exams", () => {
    const result = analyzeStudent(baseInput({ examPercentages: [90, 80, 70, 60] }));
    expect(result.flags.some((f) => f.code === "DECLINING")).toBe(true);
  });

  it("flags IMPROVING for a clearly improving trend over enough exams", () => {
    const result = analyzeStudent(baseInput({ examPercentages: [50, 60, 70, 80] }));
    expect(result.flags.some((f) => f.code === "IMPROVING")).toBe(true);
  });

  it("does not evaluate trend with fewer than three exams", () => {
    const result = analyzeStudent(baseInput({ examPercentages: [30, 90] }));
    expect(result.flags.some((f) => f.code === "DECLINING" || f.code === "IMPROVING")).toBe(false);
  });

  it("flags MISSING_ASSIGNMENTS at the configured threshold", () => {
    const result = analyzeStudent(baseInput({ missingAssignments: 2 }));
    expect(result.flags.some((f) => f.code === "MISSING_ASSIGNMENTS")).toBe(true);
  });

  it("flags UNPAID whenever there is an outstanding balance", () => {
    const result = analyzeStudent(baseInput({ outstandingAmount: 150 }));
    expect(result.flags.some((f) => f.code === "UNPAID")).toBe(true);
  });

  it("respects custom thresholds over the defaults", () => {
    const strict = { ...DEFAULT_THRESHOLDS, lowAttendancePercent: 95 };
    const result = analyzeStudent(baseInput({ presentCount: 18, totalSessions: 20 }), strict);
    // 90% attendance now falls below the stricter 95% threshold.
    expect(result.flags.some((f) => f.code === "LOW_ATTENDANCE")).toBe(true);
  });

  it("can raise multiple flags at once", () => {
    const result = analyzeStudent(
      baseInput({
        presentCount: 5,
        totalSessions: 20,
        consecutiveAbsences: 4,
        examPercentages: [30, 20, 10],
        missingAssignments: 3,
        outstandingAmount: 300
      })
    );
    const codes = result.flags.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining(["LOW_ATTENDANCE", "REPEATED_ABSENCE", "LOW_GRADES", "DECLINING", "MISSING_ASSIGNMENTS", "UNPAID"])
    );
  });
});

describe("countTrailingAbsences", () => {
  it("counts absences only at the end of the chronological list", () => {
    // true = present, false = absent, in chronological order.
    expect(countTrailingAbsences([true, false, true, false, false, false])).toBe(3);
  });

  it("returns 0 when the most recent session was present", () => {
    expect(countTrailingAbsences([false, false, true])).toBe(0);
  });

  it("returns 0 for an empty history", () => {
    expect(countTrailingAbsences([])).toBe(0);
  });

  it("counts every entry when the student has never attended", () => {
    expect(countTrailingAbsences([false, false, false])).toBe(3);
  });
});
