"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { apiPost, formatDateTime, todayISO, useApi } from "@/lib/client";
import { Badge, ErrorNotice, Field, PageHeader } from "@/components/ui";

/**
 * Attendance scanner (spec §8–§13).
 *
 * Flow: Stage -> Grade -> Group -> Generate/pick today's session ->
 * scan. A USB/Bluetooth barcode gun works with zero clicks since the
 * code input stays focused; it types the code and sends Enter.
 *
 * Cross-group scans (spec §10) never write silently: the API replies
 * with status "NEEDS_CONFIRMATION" and this page shows the "Student
 * belongs to another group" panel with Accept make-up / Reject — only
 * Accept resubmits the same scan with confirmMakeUp:true.
 */

interface StageOption {
  id: string;
  name: string;
  isActive: boolean;
  grades: { id: string; name: string; isActive: boolean }[];
}

interface GroupOption {
  id: string;
  name: string;
  gradeId: string;
  capacity: number;
  currentCount: number;
}

interface SessionRow {
  id: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  status: string;
  group: {
    id: string;
    name: string;
    capacity: number;
    grade: { id: string; name: string; stage: { id: string; name: string } };
    teacher: { id: string; fullName: string } | null;
  };
  _count: { attendances: number };
}

interface StudentCard {
  id: string;
  fullName: string;
  studentCode: string;
  photoUrl: string | null;
  currentGroup?: { id: string; name: string } | null;
}
interface SessionCard {
  id: string;
  groupId: string;
  groupName: string;
  gradeName: string;
  stageName: string;
}

