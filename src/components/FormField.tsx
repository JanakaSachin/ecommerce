import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export default function FormField({ label, error, className, ...props }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <input
        {...props}
        className={`rounded-md border px-3 py-2 outline-none focus:border-indigo-600 ${
          error ? "border-red-500" : "border-gray-300"
        } ${className ?? ""}`}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

