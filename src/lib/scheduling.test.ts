import { describe, it, expect } from "vitest";
import { rangesOverlap, isValidTimeRange, type TimeRange } from "./scheduling";

function range(day: TimeRange["dayOfWeek"], start: number, end: number): TimeRange {
  return { dayOfWeek: day, startMinutes: start, endMinutes: end };
}

describe("rangesOverlap", () => {
  it("returns false for different days regardless of time", () => {
    const a = range("MONDAY", 600, 660);
    const b = range("TUESDAY", 600, 660);
    expect(rangesOverlap(a, b)).toBe(false);
  });

  it("returns true for identical ranges on the same day", () => {
    const a = range("MONDAY", 600, 660);
    const b = range("MONDAY", 600, 660);
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it("returns true when one range is fully inside another", () => {
    const outer = range("MONDAY", 540, 720);
    const inner = range("MONDAY", 600, 660);
    expect(rangesOverlap(outer, inner)).toBe(true);
    expect(rangesOverlap(inner, outer)).toBe(true);
  });

  it("returns true for partial overlap at the start", () => {
    const a = range("MONDAY", 600, 660);
    const b = range("MONDAY", 630, 690);
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it("returns false when ranges are back-to-back (end === start)", () => {
    // Half-open interval semantics: a session ending at 10:00 and one
    // starting at 10:00 do NOT overlap — this must stay allowed so
    // back-to-back scheduling isn't falsely blocked.
    const a = range("MONDAY", 540, 600);
    const b = range("MONDAY", 600, 660);
    expect(rangesOverlap(a, b)).toBe(false);
  });

  it("returns false for ranges that don't touch at all", () => {
    const a = range("MONDAY", 540, 600);
    const b = range("MONDAY", 700, 760);
    expect(rangesOverlap(a, b)).toBe(false);
  });

  it("returns true for a 1-minute overlap", () => {
    const a = range("MONDAY", 540, 601);
    const b = range("MONDAY", 600, 660);
    expect(rangesOverlap(a, b)).toBe(true);
  });
});

describe("isValidTimeRange", () => {
  it("accepts a normal daytime range", () => {
    expect(isValidTimeRange(9 * 60, 10 * 60)).toBe(true);
  });

  it("rejects start >= end", () => {
    expect(isValidTimeRange(600, 600)).toBe(false);
    expect(isValidTimeRange(700, 600)).toBe(false);
  });

  it("rejects negative or out-of-day values", () => {
    expect(isValidTimeRange(-10, 60)).toBe(false);
    expect(isValidTimeRange(60, 1441)).toBe(false);
  });

  it("accepts the full-day boundary [0, 1440]", () => {
    expect(isValidTimeRange(0, 24 * 60)).toBe(true);
  });
});