interface ScanResult {
  status: "ACCEPTED" | "REJECTED" | "NEEDS_CONFIRMATION";
  code: string;
  message: string;
  student?: StudentCard;
  session?: SessionCard;
  attendance?: { id: string; type: string; recordedAt: string };
  currentGroup?: { id: string; name: string } | null;
  selectedGroup?: { id: string; name: string };
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export default function ScannerPage() {
  const { t } = useI18n();
  const today = todayISO();

  const { data: stages } = useApi<StageOption[]>("/api/stages");
  const { data: groups } = useApi<GroupOption[]>("/api/groups");

  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [groupId, setGroupId] = useState("");

  const selectedStage = stages?.find((s) => s.id === stageId);
  const gradesForStage = selectedStage?.grades.filter((g) => g.isActive) ?? [];
  const groupsForGrade = useMemo(() => (groups ?? []).filter((g) => g.gradeId === gradeId), [groups, gradeId]);

  const {
    data,
    loading: sessionsLoading,
    reload: reloadSessions
  } = useApi<{ sessions: SessionRow[] }>(
    groupId ? `/api/sessions?groupId=${groupId}&from=${today}&to=${today}&pageSize=10` : null
  );
  const sessions = data?.sessions ?? [];

  const [sessionId, setSessionId] = useState("");
  useEffect(() => {
    setSessionId(sessions[0]?.id ?? "");
  }, [sessions]);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function generateSession() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const now = nowMinutes();
      await apiPost("/api/sessions", {
        groupId,
        date: today,
        startTimeMinutes: Math.max(0, now - 5),
        endTimeMinutes: Math.min(1439, now + 120)
      });
      reloadSessions();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate session.");
    } finally {
      setGenerating(false);
    }
  }

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [makeUpReason, setMakeUpReason] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // -- Manual attendance (spec §11): search by name/ID/phone/parent phone --
  const [mode, setMode] = useState<"SCAN" | "MANUAL">("SCAN");
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<
    { id: string; fullName: string; studentCode: string; groupId: string; group: { name: string } | null }[]
  >([]);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  useEffect(() => {
    const term = manualQuery.trim();
    if (term.length < 2) {
      setManualResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((body) => setManualResults(body.data?.students ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [manualQuery]);

  async function markManual(studentId: string, type: "REGULAR" | "LATE" | "MAKE_UP") {
    setManualBusy(true);
    setManualMessage(null);
    try {
      await apiPost("/api/attendance", { studentId, sessionId, type });
      setManualMessage("Attendance recorded.");
      setManualQuery("");
      setManualResults([]);
    } catch (err) {
      setManualMessage(err instanceof Error ? err.message : "Failed to record attendance.");
    } finally {
      setManualBusy(false);
    }
  }

  const refocus = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    refocus();
  }, [refocus, sessionId]);

  const selected = sessions.find((s) => s.id === sessionId) ?? null;

  async function runScan(scanCode: string, confirmMakeUp: boolean) {
    setBusy(true);
    setScanError(null);
    try {
      const response = await apiPost<ScanResult>("/api/attendance/scan", {
        code: scanCode,
        sessionId,
        confirmMakeUp,
        makeUpReason: confirmMakeUp ? makeUpReason.trim() || undefined : undefined
      });
      setResult(response);
      if (response.status !== "NEEDS_CONFIRMATION") {
        setHistory((list) => [response, ...list].slice(0, 15));
        setPendingCode(null);
        setMakeUpReason("");
      } else {
        setPendingCode(scanCode);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
      setResult(null);
      setPendingCode(null);
    } finally {
      setBusy(false);
      refocus();
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || !sessionId || busy) return;
    setCode("");
    await runScan(trimmed, false);
  }

  function rejectMakeUp() {
    setResult((r) => (r ? { ...r, status: "REJECTED", message: "Make-up attendance rejected." } : r));
    setHistory((list) => {
      const rejected: ScanResult = { ...(result as ScanResult), status: "REJECTED", message: "Rejected" };
      return [rejected, ...list].slice(0, 15);
    });
    setPendingCode(null);
    setMakeUpReason("");
    refocus();
  }

  async function acceptMakeUp() {
    if (!pendingCode) return;
    await runScan(pendingCode, true);
  }

  const accepted = result?.status === "ACCEPTED";
  const needsConfirmation = result?.status === "NEEDS_CONFIRMATION";

  return (
    <div className="space-y-5">
      <PageHeader title={t("scanner.title")} description={t("scanner.subtitle")} />

      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <Field label={t("nav.stages")} required>
          {(id) => (
            <select
              id={id}
              className="input"
              value={stageId}
              onChange={(e) => {
                setStageId(e.target.value);
                setGradeId("");
                setGroupId("");
              }}
            >
              <option value="">{t("common.select")}</option>
              {(stages ?? [])
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label={t("grades.title")} required>
          {(id) => (
            <select
              id={id}
              className="input"
              value={gradeId}
              disabled={!stageId}
              onChange={(e) => {
                setGradeId(e.target.value);
                setGroupId("");
              }}
            >
              <option value="">{t("common.select")}</option>
              {gradesForStage.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("nav.groups")} required>
          {(id) => (
            <select id={id} className="input" value={groupId} disabled={!gradeId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">{t("common.select")}</option>
              {groupsForGrade.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.currentCount}/{g.capacity})
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {groupId && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="card p-4">
              {sessionsLoading && <p className="text-sm text-black/50 dark:text-white/50">{t("common.loading")}</p>}
              {!sessionsLoading && sessions.length === 0 && (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-black/60 dark:text-white/60">
                    No session yet today for this group.
                  </p>
                  <ErrorNotice message={generateError} />
                  <button type="button" className="btn-primary" onClick={generateSession} disabled={generating}>
                    {generating ? t("common.loading") : t("scanner.generateSession") }
                  </button>
                </div>
              )}
              {sessions.length > 0 && (
                <Field label={t("scanner.session")}>
                  {(id) => (
                    <select id={id} className="input text-base" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {minutesToTime(s.startMinutes)}–{minutesToTime(s.endMinutes)} · {s.group.name} (
                          {s._count.attendances}/{s.group.capacity}) · {s.status}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
            </div>

            {sessionId && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("SCAN")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "SCAN" ? "border-tecno-gold bg-tecno-gold/10" : "border-black/10 dark:border-white/10"}`}
                >
                  {t("scanner.title")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("MANUAL")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "MANUAL" ? "border-tecno-gold bg-tecno-gold/10" : "border-black/10 dark:border-white/10"}`}
                >
                  {t("scanner.manualAttendance")}
                </button>
              </div>
            )}

            {sessionId && mode === "SCAN" && (
              <form onSubmit={submit} className="card p-4">
                <Field label={t("scanner.placeholder")} required>
                  {(id) => (
                    <input
                      id={id}
                      ref={inputRef}
                      className="input py-4 text-center font-mono text-xl tracking-widest"
                      value={code}
                      autoComplete="off"
                      autoFocus
                      inputMode="text"
                      disabled={busy || needsConfirmation}
                      onChange={(e) => setCode(e.target.value)}
                      onBlur={() => setTimeout(refocus, 80)}
                      placeholder={t("scanner.placeholder")}
                    />
                  )}
                </Field>
                <button
                  type="submit"
                  className="btn-primary mt-4 w-full py-3 text-base"
                  disabled={busy || needsConfirmation}
                >
                  {busy ? t("common.loading") : t("common.confirm")}
                </button>
              </form>
            )}

            {sessionId && mode === "MANUAL" && (
              <div className="card space-y-3 p-4">
                <input
                  className="input"
                  placeholder="Search by name, ID, phone or parent phone"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                />
                {manualMessage && <p className="text-sm text-black/60 dark:text-white/60">{manualMessage}</p>}
                <ul className="divide-y divide-black/5 dark:divide-white/5">
                  {manualResults.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <p className="font-medium">{s.fullName}</p>
                        <p className="text-xs text-black/50 dark:text-white/50">
                          {s.studentCode} · {s.group?.name ?? "—"}
                          {s.groupId !== selected?.group.id && (
                            <span className="ms-1 text-amber-600 dark:text-amber-400">(different group)</span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={manualBusy}
                          onClick={() => markManual(s.id, s.groupId === selected?.group.id ? "REGULAR" : "MAKE_UP")}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={manualBusy}
                          onClick={() => markManual(s.id, "LATE")}
                        >
                          Late
                        </button>
                        {s.groupId !== selected?.group.id && (
                          <button
                            type="button"
                            className="btn-secondary px-2 py-1 text-xs"
                            disabled={manualBusy}
                            onClick={() => markManual(s.id, "MAKE_UP")}
                          >
                            {t("scanner.makeup")}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ErrorNotice message={scanError} />

            {/* Spec §10: "Student belongs to another group" confirmation. */}
            {needsConfirmation && result && (
              <div className="card border-2 border-amber-500/60 p-5" role="alertdialog" aria-live="assertive">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{t("scanner.differentGroup")}</p>
                <p className="mt-2">
                  {result.student?.fullName}{" "}
                  <span className="font-mono text-xs text-black/50 dark:text-white/50">
                    {result.student?.studentCode}
                  </span>
                </p>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-black/55 dark:text-white/55">{t("scanner.currentGroup")}</dt>
                    <dd className="font-medium">{result.currentGroup?.name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-black/55 dark:text-white/55">{t("scanner.selectedGroup")}</dt>
                    <dd className="font-medium">{result.selectedGroup?.name ?? "—"}</dd>
                  </div>
                </dl>
                <input
                  className="input mt-3"
                  placeholder={t("common.reason")}
                  value={makeUpReason}
                  onChange={(e) => setMakeUpReason(e.target.value)}
                />
                <div className="mt-4 flex gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={acceptMakeUp} disabled={busy}>
                    {t("scanner.acceptMakeup")}
                  </button>
                  <button type="button" className="btn-secondary flex-1" onClick={rejectMakeUp} disabled={busy}>
                    {t("scanner.reject")}
                  </button>
                </div>
              </div>
            )}

            {result && !needsConfirmation && (
              <div
                className={`card border-2 p-5 ${accepted ? "border-emerald-500/60" : "border-red-500/60"}`}
                role="status"
                aria-live="assertive"
              >
                <div className="flex items-center gap-4">
                  <span className={`text-4xl ${accepted ? "text-emerald-500" : "text-red-500"}`}>
                    {accepted ? "✓" : "✕"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg font-bold">{accepted ? t("scanner.recorded") : result.message}</p>
                    {result.student && (
                      <p className="truncate text-base">
                        {result.student.fullName}{" "}
                        <span className="font-mono text-xs text-black/50 dark:text-white/50">
                          {result.student.studentCode}
                        </span>
                      </p>
                    )}
                    {result.session && (
                      <p className="text-sm text-black/60 dark:text-white/60">
                        {result.session.stageName} · {result.session.gradeName} · {result.session.groupName}
                      </p>
                    )}
                    {result.attendance && (
                      <p className="mt-1 flex items-center gap-2 text-sm">
                        <Badge tone={result.attendance.type === "LATE" ? "warning" : result.attendance.type === "MAKE_UP" ? "brand" : "success"}>
                          {result.attendance.type}
                        </Badge>
                        {formatDateTime(result.attendance.recordedAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            {selected && (
              <div className="card p-4">
                <h3 className="mb-2 font-semibold">{selected.group.name}</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/55 dark:text-white/55">{t("nav.stages")}</dt>
                    <dd>{selected.group.grade.stage.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/55 dark:text-white/55">{t("grades.title")}</dt>
                    <dd>{selected.group.grade.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/55 dark:text-white/55">{t("common.teacher")}</dt>
                    <dd>{selected.group.teacher?.fullName ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/55 dark:text-white/55">Attendance</dt>
                    <dd>
                      {selected._count.attendances} / {selected.group.capacity}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/55 dark:text-white/55">{t("common.status")}</dt>
                    <dd>
                      <Badge tone={selected.status === "OPEN" ? "success" : "neutral"}>{selected.status}</Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="card p-4">
              <h3 className="mb-2 font-semibold">{t("scanner.recent")}</h3>
              {history.length === 0 ? (
                <p className="text-sm text-black/55 dark:text-white/55">—</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {history.map((entry, index) => (
                    <li key={`${entry.attendance?.id ?? entry.code}-${index}`} className="flex items-center gap-2">
                      <span className={entry.status === "ACCEPTED" ? "text-emerald-500" : "text-red-500"}>
                        {entry.status === "ACCEPTED" ? "✓" : "✕"}
                      </span>
                      <span className="truncate">{entry.student?.fullName ?? entry.message}</span>
                      {entry.attendance?.type && (
                        <Badge tone={entry.attendance.type === "LATE" ? "warning" : "neutral"}>
                          {entry.attendance.type}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {!groupId && (
        <div className="card p-6 text-sm text-black/60 dark:text-white/60">
          Select a Stage, Grade and Group to begin.
        </div>
      )}
    </div>
  );
}
