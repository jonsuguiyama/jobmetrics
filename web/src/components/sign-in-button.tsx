"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Modal } from "@/components/modal";
import { GitHubIcon, GoogleIcon } from "@/components/icons";

type SignInButtonProps = {
  variant?: "primary" | "ghost";
};

export function SignInButton({ variant = "primary" }: SignInButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "ghost" ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-2"
        >
          Sign in
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-accent px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Get started
        </button>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-muted">
            Use GitHub or Google to continue. No password, no forms.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => signIn("github")}
              className="flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              <GitHubIcon className="size-4" />
              Continue with GitHub
            </button>
            <button
              onClick={() => signIn("google")}
              className="flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              <GoogleIcon className="size-4" />
              Continue with Google
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
