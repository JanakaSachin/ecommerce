"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { fieldErrors, loginSchema, registerSchema, safeNext } from "@/lib/validation";
import { mergeGuestCart } from "@/lib/cart";

export type AuthState =
  | { errors?: Record<string, string>; values?: Record<string, string> }
  | undefined;

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { name: raw.name ?? "", email: raw.email ?? "", phone: raw.phone ?? "" };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { name, email, phone, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    return { errors: { email: "An account with this email already exists" }, values };
  }

  const user = await db.user.create({
    data: { name, email, phone, passwordHash: await bcrypt.hash(password, 10) },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
  await mergeGuestCart(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { email: raw.email ?? "" };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !ok) {
    // Same message either way, so attackers can't tell which emails exist
    return { errors: { form: "Invalid email or password" }, values };
  }

  await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
  await mergeGuestCart(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
