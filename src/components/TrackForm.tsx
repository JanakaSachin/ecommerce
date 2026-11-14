"use client";

import { useActionState } from "react";
import { trackOrder, type TrackState } from "@/app/actions/track";
import FormField from "./FormField";

export default function TrackForm({ defaultRef }: { defaultRef: string }) {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}
      <FormField
        label="Order number or tracking number"
        name="ref"
        required
        placeholder="e.g. 10001 or SD1234567890"
        defaultValue={state?.values?.ref ?? defaultRef}
      />
      <FormField
        label="Email used at checkout"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="your@email.com"
        defaultValue={state?.values?.email}
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand py-3 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Searching..." : "Track order"}
      </button>
    </form>
  );
}

