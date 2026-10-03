"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, qs, todayISO, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, Field, PageHeader, Pager, StatCard } from "@/components/ui";

/** Attendance dashboard (spec §19) — filters, per-type totals and export. */

interface AttendanceRow {
  id: string;
  type: string;
  recordedAt: string;
  notes: string | null;
  makeUpReason: string | null;
  student: { id: string; fullName: string; studentCode: string };
  session: {
    id: string;
    date: string;
    startMinutes: number;
    group: { id: string; name: string; grade: { name: string; stage: { name: string } } };
  };
}

interface Summary {
  counts: { present: number; late: number; makeUp: number; excused: number; absent: number };
  attendanceRate: number;
  byGroup?: { groupId: string; groupName: string; present: number; absent: number }[];
  trend?: { date: string; present: number; absent: number }[];
}

const TYPES = ["REGULAR", "MAKE_UP", "LATE", "EXCUSED", "ABSENT"] as const;

/** Maps an attendance `type` enum value to its key in the summary API's `counts` object. */
const COUNT_KEY: Record<(typeof TYPES)[number], keyof Summary["counts"]> = {
  REGULAR: "present",
  MAKE_UP: "makeUp",
  LATE: "late",
  EXCUSED: "excused",
  ABSENT: "absent"
};

function toneFor(type: string) {
  if (type === "ABSENT") return "danger" as const;
  if (type === "LATE") return "warning" as const;
  if (type === "EXCUSED") return "neutral" as const;
  return "success" as const;
}

export default function AttendancePage() {
  const { t } = useI18n();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);

  const query = qs({ from, to, type: type || undefined, page, pageSize: 25 });
  const list = useApi<{ attendance: AttendanceRow[]; pagination: { page: number; totalPages: number } }>(
    `/api/attendance${query}`
  );
  const summary = useApi<Summary>(`/api/attendance/summary${qs({ from, to })}`);

  const counts = summary.data?.counts;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("attendance.title")}
        actions={
          <>
            <Link href="/dashboard/attendance/scan" className="btn-primary">
              {t("nav.scanner")}
            </Link>
            <a
              className="btn-secondary"
              href={`/api/attendance${qs({ from, to, type: type || undefined, format: "csv" })}`}
            >
              {t("attendance.export")}
            </a>
          </>
        }
      />

      <ErrorNotice message={list.error ?? summary.error} />

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
        <Field label={t("common.status")}>
          {(id) => (
            <select
              id={id}
              className="input"
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
            >
              <option value="">{t("common.all")}</option>
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {TYPES.map((value) => (
          <StatCard
            key={value}
            label={value}
            value={counts?.[COUNT_KEY[value]] ?? 0}
            tone={toneFor(value) === "danger" ? "negative" : "default"}
          />
        ))}
      </div>

      {summary.data && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Attendance rate for this period: <strong>{summary.data.attendanceRate}%</strong>
        </p>
      )}

      <DataTable
        columns={[
          t("common.date"),
          t("common.student"),
          "Stage / Grade",
          t("common.group"),
          t("common.status"),
          "Recorded at"
        ]}
        loading={list.loading}
        isEmpty={(list.data?.attendance.length ?? 0) === 0}
        emptyTitle={t("attendance.empty")}
        emptyDescription="Adjust the date range, or scan students from the attendance scanner."
      >
        {list.data?.attendance.map((row) => (
          <tr key={row.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3">{formatDate(row.session.date)}</td>
            <td className="p-3">
              <Link href={`/dashboard/students/${row.student.id}`} className="font-medium hover:underline">
                {row.student.fullName}
              </Link>
              <span className="ms-2 font-mono text-xs text-black/45 dark:text-white/45">
                {row.student.studentCode}
              </span>
            </td>
            <td className="p-3">{row.session.group.grade.stage.name} / {row.session.group.grade.name}</td>
            <td className="p-3">{row.session.group.name}</td>
            <td className="p-3">
              <Badge tone={toneFor(row.type)}>{row.type}</Badge>
              {row.makeUpReason && (
                <span className="ms-2 text-xs text-black/50 dark:text-white/50">{row.makeUpReason}</span>
              )}
            </td>
            <td className="p-3 text-xs text-black/55 dark:text-white/55">{formatDateTime(row.recordedAt)}</td>
          </tr>
        ))}
      </DataTable>

      <Pager
        page={list.data?.pagination.page ?? 1}
        totalPages={list.data?.pagination.totalPages ?? 1}
        onChange={setPage}
      />
    </div>
  );
}
