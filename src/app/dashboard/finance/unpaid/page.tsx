"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { qs, useApi } from "@/lib/client";
import { Badge, ErrorNotice, PageHeader } from "@/components/ui";
import { renderTemplate } from "@/lib/templates";
import { buildWhatsAppLink } from "@/lib/wa-link";

interface SubscriptionRow {
  id: string;
  student: { id: string; fullName: string; studentCode: string };
  groupId: string | null;
  periodYear: number;
  periodMonth: number;
  remaining: number;
  status: string;
  dueDate: string;
}

interface StudentLite {
  id: string;
  stage: { name: string } | null;
  grade: { name: string } | null;
  group: { name: string } | null;
  parents: { parent: { fullName: string; phone: string } }[];
}

interface WATemplate {
  key: string;
  locale: string;
  body: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/** Unpaid Students (spec §21) — outstanding subscriptions + configurable WhatsApp reminder. */
export default function UnpaidStudentsPage() {
  const { t, locale } = useI18n();

  const { data, loading, error } = useApi<{ subscriptions: SubscriptionRow[] }>(
    `/api/subscriptions${qs({ status: "UNPAID", pageSize: 100 })}`
  );
  const { data: overdue } = useApi<{ subscriptions: SubscriptionRow[] }>(
    `/api/subscriptions${qs({ status: "OVERDUE", pageSize: 100 })}`
  );
  const { data: templates } = useApi<WATemplate[]>("/api/whatsapp/templates");
  const [details, setDetails] = useState<Record<string, StudentLite>>({});

  const rows = useMemo(() => [...(data?.subscriptions ?? []), ...(overdue?.subscriptions ?? [])], [data, overdue]);

  async function loadDetail(studentId: string) {
    if (details[studentId]) return details[studentId];
    const profile = await fetch(`/api/students/${studentId}/profile`).then((r) => r.json());
    const student = profile?.data?.student;
    const parents = profile?.data?.parents ?? [];
    const info: StudentLite = {
      id: studentId,
      stage: student?.stage ?? null,
      grade: student?.grade ?? null,
      group: student?.group ?? null,
      parents: parents.length ? [{ parent: parents[0] }] : []
    };
    setDetails((d) => ({ ...d, [studentId]: info }));
    return info;
  }

  async function sendReminder(row: SubscriptionRow) {
    const info = await loadDetail(row.student.id);
    const parentPhone = info.parents[0]?.parent.phone;
    if (!parentPhone) {
      window.alert("No parent phone number on file for this student.");
      return;
    }
    const template = (templates ?? []).find((tpl) => tpl.key === "payment.reminder" && tpl.locale === locale);
    const message = template
      ? renderTemplate(template.body, {
          student_name: row.student.fullName,
          parent_name: info.parents[0]?.parent.fullName,
          stage_name: info.stage?.name,
          grade_name: info.grade?.name,
          group_name: info.group?.name,
          period: `${MONTH_NAMES[row.periodMonth - 1]} ${row.periodYear}`,
          amount: row.remaining,
          center_name: "TecnoID"
        })
      : `Payment of ${row.remaining} for ${row.student.fullName} (${MONTH_NAMES[row.periodMonth - 1]} ${row.periodYear}) is outstanding.`;

    const link = buildWhatsAppLink(parentPhone, message);
    if (!link) {
      window.alert("The parent's phone number is not valid.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.unpaidStudents")} />
      <ErrorNotice message={error} />

      <div className="card overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-black/5 text-black/60 dark:border-white/10 dark:text-white/60">
            <tr>
              <th className="p-3 text-start">{t("common.student")}</th>
              <th className="p-3 text-start">{t("payments.month")}</th>
              <th className="p-3 text-start">Outstanding</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-black/50 dark:text-white/50">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-black/50 dark:text-white/50">
                  No unpaid students. 🎉
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-black/5 dark:border-white/5">
                <td className="p-3 font-medium">
                  {row.student.fullName}
                  <span className="ms-2 font-mono text-xs text-black/45 dark:text-white/45">
                    {row.student.studentCode}
                  </span>
                </td>
                <td className="p-3">
                  {MONTH_NAMES[row.periodMonth - 1]} {row.periodYear}
                </td>
                <td className="p-3">{row.remaining.toFixed(2)}</td>
                <td className="p-3">
                  <Badge tone={row.status === "OVERDUE" ? "danger" : "warning"}>{row.status}</Badge>
                </td>
                <td className="p-3">
                  <button type="button" className="text-xs text-emerald-600 hover:underline dark:text-emerald-400" onClick={() => sendReminder(row)}>
                    WhatsApp
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
