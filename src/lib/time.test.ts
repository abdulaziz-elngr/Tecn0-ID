import { describe, it, expect } from "vitest";
import { timeStringToMinutes, minutesToTimeString } from "./time";

describe("timeStringToMinutes", () => {
  it("parses valid HH:MM strings", () => {
    expect(timeStringToMinutes("00:00")).toBe(0);
    expect(timeStringToMinutes("09:30")).toBe(570);
    expect(timeStringToMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed or out-of-range strings", () => {
    expect(timeStringToMinutes("24:00")).toBeNull();
    expect(timeStringToMinutes("9:30")).toBeNull();
    expect(timeStringToMinutes("09:60")).toBeNull();
    expect(timeStringToMinutes("not-a-time")).toBeNull();
  });
});

describe("minutesToTimeString", () => {
  it("round-trips through timeStringToMinutes", () => {
    for (const t of ["00:00", "09:30", "13:05", "23:59"]) {
      const minutes = timeStringToMinutes(t)!;
      expect(minutesToTimeString(minutes)).toBe(t);
    }
  });
});
