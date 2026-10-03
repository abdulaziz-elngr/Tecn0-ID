"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPatch, apiPost, useApi } from "@/lib/client";
import { Badge, ErrorNotice, Field, PageHeader, useToast } from "@/components/ui";

interface SettingsData {
  center: {
    name: string;
    address: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    currency: string;
    timezone: string;
    logoUrl: string | null;
  };
  attendanceRules: {
    respectCapacity: boolean;
    maxMakeUpsPerMonth: number;
    maxDaysAfterOrigin: number;
  };
  lateThresholdMinutes: number;
  paymentRules: {
    defaultMonthlyAmount: number;
    dueDayOfMonth: number;
    allowPartialPayments: boolean;
  };
  analyticsThresholds: {
    lowAttendancePercent: number;
    lowGradePercent: number;
    decliningTrend: number;
    improvingTrend: number;
    missingAssignmentsCount: number;
    repeatedAbsenceCount: number;
  };
}

export default function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<SettingsData>("/api/settings");

  const { data: stages } = useApi<{ id: string; name: string; isActive: boolean }[]>("/api/stages");
  const { data: fees, reload: reloadFees } = useApi<
    { id: string; amount: string; isActive: boolean; effectiveFrom: string; stage: { id: string; name: string } }[]
  >("/api/settings/fees");
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [savingFee, setSavingFee] = useState<string | null>(null);

  async function saveFee(stageId: string) {
    const amount = Number(feeDraft[stageId]);
    if (!amount || amount <= 0) return;
    setSavingFee(stageId);
    try {
      await apiPost("/api/settings/fees", { stageId, amount });
      toast.success(t("common.saved"));
      setFeeDraft((d) => ({ ...d, [stageId]: "" }));
      reloadFees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save fee.");
    } finally {
      setSavingFee(null);
    }
  }

  async function toggleFeeActive(fee: { id: string; isActive: boolean }) {
    try {
      await apiPatch(`/api/settings/fees/${fee.id}`, { isActive: !fee.isActive });
      reloadFees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update fee.");
    }
  }

  const [form, setForm] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  async function saveSection(payload: Record<string, unknown>, key: string) {
    setSaving(key);
    setSaveError(null);
    try {
      await apiPatch("/api/settings", payload);
      toast.success(t("settings.saved"));
      reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(null);
    }
  }

  if (loading || !form) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("settings.title")} />
        <ErrorNotice message={error} />
        {loading && <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} />
      <ErrorNotice message={error ?? saveError} />

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t("settings.center")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            {(id) => (
              <input id={id} className="input" value={form.center.name} onChange={(e) => setForm({ ...form, center: { ...form.center, name: e.target.value } })} />
            )}
          </Field>
          <Field label="Currency">
            {(id) => (
              <input id={id} className="input" value={form.center.currency} onChange={(e) => setForm({ ...form, center: { ...form.center, currency: e.target.value } })} />
            )}
          </Field>
          <Field label="Phone">
            {(id) => (
              <input
                id={id}
                className="input"
                value={form.center.phone ?? ""}
                onChange={(e) => setForm({ ...form, center: { ...form.center, phone: e.target.value } })}
              />
            )}
          </Field>
          <Field label="WhatsApp number">
            {(id) => (
              <input
                id={id}
                className="input"
                value={form.center.whatsappNumber ?? ""}
                onChange={(e) => setForm({ ...form, center: { ...form.center, whatsappNumber: e.target.value } })}
              />
            )}
          </Field>
          <Field label="Address">
            {(id) => (
              <input
                id={id}
                className="input"
                value={form.center.address ?? ""}
                onChange={(e) => setForm({ ...form, center: { ...form.center, address: e.target.value } })}
              />
            )}
          </Field>
          <Field label="Timezone">
            {(id) => (
              <input
                id={id}
                className="input"
                value={form.center.timezone}
                onChange={(e) => setForm({ ...form, center: { ...form.center, timezone: e.target.value } })}
              />
            )}
          </Field>
        </div>
        <button type="button" className="btn-primary" disabled={saving === "center"} onClick={() => saveSection({ center: form.center }, "center")}>
          {saving === "center" ? t("common.loading") : t("common.save")}
        </button>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t("settings.attendanceRules")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.attendanceRules.respectCapacity}
              onChange={(e) => setForm({ ...form, attendanceRules: { ...form.attendanceRules, respectCapacity: e.target.checked } })}
              className="h-4 w-4"
            />
            Enforce group capacity (spec §3, §9)
          </label>
          <Field label="Max make-ups / month" hint="0 = unlimited">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                className="input"
                value={form.attendanceRules.maxMakeUpsPerMonth}
                onChange={(e) =>
                  setForm({ ...form, attendanceRules: { ...form.attendanceRules, maxMakeUpsPerMonth: Number(e.target.value) } })
                }
              />
            )}
          </Field>
          <Field label="Make-up window (days)" hint="0 = no limit">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                className="input"
                value={form.attendanceRules.maxDaysAfterOrigin}
                onChange={(e) =>
                  setForm({ ...form, attendanceRules: { ...form.attendanceRules, maxDaysAfterOrigin: Number(e.target.value) } })
                }
              />
            )}
          </Field>
          <Field label="Late threshold (minutes)">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                className="input"
                value={form.lateThresholdMinutes}
                onChange={(e) => setForm({ ...form, lateThresholdMinutes: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={saving === "attendanceRules"}
          onClick={() =>
            saveSection(
              { attendanceRules: form.attendanceRules, lateThresholdMinutes: form.lateThresholdMinutes },
              "attendanceRules"
            )
          }
        >
          {saving === "attendanceRules" ? t("common.loading") : t("common.save")}
        </button>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t("settings.fees")}</h2>
        <p className="text-xs text-black/50 dark:text-white/50">
          Configured per Stage — never hard-coded. Adding a new fee for a stage automatically deactivates its
          previous fee.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-black/5 text-black/60 dark:border-white/10 dark:text-white/60">
              <tr>
                <th className="p-2 text-start">{t("nav.stages")}</th>
                <th className="p-2 text-start">Current fee</th>
                <th className="p-2 text-start">{t("common.status")}</th>
                <th className="p-2 text-start">New amount</th>
              </tr>
            </thead>
            <tbody>
              {(stages ?? [])
                .filter((s) => s.isActive)
                .map((stage) => {
                  const stageFees = (fees ?? []).filter((f) => f.stage.id === stage.id);
                  const active = stageFees.find((f) => f.isActive);
                  return (
                    <tr key={stage.id} className="border-b border-black/5 dark:border-white/5">
                      <td className="p-2 font-medium">{stage.name}</td>
                      <td className="p-2">{active ? `${active.amount}` : "—"}</td>
                      <td className="p-2">
                        {active && (
                          <button type="button" onClick={() => toggleFeeActive(active)}>
                            <Badge tone="success">{t("common.active")}</Badge>
                          </button>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <input
                            className="input w-28 py-1"
                            type="number"
                            min={0}
                            value={feeDraft[stage.id] ?? ""}
                            onChange={(e) => setFeeDraft((d) => ({ ...d, [stage.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1 text-xs"
                            disabled={savingFee === stage.id}
                            onClick={() => saveFee(stage.id)}
                          >
                            {t("common.save")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t("settings.paymentRules")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default monthly amount">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                className="input"
                value={form.paymentRules.defaultMonthlyAmount}
                onChange={(e) => setForm({ ...form, paymentRules: { ...form.paymentRules, defaultMonthlyAmount: Number(e.target.value) } })}
              />
            )}
          </Field>
          <Field label="Due day of month">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={28}
                className="input"
                value={form.paymentRules.dueDayOfMonth}
                onChange={(e) => setForm({ ...form, paymentRules: { ...form.paymentRules, dueDayOfMonth: Number(e.target.value) } })}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.paymentRules.allowPartialPayments}
              onChange={(e) => setForm({ ...form, paymentRules: { ...form.paymentRules, allowPartialPayments: e.target.checked } })}
              className="h-4 w-4"
            />
            Allow partial payments
          </label>
        </div>
        <button type="button" className="btn-primary" disabled={saving === "paymentRules"} onClick={() => saveSection({ paymentRules: form.paymentRules }, "paymentRules")}>
          {saving === "paymentRules" ? t("common.loading") : t("common.save")}
        </button>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t("settings.analytics")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Low attendance (%)">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                max={100}
                className="input"
                value={form.analyticsThresholds.lowAttendancePercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    analyticsThresholds: { ...form.analyticsThresholds, lowAttendancePercent: Number(e.target.value) }
                  })
                }
              />
            )}
          </Field>
          <Field label="Low average grade (%)">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                max={100}
                className="input"
                value={form.analyticsThresholds.lowGradePercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    analyticsThresholds: { ...form.analyticsThresholds, lowGradePercent: Number(e.target.value) }
                  })
                }
              />
            )}
          </Field>
          <Field label="Consecutive absence warning">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                className="input"
                value={form.analyticsThresholds.repeatedAbsenceCount}
                onChange={(e) =>
                  setForm({
                    ...form,
                    analyticsThresholds: { ...form.analyticsThresholds, repeatedAbsenceCount: Number(e.target.value) }
                  })
                }
              />
            )}
          </Field>
          <Field label="Missing assignments warning">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                className="input"
                value={form.analyticsThresholds.missingAssignmentsCount}
                onChange={(e) =>
                  setForm({
                    ...form,
                    analyticsThresholds: { ...form.analyticsThresholds, missingAssignmentsCount: Number(e.target.value) }
                  })
                }
              />
            )}
          </Field>
          <Field label="Declining trend slope" hint="Exam trend at or below this is flagged as declining">
            {(id) => (
              <input
                id={id}
                type="number"
                className="input"
                value={form.analyticsThresholds.decliningTrend}
                onChange={(e) =>
                  setForm({
                    ...form,
                    analyticsThresholds: { ...form.analyticsThresholds, decliningTrend: Number(e.target.value) }
                  })
                }
              />
            )}
          </Field>
          <Field label="Improving trend slope" hint="Exam trend at or above this is flagged as improving">
            {(id) => (
              <input
                id={id}
                type="number"
                className="input"
                value={form.analyticsThresholds.improvingTrend}
                onChange={(e) =>
                  setForm({
                    ...form,
                    analyticsThresholds: { ...form.analyticsThresholds, improvingTrend: Number(e.target.value) }
                  })
                }
              />
            )}
          </Field>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={saving === "analyticsThresholds"}
          onClick={() => saveSection({ analyticsThresholds: form.analyticsThresholds }, "analyticsThresholds")}
        >
          {saving === "analyticsThresholds" ? t("common.loading") : t("common.save")}
        </button>
      </section>

    </div>
  );
}
