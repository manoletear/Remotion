"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button that shows a busy state while its enclosing form's action is
 * pending (FR-002) — works with any server action, no useActionState needed,
 * since useFormStatus reads the nearest <form>'s pending state directly.
 */
export function SubmitButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const classes = [className, pending ? "busy" : ""].filter(Boolean).join(" ");
  return (
    <button type="submit" className={classes || undefined} disabled={pending}>
      {children}
    </button>
  );
}
