import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-5xl px-5 py-6 text-center text-xs text-muted">
        <p>
          Built by Jon Suguiyama with Next.js, TypeScript, Tailwind CSS, Auth.js, Neon, RabbitMQ, Upstash Redis, the
          Gemini API, and Vercel Analytics.
        </p>
        <p className="mt-2">
          <Link href="/privacy" className="transition-colors hover:text-accent">
            Privacy Policy
          </Link>
        </p>
      </div>
    </footer>
  );
}
