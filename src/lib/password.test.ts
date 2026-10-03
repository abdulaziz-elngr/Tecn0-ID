import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "./password";

describe("password policy", () => {
  it("rejects short passwords", () => {
    expect(isPasswordStrongEnough("short1")).toBe(false);
  });

  it("rejects passwords without a number", () => {
    expect(isPasswordStrongEnough("noNumbersHere")).toBe(false);
  });

  it("accepts a sufficiently strong password", () => {
    expect(isPasswordStrongEnough("Demo#Pass123")).toBe(true);
  });
});

describe("argon2id hashing", () => {
  it("hashes and verifies correctly, and rejects wrong passwords", async () => {
    const hash = await hashPassword("Demo#Pass123");
    expect(hash).not.toBe("Demo#Pass123");
    expect(await verifyPassword(hash, "Demo#Pass123")).toBe(true);
    expect(await verifyPassword(hash, "WrongPassword1")).toBe(false);
  });

  it("never throws on a malformed stored hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything1")).resolves.toBe(false);
  });
});
