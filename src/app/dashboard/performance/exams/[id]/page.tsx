"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { apiPost, apiPut, formatDateTime, useApi } from "@/lib/client";
import { Badge, ErrorNotice, PageHeader, StatCard, useToast } from "@/components/ui";

interface ExamDetail {
  id: string;
  name: string;
  date: string;
  maxScore: number;
  durationMinutes: number | null;
  description: string | null;
  isPublished: boolean;
  subject: { id: string; name: string };
  group: { id: string; name: string };
}

interface ResultRow {
  id: string;
  student: { id: string; fullName: string; studentCode: string };
  score: number | null;
  isAbsent: boolean;
  notes: string | null;
  rank: number | null;
}

interface Statistics {
  graded: number;
  absent: number;
  pending: number;
  average: number | null;
  averagePercentage: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
}

interface GroupRoster {
  students: { id: string; fullName: string; studentCode: string }[];
}

interface GradeDraft {
  score: string;
  isAbsent: boolean;
}

export default function ExamDetailPage() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const examId = params.id;

  const { data, loading, error, reload } = useApi<{
    exam: ExamDetail;
    results: ResultRow[];
    statistics: Statistics;
  }>(`/api/exams/${examId}`);

  const { data: roster } = useApi<GroupRoster>(data?.exam.group.id ? `/api/groups/${data.exam.group.id}` : null, [
    data?.exam.group.id
  ]);

  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const hasExistingScores = useMemo(() => (data?.results ?? []).some((r) => r.score !== null), [data]);

  useEffect(() => {
    if (!data || !roster) return;
    const byStudent = new Map(data.results.map((r) => [r.student.id, r]));
    const next: Record<string, GradeDraft> = {};
    for (const student of roster.students) {
      const existing = byStudent.get(student.id);
      next[student.id] = {
        score: existing?.score !== null && existing?.score !== undefined ? String(existing.score) : "",
        isAbsent: existing?.isAbsent ?? false
      };
    }
    setDrafts(next);
  }, [data, roster]);

  async function handleSaveGrades() {
    if (!roster) return;
    setSaving(true);
    setActionError(null);
    try {
      await apiPut(`/api/exams/${examId}/results`, {
        results: roster.students.map((s) => {
          const draft = drafts[s.id];
          return {
            studentId: s.id,
            score: draft?.isAbsent ? null : draft?.score.trim() ? Number(draft.score) : null,
            isAbsent: draft?.isAbsent ?? false
          };
        }),
        reason: hasExistingScores ? reason.trim() || undefined : undefined
      });
      toast.success(t("common.saved"));
      setReason("");
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save grades.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setActionError(null);
    try {
      await apiPost(`/api/exams/${examId}/publish`);
      toast.success(t("exams.published"));
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to publish exam.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("exams.title")} />
        <ErrorNotice message={error} />
        {loading && <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>}
      </div>
    );
  }

  const { exam, statistics } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={exam.name}
        description={`${exam.subject.name} · ${exam.group.name} · ${formatDateTime(exam.date)}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => router.push("/dashboard/performance/exams")}>
              {t("common.back")}
            </button>
            {!exam.isPublished && (
              <button type="button" className="btn-primary" disabled={publishing} onClick={handlePublish}>
                {publishing ? t("common.loading") : t("exams.publish")}
              </button>
            )}
          </>
        }
      />

      <ErrorNotice message={error ?? actionError} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Graded" value={statistics.graded} />
        <StatCard label="Pending" value={statistics.pending} tone={statistics.pending > 0 ? "warning" : "default"} />
        <StatCard label="Absent" value={statistics.absent} />
        <StatCard label="Average" value={statistics.average ?? "—"} hint={statistics.averagePercentage ? `${statistics.averagePercentage}%` : undefined} />
        <StatCard label="Pass rate" value={statistics.passRate !== null ? `${statistics.passRate}%` : "—"} />
      </div>

      <div className="flex items-center gap-2">
        <Badge tone={exam.isPublished ? "success" : "neutral"}>{exam.isPublished ? t("exams.published") : t("exams.draft")}</Badge>
        <span className="text-sm text-black/55 dark:text-white/55">Max score: {exam.maxScore}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead className="border-b border-black/5 text-black/60 dark:border-white/10 dark:text-white/60">
            <tr>
              <th className="p-3 text-start font-medium">{t("common.student")}</th>
              <th className="p-3 text-start font-medium">Score</th>
              <th className="p-3 text-start font-medium">Absent</th>
              <th className="p-3 text-start font-medium">Rank</th>
            </tr>
          </thead>
          <tbody>
            {!roster && (
              <tr>
                <td className="p-6 text-center text-black/50 dark:text-white/50" colSpan={4}>
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {roster?.students.map((student) => {
              const draft = drafts[student.id];
              const rank = data.results.find((r) => r.student.id === student.id)?.rank ?? null;
              return (
                <tr key={student.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3">
                    <span className="font-medium">{student.fullName}</span>
                    <span className="ms-2 font-mono text-xs text-black/45 dark:text-white/45">{student.studentCode}</span>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min={0}
                      max={exam.maxScore}
                      step="0.5"
                      disabled={exam.isPublished || draft?.isAbsent}
                      className="input w-24 py-1"
                      value={draft?.score ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [student.id]: { ...(d[student.id] ?? { score: "", isAbsent: false }), score: e.target.value }
                        }))
                      }
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      disabled={exam.isPublished}
                      checked={draft?.isAbsent ?? false}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [student.id]: { ...(d[student.id] ?? { score: "", isAbsent: false }), isAbsent: e.target.checked }
                        }))
                      }
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="p-3">{rank ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!exam.isPublished && (
        <div className="card space-y-3 p-4">
          {hasExistingScores && (
            <input
              className="input"
              placeholder={`${t("common.reason")} (required when changing a saved grade)`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <button type="button" className="btn-primary" disabled={saving || !roster} onClick={handleSaveGrades}>
            {saving ? t("common.loading") : t("exams.enterGrades")}
          </button>
        </div>
      )}
    </div>
  );
}
