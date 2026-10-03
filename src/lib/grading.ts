/**
 * Exam/grade calculations (spec §26, Rule 8).
 * Pure functions — unit-tested in src/lib/grading.test.ts.
 */

export interface ScoreEntry {
  studentId: string;
  score: number | null;
  isAbsent: boolean;
}

export interface ExamStatistics {
  graded: number;
  absent: number;
  pending: number;
  average: number | null;
  averagePercentage: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
}

export class InvalidScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScoreError";
  }
}

/** Rule 8 — a grade can never exceed the exam's maximum score. */
export function validateScore(score: number, maxScore: number): void {
  if (!Number.isFinite(score)) {
    throw new InvalidScoreError("Score must be a number.");
  }
  if (score < 0) {
    throw new InvalidScoreError("Score cannot be negative.");
  }
  if (score > maxScore) {
    throw new InvalidScoreError(`Score cannot exceed the maximum score of ${maxScore}.`);
  }
}

export function percentage(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function computeExamStatistics(
  entries: ScoreEntry[],
  maxScore: number,
  passPercentage = 50
): ExamStatistics {
  const graded = entries.filter((e) => !e.isAbsent && e.score !== null) as {
    studentId: string;
    score: number;
  }[];
  const absent = entries.filter((e) => e.isAbsent).length;
  const pending = entries.filter((e) => !e.isAbsent && e.score === null).length;

  if (graded.length === 0) {
    return {
      graded: 0,
      absent,
      pending,
      average: null,
      averagePercentage: null,
      highest: null,
      lowest: null,
      passRate: null
    };
  }

  const scores = graded.map((g) => g.score);
  const sum = scores.reduce((a, b) => a + b, 0);
  const average = Math.round((sum / scores.length) * 100) / 100;
  const passed = scores.filter((s) => percentage(s, maxScore) >= passPercentage).length;

  return {
    graded: graded.length,
    absent,
    pending,
    average,
    averagePercentage: percentage(average, maxScore),
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    passRate: Math.round((passed / scores.length) * 1000) / 10
  };
}

export interface RankedEntry {
  studentId: string;
  score: number;
  rank: number;
}

/** Competition ranking (1,2,2,4) — ties share a rank. */
export function rankScores(entries: ScoreEntry[]): RankedEntry[] {
  const graded = entries
    .filter((e) => !e.isAbsent && e.score !== null)
    .map((e) => ({ studentId: e.studentId, score: e.score as number }))
    .sort((a, b) => b.score - a.score);

  const ranked: RankedEntry[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;

  graded.forEach((entry, index) => {
    const rank = lastScore !== null && entry.score === lastScore ? lastRank : index + 1;
    ranked.push({ ...entry, rank });
    lastScore = entry.score;
    lastRank = rank;
  });

  return ranked;
}

/**
 * Simple linear trend over a chronological list of percentages.
 * Returns the slope in percentage-points per exam — positive means
 * improving. Used by the rule-based analytics module (spec §28); this
 * is deliberately NOT presented as an "AI prediction".
 */
export function performanceTrend(percentages: number[]): number {
  const n = percentages.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = percentages.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  percentages.forEach((y, x) => {
    numerator += (x - meanX) * (y - meanY);
    denominator += (x - meanX) ** 2;
  });

  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}
