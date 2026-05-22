import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-bg-card border border-muted/15 p-5",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-accent-warm/15 text-accent-warm border border-accent-warm/30",
        className,
      )}
    >
      {children}
    </span>
  );
}
