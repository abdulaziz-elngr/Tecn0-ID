"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPatch, apiPost, formatDate, formatMoneyClient, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, Field, Modal, PageHeader, StatCard, useToast } from "@/components/ui";

interface BranchOption {
  id: string;
  name: string;
}

interface BillRow {
  id: string;
  type: "ELECTRICITY" | "WATER";
  meterNumber: string;
  periodStart: string;
  periodEnd: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  amount: number;
  dueDate: string;
  status: string;
}

function toneFor(status: string) {
  if (status === "PAID") return "success" as const;
  if (status === "OVERDUE") return "danger" as const;
  return "warning" as const;
}

export default function UtilitiesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ bills: BillRow[]; totals: { outstanding: number } }>(
    "/api/utility-bills?pageSize=100"
  );
  const { data: branches } = useApi<BranchOption[]>("/api/branches");

  const [modalOpen, setModalOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [type, setType] = useState<"ELECTRICITY" | "WATER">("ELECTRICITY");
  const [meterNumber, setMeterNumber] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [previousReading, setPreviousReading] = useState("");
  const [currentReading, setCurrentReading] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [settling, setSettling] = useState<string | null>(null);

  function openCreate() {
    setBranchId(branches?.[0]?.id ?? "");
    setType("ELECTRICITY");
    setMeterNumber("");
    setPeriodStart("");
    setPeriodEnd("");
    setPreviousReading("");
    setCurrentReading("");
    setAmount("");
    setDueDate("");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await apiPost("/api/utility-bills", {
        branchId,
        type,
        meterNumber: meterNumber.trim(),
        periodStart,
        periodEnd,
        previousReading: Number(previousReading),
        currentReading: Number(currentReading),
        amount: Number(amount),
        dueDate
      });
      toast.success(t("common.created"));
      setModalOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save bill.");
    } finally {
      setSubmitting(false);
    }
  }

  async function settleBill(bill: BillRow) {
    setSettling(bill.id);
    try {
      await apiPatch(`/api/utility-bills/${bill.id}`, { markPaid: true, createExpense: true });
      toast.success(t("common.saved"));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to settle bill.");
    } finally {
      setSettling(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("utilities.title")}
        actions={
          <button type="button" className="btn-primary" onClick={openCreate} disabled={!branches?.length}>
            {t("utilities.add")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      {data && <StatCard label="Outstanding" value={formatMoneyClient(data.totals.outstanding)} tone="negative" />}

      <DataTable
        columns={["Type", "Meter", "Period", "Consumption", t("common.amount"), "Due", t("common.status"), t("common.actions")]}
        loading={loading}
        isEmpty={(data?.bills.length ?? 0) === 0}
        emptyTitle={t("utilities.empty")}
      >
        {data?.bills.map((b) => (
          <tr key={b.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3">{b.type}</td>
            <td className="p-3 font-mono text-xs">{b.meterNumber}</td>
            <td className="p-3">
              {formatDate(b.periodStart)} – {formatDate(b.periodEnd)}
            </td>
            <td className="p-3">{b.consumption}</td>
            <td className="p-3">{formatMoneyClient(b.amount)}</td>
            <td className="p-3">{formatDate(b.dueDate)}</td>
            <td className="p-3">
              <Badge tone={toneFor(b.status)}>{b.status}</Badge>
            </td>
            <td className="p-3">
              {b.status !== "PAID" && (
                <button type="button" className="text-xs hover:underline" disabled={settling === b.id} onClick={() => settleBill(b)}>
                  {settling === b.id ? t("common.loading") : t("utilities.markPaid")}
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal open={modalOpen} title={t("utilities.add")} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <ErrorNotice message={formError} />
          <Field label={t("common.branch")} required>
            {(id) => (
              <select id={id} className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Type" required>
            {(id) => (
              <select id={id} className="input" value={type} onChange={(e) => setType(e.target.value as "ELECTRICITY" | "WATER")} required>
                <option value="ELECTRICITY">ELECTRICITY</option>
                <option value="WATER">WATER</option>
              </select>
            )}
          </Field>
          <Field label="Meter number" required>
            {(id) => (
              <input id={id} className="input" value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} required />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period start" required>
              {(id) => (
                <input id={id} type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
              )}
            </Field>
            <Field label="Period end" required>
              {(id) => (
                <input id={id} type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Previous reading" required>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  className="input"
                  value={previousReading}
                  onChange={(e) => setPreviousReading(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Current reading" required>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={0}
                  className="input"
                  value={currentReading}
                  onChange={(e) => setCurrentReading(e.target.value)}
                  required
                />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.amount")} required>
              {(id) => (
                <input id={id} type="number" min={0} step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              )}
            </Field>
            <Field label="Due date" required>
              {(id) => <input id={id} type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />}
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !branchId || !meterNumber.trim()}>
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
