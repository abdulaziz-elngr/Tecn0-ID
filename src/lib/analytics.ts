import { attendanceRate } from "./attendance";
import { performanceTrend } from "./grading";

/**
 * Rule-based student analytics (spec §28, §65).
 *
 * These are deterministic thresholds, NOT machine learning. The spec
 * explicitly forbids claiming AI predictions unless real ML exists, so
 * every flag below is explainable by a single documented rule and the
 * UI shows the rule that produced it.
 */

export interface AnalyticsThresholds {
  lowAttendancePercent: number;
  lowGradePercent: number;
  decliningTrend: number; // slope below this => declining
  improvingTrend: number; // slope above this => improving
  missingAssignmentsCount: number;
  repeatedAbsenceCount: number;
}

export const DEFAULT_THRESHOLDS: AnalyticsThresholds = {
  lowAttendancePercent: 75,
  lowGradePercent: 50,
  decliningTrend: -3,
  improvingTrend: 3,
  missingAssignmentsCount: 2,
  repeatedAbsenceCount: 3
};

export interface StudentAnalyticsInput {
  presentCount: number;
  totalSessions: number;
  consecutiveAbsences: number;
  examPercentages: number[]; // chronological
  missingAssignments: number;
  outstandingAmount: number;
}

export type StudentFlagCode =
  | "LOW_ATTENDANCE"
  | "REPEATED_ABSENCE"
  | "LOW_GRADES"
  | "DECLINING"
  | "IMPROVING"
  | "MISSING_ASSIGNMENTS"
  | "UNPAID";

export interface StudentFlag {
  code: StudentFlagCode;
  severity: "info" | "warning" | "critical";
  /** The exact rule that fired, so the UI can explain itself. */
  rule: string;
}

export interface StudentAnalytics {
  attendancePercentage: number;
  averagePercentage: number | null;
  trend: number;
  flags: StudentFlag[];
}

export function analyzeStudent(
  input: StudentAnalyticsInput,
  thresholds: AnalyticsThresholds = DEFAULT_THRESHOLDS
): StudentAnalytics {
  const attendancePercentage = attendanceRate(input.presentCount, input.totalSessions);
  const averagePercentage =
    input.examPercentages.length > 0
      ? Math.round(
          (input.examPercentages.reduce((a, b) => a + b, 0) / input.examPercentages.length) * 10
        ) / 10
      : null;
  const trend = performanceTrend(input.examPercentages);

  const flags: StudentFlag[] = [];

  if (input.totalSessions > 0 && attendancePercentage < thresholds.lowAttendancePercent) {
    flags.push({
      code: "LOW_ATTENDANCE",
      severity: "warning",
      rule: `attendance ${attendancePercentage}% < ${thresholds.lowAttendancePercent}%`
    });
  }

  if (input.consecutiveAbsences >= thresholds.repeatedAbsenceCount) {
    flags.push({
      code: "REPEATED_ABSENCE",
      severity: "critical",
      rule: `${input.consecutiveAbsences} consecutive absences >= ${thresholds.repeatedAbsenceCount}`
    });
  }

  if (averagePercentage !== null && averagePercentage < thresholds.lowGradePercent) {
    flags.push({
      code: "LOW_GRADES",
      severity: "warning",
      rule: `average ${averagePercentage}% < ${thresholds.lowGradePercent}%`
    });
  }

  if (input.examPercentages.length >= 3) {
    if (trend <= thresholds.decliningTrend) {
      flags.push({
        code: "DECLINING",
        severity: "warning",
        rule: `trend ${trend} <= ${thresholds.decliningTrend} over ${input.examPercentages.length} exams`
      });
    } else if (trend >= thresholds.improvingTrend) {
      flags.push({
        code: "IMPROVING",
        severity: "info",
        rule: `trend ${trend} >= ${thresholds.improvingTrend} over ${input.examPercentages.length} exams`
      });
    }
  }

  if (input.missingAssignments >= thresholds.missingAssignmentsCount) {
    flags.push({
      code: "MISSING_ASSIGNMENTS",
      severity: "warning",
      rule: `${input.missingAssignments} missing assignments >= ${thresholds.missingAssignmentsCount}`
    });
  }

  if (input.outstandingAmount > 0) {
    flags.push({
      code: "UNPAID",
      severity: "warning",
      rule: `outstanding balance ${input.outstandingAmount} > 0`
    });
  }

  return { attendancePercentage, averagePercentage, trend, flags };
}

/** Counts absences at the end of a chronological present/absent list. */
export function countTrailingAbsences(sessionsPresent: boolean[]): number {
  let count = 0;
  for (let i = sessionsPresent.length - 1; i >= 0; i--) {
    if (sessionsPresent[i]) break;
    count += 1;
  }
  return count;
}
