"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { SignInButton } from "@/components/sign-in-button";

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block size-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          jobmetrics
        </Link>

        {status !== "loading" && (
          <nav className="flex items-center gap-3">
            {session ? (
              <>
                <span className="hidden text-sm text-muted sm:inline">{session.user?.name ?? session.user?.email}</span>
                <button
                  onClick={() => signOut()}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  Sign out
                </button>
              </>
            ) : (
              <SignInButton variant="ghost" />
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
