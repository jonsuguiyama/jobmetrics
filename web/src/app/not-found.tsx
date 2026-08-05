import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-sm text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}
