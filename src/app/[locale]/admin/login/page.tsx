import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Logowanie — Panel A&A",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    // Dark-only, matching the rest of the admin panel.
    <div
      data-theme="dark"
      className="bg-void text-ink flex min-h-screen items-center justify-center px-6"
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Image
            src="/brand/aa-logo-dark.png"
            alt="A&A Corporation"
            width={260}
            height={143}
            priority
            className="h-12 w-auto"
          />
        </div>
        <h1 className="font-heading mt-8 text-center text-xl font-bold">
          Panel administracyjny
        </h1>
        <p className="text-ink-muted mt-2 text-center text-xs">
          Dostęp tylko dla autoryzowanych pracowników.
        </p>
        <div className="border-line mt-8 border p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
