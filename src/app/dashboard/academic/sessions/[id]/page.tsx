"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { apiPatch, useApi } from "@/lib/client";
import { Badge, ErrorNotice, PageHeader, StatCard, useToast } from "@/components/ui";
import { renderTemplate } from "@/lib/templates";
import { buildWhatsAppLink } from "@/lib/wa-link";

interface RosterEntry {
  student: {
    id: string;
    fullName: string;
    studentCode: string;
    status: string;
    parents: { parent: { fullName: string; phone: string; whatsappNumber: string | null } }[];
  };
  attendance: { id: string; type: string; recordedAt: string; makeUpReason: string | null } | null;
}

interface SessionData {
  session: {
    id: string;
    date: string;
    startMinutes: number;
    endMinutes: number;
    status: string;
    group: { id: string; name: string; grade: { name: string }; stage: { name: string } };
  };
  roster: RosterEntry[];
  makeUpAttendees: RosterEntry[];
  counts: { present: number; late: number; makeUp: number; excused: number; absent: number; enrolled: number };
}

interface WATemplate {
  key: string;
  locale: string;
  body: string;
}

type Filter = "ALL" | "PRESENT" | "ABSENT" | "LATE" | "MAKE_UP";

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Session attendance record (spec §13, §14, §15) — summary cards, per-category rosters, WhatsApp. */
export default function SessionDetailPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApi<SessionData>(`/api/sessions/${params.id}`);
  const { data: templates } = useApi<WATemplate[]>("/api/whatsapp/templates");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [closing, setClosing] = useState(false);

  const all = useMemo(() => [...(data?.roster ?? []), ...(data?.makeUpAttendees ?? [])], [data]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return all;
    if (filter === "ABSENT") return all.filter((r) => r.attendance?.type === "ABSENT" || (!r.attendance && data?.session.status === "COMPLETED"));
    if (filter === "PRESENT") return all.filter((r) => r.attendance?.type === "REGULAR");
    if (filter === "LATE") return all.filter((r) => r.attendance?.type === "LATE");
    return all.filter((r) => r.attendance?.type === "MAKE_UP");
  }, [all, filter, data]);

  async function closeSession() {
    setClosing(true);
    try {
      await apiPatch(`/api/sessions/${params.id}`, { status: "COMPLETED" });
      toast.success(t("common.saved"));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close session.");
    } finally {
      setClosing(false);
    }
  }

  function sendWhatsApp(entry: RosterEntry, kind: "absent" | "late") {
    const parent = entry.student.parents[0]?.parent;
    if (!parent) {
      window.alert("No parent phone number on file for this student.");
      return;
    }
    const key = kind === "absent" ? "attendance.absent" : "attendance.late";
    const template = (templates ?? []).find((tpl) => tpl.key === key && tpl.locale === locale);
    const session = data!.session;
    const lateMinutes =
      entry.attendance && kind === "late"
        ? Math.max(
            0,
            Math.round(
              (new Date(entry.attendance.recordedAt).getTime() -
                new Date(session.date).setMinutes(session.startMinutes)) /
                60000
            )
          )
        : 0;
    const vars = {
      student_name: entry.student.fullName,
      parent_name: parent.fullName,
      group_name: session.group.name,
      grade_name: session.group.grade.name,
      stage_name: session.group.stage.name,
      date: session.date.slice(0, 10),
      time: minutesToTime(session.startMinutes),
      late_minutes: lateMinutes,
      center_name: "TecnoID"
    };
    const message = template
      ? renderTemplate(template.body, vars)
      : kind === "absent"
        ? `Dear ${parent.fullName}, ${entry.student.fullName} was absent from today's session on ${vars.date} at ${vars.time}.`
        : `Dear ${parent.fullName}, ${entry.student.fullName} arrived late to today's session.`;

    const link = buildWhatsAppLink(parent.whatsappNumber || parent.phone, message);
    if (!link) {
      window.alert("The parent's phone number is not valid.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  if (loading) return <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>;
  if (error || !data) return <ErrorNotice message={error ?? "Session not found."} />;

  const { session, counts } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${session.group.stage.name} › ${session.group.grade.name} › ${session.group.name}`}
        description={`${session.date.slice(0, 10)} · ${minutesToTime(session.startMinutes)}–${minutesToTime(session.endMinutes)}`}
        actions={
          session.status !== "COMPLETED" ? (
            <button type="button" className="btn-primary" onClick={closeSession} disabled={closing}>
              {closing ? t("common.loading") : "Close session"}
            </button>
          ) : (
            <Badge tone="neutral">{t("common.status")}: {session.status}</Badge>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button type="button" onClick={() => setFilter("ALL")}>
          <StatCard label="Total" value={counts.enrolled} tone={filter === "ALL" ? "positive" : "default"} />
        </button>
        <button type="button" onClick={() => setFilter("PRESENT")}>
          <StatCard label="Present" value={counts.present} tone="positive" />
        </button>
        <button type="button" onClick={() => setFilter("ABSENT")}>
          <StatCard label="Absent" value={counts.absent} tone="negative" />
        </button>
        <button type="button" onClick={() => setFilter("LATE")}>
          <StatCard label="Late" value={counts.late} tone="warning" />
        </button>
        <button type="button" onClick={() => setFilter("MAKE_UP")}>
          <StatCard label="Make-up" value={counts.makeUp} />
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-black/5 text-black/60 dark:border-white/10 dark:text-white/60">
            <tr>
              <th className="p-3 text-start">{t("common.student")}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">Time</th>
              <th className="p-3 text-start">Parent</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-black/50 dark:text-white/50">
                  —
                </td>
              </tr>
            )}
            {filtered.map((entry) => {
              const status = entry.attendance?.type ?? (session.status === "COMPLETED" ? "ABSENT" : "—");
              const parent = entry.student.parents[0]?.parent;
              return (
                <tr key={entry.student.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3 font-medium">
                    {entry.student.fullName}
                    <span className="ms-2 font-mono text-xs text-black/45 dark:text-white/45">
                      {entry.student.studentCode}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge
                      tone={
                        status === "REGULAR"
                          ? "success"
                          : status === "LATE"
                            ? "warning"
                            : status === "ABSENT"
                              ? "danger"
                              : status === "MAKE_UP"
                                ? "brand"
                                : "neutral"
                      }
                    >
                      {status}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-black/55 dark:text-white/55">
                    {entry.attendance ? new Date(entry.attendance.recordedAt).toLocaleTimeString() : "—"}
                  </td>
                  <td className="p-3">
                    {parent ? `${parent.fullName} · ${parent.phone}` : "—"}
                  </td>
                  <td className="p-3">
                    {(status === "ABSENT" || status === "LATE") && parent && (
                      <button
                        type="button"
                        className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                        onClick={() => sendWhatsApp(entry, status === "ABSENT" ? "absent" : "late")}
                      >
                        WhatsApp
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
