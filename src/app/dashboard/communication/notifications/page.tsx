"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPatch, formatDateTime, qs, useApi } from "@/lib/client";
import { Badge, DataTable, ErrorNotice, PageHeader, Pager, useToast } from "@/components/ui";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useApi<{
    notifications: NotificationRow[];
    unread: number;
    pagination: { page: number; totalPages: number };
  }>(`/api/notifications${qs({ unreadOnly: unreadOnly ? "true" : undefined, page, pageSize: 25 })}`);

  async function markRead(id: string) {
    try {
      await apiPatch(`/api/notifications/${id}`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notification.");
    }
  }

  async function markAllRead() {
    try {
      await apiPatch("/api/notifications");
      toast.success(t("common.saved"));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notifications.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("notifications.title")}
        description={data ? `${data.unread} unread` : undefined}
        actions={
          <button type="button" className="btn-secondary" onClick={markAllRead} disabled={!data?.unread}>
            {t("notifications.markAllRead")}
          </button>
        }
      />

      <ErrorNotice message={error} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => {
            setPage(1);
            setUnreadOnly(e.target.checked);
          }}
          className="h-4 w-4"
        />
        {t("notifications.unreadOnly")}
      </label>

      <DataTable
        columns={["Type", "Title", "Body", t("common.date"), t("common.status")]}
        loading={loading}
        isEmpty={(data?.notifications.length ?? 0) === 0}
        emptyTitle={t("notifications.empty")}
      >
        {data?.notifications.map((n) => (
          <tr
            key={n.id}
            className={`border-b border-black/5 dark:border-white/5 ${n.isRead ? "" : "bg-tecno-gold/5"}`}
          >
            <td className="p-3">
              <Badge tone="neutral">{n.type}</Badge>
            </td>
            <td className="p-3 font-medium">{n.title}</td>
            <td className="max-w-sm p-3 text-xs text-black/60 dark:text-white/60">{n.body}</td>
            <td className="p-3">{formatDateTime(n.createdAt)}</td>
            <td className="p-3">
              {n.isRead ? (
                <span className="text-xs text-black/40 dark:text-white/40">{t("notifications.read")}</span>
              ) : (
                <button type="button" className="text-xs hover:underline" onClick={() => markRead(n.id)}>
                  {t("notifications.markRead")}
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      <Pager page={data?.pagination.page ?? 1} totalPages={data?.pagination.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
