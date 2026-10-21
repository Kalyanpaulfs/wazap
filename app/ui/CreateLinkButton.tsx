import { Plus } from "lucide-react";
import { ButtonLink } from "./Button";

/** The one "Create link" call to action: rounded accent pill with a plus. */
export function CreateLinkButton({ className, label = "Create link" }: { className?: string; label?: string }) {
  return (
    <ButtonLink href="/links/new" prefetch={false} className={className}>
      <Plus className="h-[18px] w-[18px]" aria-hidden /> {label}
    </ButtonLink>
  );
}
