import { describe, expect, it } from "vitest";
import { checkoutSchema, registerSchema, fieldErrors } from "@/lib/validation";

describe("validation schema suite", () => {
  it("validates valid checkout input with normalized phone", () => {
    const valid = {
      customerName: "Kumari Silva",
      email: "kumari@example.com",
      phone: "0711234567",
      line1: "4 Lake View",
      line2: "Off Peradeniya Rd",
      city: "Kandy",
      district: "Kandy",
      postalCode: "20000",
      notes: "Please call upon arrival",
    };
    const parsed = checkoutSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe("+94711234567");
      expect(parsed.data.postalCode).toBe("20000");
    }
  });

  it("rejects invalid district in checkout", () => {
    const invalid = {
      customerName: "Kumari Silva",
      email: "kumari@example.com",
      phone: "0711234567",
      line1: "4 Lake View",
      city: "Kandy",
      district: "Atlantis", // Invalid
    };
    const parsed = checkoutSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      expect(errs.district).toBe("Select your district");
    }
  });

  it("rejects invalid phone format in checkout", () => {
    const invalid = {
      customerName: "Kumari Silva",
      email: "kumari@example.com",
      phone: "not-a-phone",
      line1: "4 Lake View",
      city: "Kandy",
      district: "Kandy",
    };
    const parsed = checkoutSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates register schema requiring matching password confirmation", () => {
    const mismatch = {
      name: "Kumari Silva",
      email: "kumari@example.com",
      phone: "0711234567",
      password: "password123",
      confirm: "password456",
    };
    const parsed = registerSchema.safeParse(mismatch);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      expect(errs.confirm).toBe("Passwords do not match");
    }
  });
});

