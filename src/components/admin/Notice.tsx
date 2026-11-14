export default function Notice({ notice, tone }: { notice?: string; tone?: string }) {
  if (!notice) return null;
  return (
    <div
      className={`mt-4 rounded-md p-3 text-sm ${
        tone === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-800 border border-green-200"
      }`}
    >
      {tone === "error" ? "⚠️ " : "✓ "}
      {notice}
    </div>
  );
}

