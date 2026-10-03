"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { apiPost, formatDateTime, qs, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, Field, Modal, PageHeader, Pager, useToast } from "@/components/ui";

interface GroupOption {
  id: string;
  name: string;
  grade: { name: string; stage: { name: string } };
}

interface SubjectOption {
  id: string;
  name: string;
}

interface ExamRow {
  id: string;
  name: string;
  date: string;
  maxScore: number;
  isPublished: boolean;
  subject: { id: string; name: string };
  group: { id: string; name: string };
  _count: { results: number };
}

export default function ExamsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useApi<{
    exams: ExamRow[];
    pagination: { page: number; totalPages: number };
  }>(`/api/exams${qs({ page, pageSize: 20 })}`);
  const { data: groups } = useApi<GroupOption[]>("/api/groups");
  const { data: subjects } = useApi<SubjectOption[]>("/api/subjects");

  const [modalOpen, setModalOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setGroupId(groups?.[0]?.id ?? "");
    setSubjectId(subjects?.[0]?.id ?? "");
    setName("");
    setDate("");
    setMaxScore(100);
    setDurationMinutes(60);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await apiPost("/api/exams", {
        groupId,
        subjectId,
        name: name.trim(),
        date: new Date(date).toISOString(),
        maxScore,
        durationMinutes
      });
      toast.success(t("common.created"));
      setModalOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create exam.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("exams.title")}
        actions={
          <button type="button" className="btn-primary" onClick={openCreate} disabled={!groups?.length}>
            {t("exams.add")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      <DataTable
        columns={[t("exams.title"), t("common.subject"), t("common.group"), t("common.date"), "Max score", "Results", t("common.status")]}
        loading={loading}
        isEmpty={(data?.exams.length ?? 0) === 0}
        emptyTitle={t("exams.empty")}
      >
        {data?.exams.map((exam) => (
          <tr key={exam.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3 font-medium">
              <Link href={`/dashboard/performance/exams/${exam.id}`} className="hover:underline">
                {exam.name}
              </Link>
            </td>
            <td className="p-3">{exam.subject.name}</td>
            <td className="p-3">{exam.group.name}</td>
            <td className="p-3">{formatDateTime(exam.date)}</td>
            <td className="p-3">{exam.maxScore}</td>
            <td className="p-3">{exam._count.results}</td>
            <td className="p-3">
              <Badge tone={exam.isPublished ? "success" : "neutral"}>
                {exam.isPublished ? t("exams.published") : t("exams.draft")}
              </Badge>
            </td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />

      <Modal open={modalOpen} title={t("exams.add")} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <ErrorNotice message={formError} />
          <Field label={t("common.group")} required>
            {(id) => (
              <select id={id} className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                {groups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grade.stage.name} · {g.grade.name} · {g.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("common.subject")} required>
            {(id) => (
              <select id={id} className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                {subjects?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("exams.title")} required>
            {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required />}
          </Field>
          <Field label={t("common.date")} required>
            {(id) => (
              <input id={id} type="datetime-local" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max score" required>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  className="input"
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                  required
                />
              )}
            </Field>
            <Field label="Duration (minutes)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  className="input"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              )}
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !name.trim() || !groupId || !subjectId || !date}>
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
