import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  createAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
} from "@/lib/validation/auth";
import {
  invitationCreateSchema,
  slugify,
  workspaceCreateSchema,
} from "@/lib/validation/workspace";

describe("password reset and change", () => {
  it("normalizes the forgot-password email", () => {
    expect(forgotPasswordSchema.parse({ email: " A@B.co " }).email).toBe("a@b.co");
  });

  it("requires matching, valid new passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: "long-enough", confirm: "long-enough" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "long-enough", confirm: "different1" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
  });

  it("requires the current password when changing it", () => {
    const next = { password: "long-enough", confirm: "long-enough" };
    expect(changePasswordSchema.safeParse({ ...next, current: "" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...next, current: "old" }).success).toBe(true);
  });
});

describe("invitationCreateSchema", () => {
  it("accepts editor and viewer but never owner", () => {
    expect(invitationCreateSchema.safeParse({ email: "a@b.co", role: "editor" }).success).toBe(true);
    expect(invitationCreateSchema.safeParse({ email: "a@b.co", role: "viewer" }).success).toBe(true);
    expect(invitationCreateSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("trims and lowercases the email", () => {
    const result = signInSchema.parse({ email: "  You@Example.COM ", password: "x" });
    expect(result.email).toBe("you@example.com");
  });

  it("rejects an invalid email and an empty password", () => {
    expect(signInSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("rejects missing fields from a tampered form", () => {
    expect(signInSchema.safeParse({ email: null, password: null }).success).toBe(false);
  });
});

describe("createAccountSchema", () => {
  it("enforces 8 to 72 character passwords", () => {
    const email = "a@b.co";
    expect(createAccountSchema.safeParse({ email, password: "short" }).success).toBe(false);
    expect(createAccountSchema.safeParse({ email, password: "x".repeat(73) }).success).toBe(false);
    expect(createAccountSchema.safeParse({ email, password: "long-enough" }).success).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths and rejects everything else", () => {
    expect(safeNextPath("/knowledge")).toBe("/knowledge");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

describe("slugify", () => {
  it("produces a slug the database accepts", () => {
    expect(slugify("  Lumo Learn!  ")).toBe("lumo-learn");
    expect(slugify("Café -- Ops")).toBe("cafe-ops");
    expect(slugify("!!!")).toBe("");
    expect(slugify("a".repeat(59) + " b")).toBe("a".repeat(59));
  });
});

describe("workspaceCreateSchema", () => {
  it("derives the slug from the name when none is given", () => {
    expect(workspaceCreateSchema.parse({ name: " My App ", slug: "" })).toEqual({
      name: "My App",
      slug: "my-app",
    });
  });

  it("normalizes a provided slug", () => {
    expect(workspaceCreateSchema.parse({ name: "My App", slug: "Custom URL" }).slug).toBe(
      "custom-url",
    );
  });

  it("rejects a blank name and a name with nothing sluggable", () => {
    expect(workspaceCreateSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(workspaceCreateSchema.safeParse({ name: "!!!" }).success).toBe(false);
  });
});
