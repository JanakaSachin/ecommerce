"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthState } from "@/app/actions/auth";
import FormField from "./FormField";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {state?.errors?.form && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.errors.form}</p>
      )}
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.values?.email}
        error={state?.errors?.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state?.errors?.password}
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent py-3 font-semibold text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? "Logging in..." : "Log in"}
      </button>
      <p className="text-center text-sm text-gray-600">
        New to StrideLK?{" "}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="font-semibold text-accent hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

