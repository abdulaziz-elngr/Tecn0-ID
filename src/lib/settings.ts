import { db } from "./db";
import { DEFAULT_MAKEUP_RULES, type MakeUpRules } from "./attendance";
import { DEFAULT_THRESHOLDS, type AnalyticsThresholds } from "./analytics";

/**
 * Typed access to per-organization settings stored in SystemSetting.
 * Every getter falls back to a documented default so a fresh
 * organization works before anyone opens the Settings screen.
 */

export const SETTING_KEYS = {
  attendanceRules: "attendance.rules",
  lateThreshold: "attendance.lateThresholdMinutes",
  analyticsThresholds: "analytics.thresholds",
  paymentRules: "payment.rules",
  whatsapp: "whatsapp.settings",
  general: "general"
} as const;

export interface PaymentRules {
  defaultMonthlyAmount: number;
  dueDayOfMonth: number;
  allowPartialPayments: boolean;
}

export const DEFAULT_PAYMENT_RULES: PaymentRules = {
  defaultMonthlyAmount: 500,
  dueDayOfMonth: 5,
  allowPartialPayments: true
};

async function readSetting<T>(organizationId: string, key: string, fallback: T): Promise<T> {
  const row = await db.systemSetting.findUnique({
    where: { organizationId_key: { organizationId, key } }
  });
  if (!row) return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

export function getMakeUpRules(organizationId: string): Promise<MakeUpRules> {
  return readSetting(organizationId, SETTING_KEYS.attendanceRules, DEFAULT_MAKEUP_RULES);
}

export function getAnalyticsThresholds(organizationId: string): Promise<AnalyticsThresholds> {
  return readSetting(organizationId, SETTING_KEYS.analyticsThresholds, DEFAULT_THRESHOLDS);
}

export function getPaymentRules(organizationId: string): Promise<PaymentRules> {
  return readSetting(organizationId, SETTING_KEYS.paymentRules, DEFAULT_PAYMENT_RULES);
}

export async function getLateThresholdMinutes(organizationId: string): Promise<number> {
  const row = await db.systemSetting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.lateThreshold } }
  });
  const value = row?.value as { minutes?: number } | undefined;
  return typeof value?.minutes === "number" ? value.minutes : 15;
}

export async function setSetting(organizationId: string, key: string, value: object) {
  return db.systemSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { value },
    create: { organizationId, key, value }
  });
}

export async function getCenterProfile(organizationId: string) {
  const center = await db.center.findFirst({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      address: true,
      phone: true,
      whatsappNumber: true,
      currency: true,
      timezone: true
    }
  });
  return (
    center ?? {
      id: "",
      name: "TecnoID",
      logoUrl: "/logo.png",
      address: null,
      phone: null,
      whatsappNumber: null,
      currency: "EGP",
      timezone: "Africa/Cairo"
    }
  );
}
