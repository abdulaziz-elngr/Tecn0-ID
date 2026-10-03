"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, qs, useApi } from "@/lib/client";
import { DataTable, ErrorNotice, Field, PageHeader, Pager } from "@/components/ui";

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string | null } | null;
}

export default function AuditLogsPage() {
  const { t } = useI18n();
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error } = useApi<{
    logs: AuditLogRow[];
    pagination: { page: number; totalPages: number };
  }>(
    `/api/audit-logs${qs({
      action: action || undefined,
      entityType: entityType || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: 30
    })}`
  );

  return (
    <div className="space-y-5">
      <PageHeader title={t("audit.title")} />

      <ErrorNotice message={error} />

      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Action">
          {(id) => (
            <input
              id={id}
              className="input"
              placeholder="e.g. VOID_PAYMENT"
              value={action}
              onChange={(e) => {
                setPage(1);
                setAction(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Entity type">
          {(id) => (
            <input
              id={id}
              className="input"
              placeholder="e.g. Payment"
              value={entityType}
              onChange={(e) => {
                setPage(1);
                setEntityType(e.target.value);
              }}
            />
          )}
        </Field>
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
      </div>

      <DataTable
        columns={[t("common.date"), "Actor", "Action", "Entity", t("common.reason")]}
        loading={loading}
        isEmpty={(data?.logs.length ?? 0) === 0}
        emptyTitle={t("audit.empty")}
      >
        {data?.logs.map((log) => (
          <tr key={log.id} className="border-b border-black/5 dark:border-white/5">
            <td className="p-3 text-xs">{formatDateTime(log.createdAt)}</td>
            <td className="p-3 text-sm">{log.actor?.fullName ?? "System"}</td>
            <td className="p-3 font-mono text-xs">{log.action}</td>
            <td className="p-3 text-xs">
              {log.entityType}
              {log.entityId && <span className="text-black/40 dark:text-white/40"> #{log.entityId.slice(0, 8)}</span>}
            </td>
            <td className="p-3 text-xs text-black/60 dark:text-white/60">{log.reason ?? "—"}</td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
