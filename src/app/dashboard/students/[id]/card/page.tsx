"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/client";
import { ErrorNotice, PageHeader } from "@/components/ui";
import { Barcode } from "@/components/Barcode";

interface ProfileData {
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    photoUrl: string | null;
    branch: { name: string };
    stage: { name: string } | null;
    grade: { name: string } | null;
    group: { name: string } | null;
  };
}

const SIZES = [
  { key: "print-size-40x30", label: "40 × 30 mm" },
  { key: "print-size-58x40", label: "58 × 40 mm" }
] as const;

/** Barcode sticker printing (spec §6, §7) — thermal-printer-ready, configurable size. */
export default function StudentCardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useApi<ProfileData>(`/api/students/${params.id}/profile`);
  const [size, setSize] = useState<(typeof SIZES)[number]["key"]>("print-size-58x40");

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("students.card")} />
        <ErrorNotice message={error} />
        {loading && <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>}
      </div>
    );
  }

  const { student } = data;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t("students.card")} />
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
            {SIZES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => router.push(`/dashboard/students/${student.id}`)}>
            {t("common.back")}
          </button>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            {t("common.print")}
          </button>
        </div>
      </div>

      <ErrorNotice message={error} />

      <div
        className={`print-sheet ${size} card mx-auto flex w-full max-w-sm flex-col items-center gap-2 border-2 border-tecno-gold p-4 text-center`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-tecno-gold-dark dark:text-tecno-gold">
          TecnoID
        </p>

        {student.photoUrl ? (
          <Image
            src={student.photoUrl}
            alt={student.fullName}
            width={72}
            height={72}
            className="rounded-full border-2 border-black/10 object-cover dark:border-white/10"
            unoptimized
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/5 text-xl font-bold dark:bg-white/10">
            {student.fullName.slice(0, 1)}
          </div>
        )}

        <p className="text-sm font-bold leading-tight">{student.fullName}</p>

        <div className="grid w-full grid-cols-1 gap-0.5 text-[10px] leading-tight text-black/60 dark:text-white/60">
          <span>{[student.stage?.name, student.grade?.name, student.group?.name].filter(Boolean).join(" · ")}</span>
        </div>

        {/* The exact value stored in Student.studentCode — what the attendance scanner looks up. */}
        <Barcode value={student.studentCode} invalidLabel={t("students.barcodeInvalid")} className="mt-1" />
      </div>
    </div>
  );
}
