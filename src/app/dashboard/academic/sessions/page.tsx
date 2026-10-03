"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { apiPost, formatDate, qs, todayISO, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, Field, Modal, PageHeader, Pager, useToast } from "@/components/ui";

interface GroupOption {
  id: string;
  name: string;
  grade: { name: string; stage: { name: string } };
}

interface SessionRow {
  id: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  status: string;
  group: {
    id: string;
    name: string;
    grade: { name: string; stage: { name: string } };
    teacher: { fullName: string } | null;
  };
  _count: { attendances: number };
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toneFor(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  if (status === "OPEN") return "brand" as const;
  return "neutral" as const;
}

export default function SessionsPage() {
  const { t } = useI18n();
  const toast = useToast();

  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [groupId, setGroupId] = useState("");
  const [page, setPage] = useState(1);

  const query = qs({ from, to, groupId: groupId || undefined, page, pageSize: 25 });
  const { data, loading, error, reload } = useApi<{
    sessions: SessionRow[];
    pagination: { page: number; totalPages: number };
  }>(`/api/sessions${query}`);
  const { data: groups } = useApi<GroupOption[]>("/api/groups");

  const [genOpen, setGenOpen] = useState(false);
  const [genFrom, setGenFrom] = useState(todayISO());
  const [genTo, setGenTo] = useState(todayISO());
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number } | null>(null);

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setGenerating(true);
    setGenError(null);
    try {
      const result = await apiPost<{ created: number; skipped: number }>("/api/sessions/generate", {
        from: genFrom,
        to: genTo
      });
      setGenResult(result);
      toast.success(t("common.saved"));
      reload();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate sessions.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("sessions.title")}
        actions={
          <button type="button" className="btn-primary" onClick={() => setGenOpen(true)}>
            {t("sessions.generate")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <Field label={t("common.from")}>
          {(id) => (
            <input
              id={id}
              type="date"
              className="input"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t("common.to")}>
          {(id) => (
            <input
              id={id}
              type="date"
              className="input"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t("common.group")}>
          {(id) => (
            <select
              id={id}
              className="input"
              value={groupId}
              onChange={(e) => {
                setPage(1);
                setGroupId(e.target.value);
              }}
            >
              <option value="">{t("common.all")}</option>
              {groups?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.grade.stage.name} · {g.grade.name} · {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <DataTable
        columns={[t("common.date"), "Time", t("nav.stages"), t("grades.title"), t("common.group"), t("common.teacher"), t("common.status"), "Attendance"]}
        loading={loading}
        isEmpty={(data?.sessions.length ?? 0) === 0}
        emptyTitle={t("sessions.empty")}
      >
        {data?.sessions.map((s) => (
          <tr key={s.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3">{formatDate(s.date)}</td>
            <td className="p-3">
              {minutesToTime(s.startMinutes)}–{minutesToTime(s.endMinutes)}
            </td>
            <td className="p-3">{s.group.grade.stage.name}</td>
            <td className="p-3">{s.group.grade.name}</td>
            <td className="p-3 font-medium">{s.group.name}</td>
            <td className="p-3">{s.group.teacher?.fullName ?? "—"}</td>
            <td className="p-3">
              <Badge tone={toneFor(s.status)}>{s.status}</Badge>
            </td>
            <td className="p-3">
              <Link href={`/dashboard/academic/sessions/${s.id}`} className="hover:underline">
                {s._count.attendances}
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />

      <Modal open={genOpen} title={t("sessions.generate")} onClose={() => setGenOpen(false)}>
        <form onSubmit={handleGenerate} className="space-y-3">
          <ErrorNotice message={genError} />
          <p className="text-sm text-black/60 dark:text-white/60">
            Materializes weekly schedule slots into dated sessions for the selected range. Safe to run repeatedly —
            already-generated sessions are skipped.
          </p>
          <Field label={t("common.from")} required>
            {(id) => (
              <input id={id} type="date" className="input" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} required />
            )}
          </Field>
          <Field label={t("common.to")} required>
            {(id) => (
              <input id={id} type="date" className="input" value={genTo} onChange={(e) => setGenTo(e.target.value)} required />
            )}
          </Field>
          {genResult && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Created {genResult.created}, skipped {genResult.skipped} (already existed).
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setGenOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={generating}>
              {generating ? t("common.loading") : t("sessions.generate")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
