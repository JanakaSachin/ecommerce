import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/validation";
import RegisterForm from "@/components/RegisterForm";

export const metadata = { title: "Register – StrideLK" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track all your StrideLK deliveries with live courier updates.
        </p>
        <div className="mt-6">
          <RegisterForm next={next} />
        </div>
      </div>
    </div>
  );
}

