"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type AuthState } from "@/app/actions/auth";
import FormField from "./FormField";

export default function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, undefined);
  const e = state?.errors ?? {};
  const v = state?.values ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {e.form && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{e.form}</p>}
      <FormField
        label="Full name"
        name="name"
        autoComplete="name"
        required
        defaultValue={v.name}
        error={e.name}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={v.email}
        error={e.email}
      />
      <FormField
        label="Mobile number"
        name="phone"
        type="tel"
        placeholder="0771234567"
        autoComplete="tel"
        required
        defaultValue={v.phone}
        error={e.phone}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={e.password}
        />
        <FormField
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          error={e.confirm}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent py-3 font-semibold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
      <p className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-semibold text-accent hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  );
}

