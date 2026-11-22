import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACAMS V1 | Lab Access Control",
  description: "Access Control and Asset Management System lab console.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}