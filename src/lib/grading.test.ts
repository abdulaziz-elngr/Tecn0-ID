import { describe, it, expect } from "vitest";
import {
  validateScore,
  percentage,
  computeExamStatistics,
  rankScores,
  performanceTrend,
  InvalidScoreError,
  type ScoreEntry
} from "./grading";

describe("validateScore (Rule 8)", () => {
  it("accepts a score within range", () => {
    expect(() => validateScore(50, 100)).not.toThrow();
  });

  it("accepts a score exactly at the maximum", () => {
    expect(() => validateScore(100, 100)).not.toThrow();
  });

  it("rejects a score above the maximum", () => {
    expect(() => validateScore(101, 100)).toThrow(InvalidScoreError);
  });

  it("rejects a negative score", () => {
    expect(() => validateScore(-1, 100)).toThrow(InvalidScoreError);
  });

  it("rejects a non-finite score", () => {
    expect(() => validateScore(NaN, 100)).toThrow(InvalidScoreError);
  });
});

describe("percentage", () => {
  it("computes a rounded percentage", () => {
    expect(percentage(15, 20)).toBe(75);
  });

  it("returns 0 when maxScore is zero or negative", () => {
    expect(percentage(10, 0)).toBe(0);
    expect(percentage(10, -5)).toBe(0);
  });
});

describe("computeExamStatistics", () => {
  function entry(studentId: string, score: number | null, isAbsent = false): ScoreEntry {
    return { studentId, score, isAbsent };
  }

  it("returns nulls when nobody has been graded yet", () => {
    const stats = computeExamStatistics([entry("s1", null), entry("s2", null)], 20);
    expect(stats).toMatchObject({ graded: 0, average: null, averagePercentage: null, highest: null, lowest: null, passRate: null });
    expect(stats.pending).toBe(2);
  });

  it("separates graded, absent and pending counts", () => {
    const stats = computeExamStatistics(
      [entry("s1", 18), entry("s2", null, true), entry("s3", null)],
      20
    );
    expect(stats.graded).toBe(1);
    expect(stats.absent).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it("computes average, highest, lowest and pass rate", () => {
    const stats = computeExamStatistics(
      [entry("s1", 20), entry("s2", 10), entry("s3", 15)],
      20,
      50
    );
    expect(stats.average).toBe(15);
    expect(stats.highest).toBe(20);
    expect(stats.lowest).toBe(10);
    // 20/20=100%, 10/20=50%, 15/20=75% — all >= 50% pass threshold.
    expect(stats.passRate).toBe(100);
  });

  it("excludes below-threshold scores from the pass rate", () => {
    const stats = computeExamStatistics([entry("s1", 20), entry("s2", 5)], 20, 50);
    expect(stats.passRate).toBe(50);
  });
});

describe("rankScores", () => {
  it("ranks scores highest first", () => {
    const ranked = rankScores([
      { studentId: "a", score: 15, isAbsent: false },
      { studentId: "b", score: 20, isAbsent: false },
      { studentId: "c", score: 10, isAbsent: false }
    ]);
    expect(ranked.map((r) => r.studentId)).toEqual(["b", "a", "c"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("gives tied scores the same rank and skips the next rank (1,2,2,4)", () => {
    const ranked = rankScores([
      { studentId: "a", score: 20, isAbsent: false },
      { studentId: "b", score: 15, isAbsent: false },
      { studentId: "c", score: 15, isAbsent: false },
      { studentId: "d", score: 10, isAbsent: false }
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("excludes absent and ungraded students from the ranking", () => {
    const ranked = rankScores([
      { studentId: "a", score: 20, isAbsent: false },
      { studentId: "b", score: null, isAbsent: true },
      { studentId: "c", score: null, isAbsent: false }
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.studentId).toBe("a");
  });
});

describe("performanceTrend", () => {
  it("returns 0 for fewer than two data points", () => {
    expect(performanceTrend([])).toBe(0);
    expect(performanceTrend([80])).toBe(0);
  });

  it("returns a positive slope for an improving trend", () => {
    expect(performanceTrend([50, 60, 70, 80])).toBeGreaterThan(0);
  });

  it("returns a negative slope for a declining trend", () => {
    expect(performanceTrend([80, 70, 60, 50])).toBeLessThan(0);
  });

  it("returns 0 for a flat trend", () => {
    expect(performanceTrend([70, 70, 70, 70])).toBe(0);
  });
});
