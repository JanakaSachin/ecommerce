import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StrideLK – Shoes delivered island-wide",
  description: "Demo merchant store for the SwiftDrop courier system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
