"use client";

import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoneyClient, useApi } from "@/lib/client";
import { ErrorNotice, PageHeader } from "@/components/ui";

interface ReceiptData {
  id: string;
  receiptNumber: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string;
  notes: string | null;
  cashierName: string | null;
  student: {
    id: string;
    fullName: string;
    studentCode: string;
    stage: { name: string } | null;
    grade: { name: string } | null;
    group: { name: string } | null;
  };
  allocations: { id: string; amount: number; subscription: { periodYear: number; periodMonth: number } }[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/** Payment receipt (spec §19) — thermal-printer-ready (80mm), saved permanently via /api/payments. */
export default function ReceiptPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: receipt, loading, error } = useApi<ReceiptData>(`/api/payments/${params.id}`);

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between">
        <PageHeader title={t("payments.receipt") } />
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.push("/dashboard/finance/payments")}>
            {t("common.back")}
          </button>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            {t("common.print")}
          </button>
        </div>
      </div>

      <ErrorNotice message={error} />
      {loading && <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>}

      {receipt && (
        <div className="print-sheet print-receipt card mx-auto max-w-sm space-y-3 border border-black/10 p-5 font-mono text-sm dark:border-white/10">
          <div className="text-center">
            <p className="text-base font-bold">TecnoID</p>
            <p className="text-xs text-black/50 dark:text-white/50">{t("payments.receipt")}</p>
          </div>
          <hr className="border-dashed border-black/20 dark:border-white/20" />
          <dl className="space-y-1">
            <Row label={t("common.student")} value={receipt.student.fullName} />
            <Row label={t("students.id")} value={receipt.student.studentCode} />
            <Row label={t("nav.stages")} value={receipt.student.stage?.name ?? "—"} />
            <Row label={t("grades.title")} value={receipt.student.grade?.name ?? "—"} />
            <Row label={t("nav.groups")} value={receipt.student.group?.name ?? "—"} />
          </dl>
          <hr className="border-dashed border-black/20 dark:border-white/20" />
          <dl className="space-y-1">
            {receipt.allocations.map((a) => (
              <Row
                key={a.id}
                label={`${MONTHS[a.subscription.periodMonth - 1]} ${a.subscription.periodYear}`}
                value={formatMoneyClient(a.amount)}
              />
            ))}
            <Row label={t("common.amount")} value={formatMoneyClient(receipt.amount)} strong />
            <Row label="Method" value={receipt.method} />
            <Row label={t("common.date")} value={formatDateTime(receipt.paidAt)} />
            <Row label="Receipt #" value={receipt.receiptNumber} />
            <Row label="Cashier" value={receipt.cashierName ?? "—"} />
          </dl>
          <hr className="border-dashed border-black/20 dark:border-white/20" />
          <p className="text-center text-xs text-black/50 dark:text-white/50">Thank you.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <dt className="text-black/60 dark:text-white/60">{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  );
}
