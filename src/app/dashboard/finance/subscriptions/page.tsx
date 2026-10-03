"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPost, currentMonth, formatDate, formatMoneyClient, qs, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, Field, Modal, PageHeader, Pager, StatCard, useToast } from "@/components/ui";

interface SubscriptionRow {
  id: string;
  student: { id: string; fullName: string; studentCode: string };
  periodYear: number;
  periodMonth: number;
  amount: number;
  discount: number;
  paidAmount: number;
  remaining: number;
  dueDate: string;
  status: string;
  notes: string | null;
}

const STATUSES = ["PAID", "PARTIAL", "UNPAID", "OVERDUE", "WAIVED"];

function toneFor(status: string) {
  if (status === "PAID") return "success" as const;
  if (status === "PARTIAL") return "warning" as const;
  if (status === "OVERDUE") return "danger" as const;
  if (status === "WAIVED") return "brand" as const;
  return "neutral" as const;
}

export default function SubscriptionsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [year, monthNum] = month.split("-").map(Number);
  const query = qs({ periodYear: year, periodMonth: monthNum, status: status || undefined, page, pageSize: 25 });
  const { data, loading, error, reload } = useApi<{
    subscriptions: SubscriptionRow[];
    totals: { billed: number; collected: number; outstanding: number };
    pagination: { page: number; totalPages: number };
  }>(`/api/subscriptions${query}`);

  const [genOpen, setGenOpen] = useState(false);
  const [genAmount, setGenAmount] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number } | null>(null);

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setGenerating(true);
    setGenError(null);
    try {
      const result = await apiPost<{ created: number; skipped: number }>("/api/subscriptions/generate", {
        periodYear: year,
        periodMonth: monthNum,
        amount: genAmount.trim() ? Number(genAmount) : undefined
      });
      setGenResult(result);
      toast.success(t("common.saved"));
      reload();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate subscriptions.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("subscriptions.title")}
        actions={
          <button type="button" className="btn-primary" onClick={() => setGenOpen(true)}>
            {t("subscriptions.generate")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <Field label={t("common.month")}>
          {(id) => (
            <input
              id={id}
              type="month"
              className="input"
              value={month}
              onChange={(e) => {
                setPage(1);
                setMonth(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t("common.status")}>
          {(id) => (
            <select
              id={id}
              className="input"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">{t("common.all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Billed" value={formatMoneyClient(data.totals.billed)} />
          <StatCard label="Collected" value={formatMoneyClient(data.totals.collected)} tone="positive" />
          <StatCard label="Outstanding" value={formatMoneyClient(data.totals.outstanding)} tone="negative" />
        </div>
      )}

      <DataTable
        columns={[t("common.student"), "Period", "Amount", "Discount", "Paid", "Remaining", "Due", t("common.status")]}
        loading={loading}
        isEmpty={(data?.subscriptions.length ?? 0) === 0}
        emptyTitle={t("subscriptions.empty")}
      >
        {data?.subscriptions.map((s) => (
          <tr key={s.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3 font-medium">
              {s.student.fullName}
              <span className="ms-2 font-mono text-xs text-black/45 dark:text-white/45">{s.student.studentCode}</span>
            </td>
            <td className="p-3">
              {s.periodYear}-{String(s.periodMonth).padStart(2, "0")}
            </td>
            <td className="p-3">{formatMoneyClient(s.amount)}</td>
            <td className="p-3">{formatMoneyClient(s.discount)}</td>
            <td className="p-3">{formatMoneyClient(s.paidAmount)}</td>
            <td className="p-3">{formatMoneyClient(s.remaining)}</td>
            <td className="p-3">{formatDate(s.dueDate)}</td>
            <td className="p-3">
              <Badge tone={toneFor(s.status)}>{s.status}</Badge>
            </td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />

      <Modal open={genOpen} title={t("subscriptions.generate")} onClose={() => setGenOpen(false)}>
        <form onSubmit={handleGenerate} className="space-y-3">
          <ErrorNotice message={genError} />
          <p className="text-sm text-black/60 dark:text-white/60">
            Creates a charge for every active student's primary group for {month}. Existing charges for this period
            are left untouched.
          </p>
          <Field label="Amount override" hint="Leave blank to use the default monthly amount from Settings">
            {(id) => <input id={id} type="number" min={0} className="input" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} />}
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
              {generating ? t("common.loading") : t("subscriptions.generate")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
