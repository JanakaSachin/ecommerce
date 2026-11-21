import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/validation";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Login – ChronoLK" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-500">
          Log in to track your orders and manage your account.
        </p>
        <div className="mt-6">
          <LoginForm next={next} />
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-gray-500">
        No account? You can still check out as a guest.
      </p>
    </div>
  );
}

