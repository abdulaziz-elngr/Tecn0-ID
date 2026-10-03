"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPost, formatDate, formatMoneyClient, qs, todayISO, useApi } from "@/lib/client";
import { DataTable, ErrorNotice, Field, Modal, PageHeader, Pager, StatCard, useToast } from "@/components/ui";

interface BranchOption {
  id: string;
  name: string;
}

interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  spentAt: string;
  vendor: string | null;
  description: string | null;
  method: string;
}

const CATEGORIES = [
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "RENT",
  "SALARIES",
  "MAINTENANCE",
  "CLEANING",
  "EQUIPMENT",
  "SUPPLIES",
  "OTHER"
];
const METHODS = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"];

export default function ExpensesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useApi<{
    expenses: ExpenseRow[];
    totals: { total: number; byCategory: { category: string; amount: number }[] };
    pagination: { page: number; totalPages: number };
  }>(`/api/expenses${qs({ category: category || undefined, page, pageSize: 25 })}`);
  const { data: branches } = useApi<BranchOption[]>("/api/branches");

  const [modalOpen, setModalOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [formCategory, setFormCategory] = useState("OTHER");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [vendor, setVendor] = useState("");
  const [method, setMethod] = useState("CASH");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setBranchId(branches?.[0]?.id ?? "");
    setFormCategory("OTHER");
    setAmount("");
    setSpentAt(todayISO());
    setVendor("");
    setMethod("CASH");
    setDescription("");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await apiPost("/api/expenses", {
        branchId,
        category: formCategory,
        amount: Number(amount),
        spentAt: new Date(spentAt).toISOString(),
        vendor: vendor.trim() || undefined,
        method,
        description: description.trim() || undefined
      });
      toast.success(t("common.created"));
      setModalOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record expense.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("expenses.title")}
        actions={
          <button type="button" className="btn-primary" onClick={openCreate} disabled={!branches?.length}>
            {t("expenses.add")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      {data && <StatCard label="Total" value={formatMoneyClient(data.totals.total)} tone="negative" />}

      <select
        className="input max-w-xs"
        value={category}
        onChange={(e) => {
          setPage(1);
          setCategory(e.target.value);
        }}
      >
        <option value="">{t("common.all")}</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <DataTable
        columns={[t("common.date"), "Category", "Vendor", t("common.amount"), "Method", t("common.notes")]}
        loading={loading}
        isEmpty={(data?.expenses.length ?? 0) === 0}
        emptyTitle={t("expenses.empty")}
      >
        {data?.expenses.map((e) => (
          <tr key={e.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3">{formatDate(e.spentAt)}</td>
            <td className="p-3">{e.category}</td>
            <td className="p-3">{e.vendor ?? "—"}</td>
            <td className="p-3">{formatMoneyClient(e.amount)}</td>
            <td className="p-3">{e.method}</td>
            <td className="p-3 text-xs text-black/55 dark:text-white/55">{e.description ?? "—"}</td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />

      <Modal open={modalOpen} title={t("expenses.add")} onClose={() => setModalOpen(false)}>
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
          <Field label="Category" required>
            {(id) => (
              <select id={id} className="input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} required>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("common.amount")} required>
            {(id) => (
              <input id={id} type="number" min={0.01} step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            )}
          </Field>
          <Field label={t("common.date")} required>
            {(id) => <input id={id} type="date" className="input" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} required />}
          </Field>
          <Field label="Vendor">
            {(id) => <input id={id} className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />}
          </Field>
          <Field label="Method">
            {(id) => (
              <select id={id} className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("common.notes")}>
            {(id) => <textarea id={id} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !amount || !branchId}>
              {submitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
