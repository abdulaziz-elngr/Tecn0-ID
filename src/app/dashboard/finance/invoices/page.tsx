"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoneyClient, qs, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, PageHeader, Pager } from "@/components/ui";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  student: { id: string; fullName: string; studentCode: string };
  payment: { id: string; method: string; receiptNumber: string; status: string } | null;
}

export default function InvoicesPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error } = useApi<{
    invoices: InvoiceRow[];
    pagination: { page: number; totalPages: number };
  }>(`/api/invoices${qs({ search: search || undefined, page, pageSize: 25 })}`);

  return (
    <div className="space-y-5">
      <PageHeader title={t("invoices.title")} />

      <ErrorNotice message={error} />

      <input
        className="input max-w-sm"
        placeholder={t("common.search")}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
      />

      <DataTable
        columns={["Invoice #", t("common.student"), t("common.date"), t("common.amount"), "Paid", "Remaining", t("common.status")]}
        loading={loading}
        isEmpty={(data?.invoices.length ?? 0) === 0}
        emptyTitle={t("invoices.empty")}
      >
        {data?.invoices.map((i) => (
          <tr key={i.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3 font-mono text-xs">
              <Link href={`/dashboard/finance/invoices/${i.id}`} className="hover:underline">
                {i.invoiceNumber}
              </Link>
            </td>
            <td className="p-3 font-medium">
              {i.student.fullName}
              <span className="ms-2 font-mono text-xs text-black/45 dark:text-white/45">{i.student.studentCode}</span>
            </td>
            <td className="p-3">{formatDate(i.issuedAt)}</td>
            <td className="p-3">{formatMoneyClient(i.totalAmount)}</td>
            <td className="p-3">{formatMoneyClient(i.paidAmount)}</td>
            <td className="p-3">{formatMoneyClient(i.remainingAmount)}</td>
            <td className="p-3">
              <Badge tone={i.status === "VOID" ? "danger" : "success"}>{i.status}</Badge>
            </td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
