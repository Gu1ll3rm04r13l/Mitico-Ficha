import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-bg-deep hover:brightness-110 active:brightness-95 font-semibold",
  secondary:
    "bg-bg-card text-cream border border-muted/30 hover:border-accent/60",
  ghost: "bg-transparent text-cream hover:bg-bg-card",
  danger: "bg-red-600 text-white hover:bg-red-500 font-semibold",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-base rounded-lg",
  lg: "h-14 px-6 text-lg rounded-xl",
  xl: "min-h-[72px] px-8 text-2xl rounded-2xl", // pantallas de fichaje touch-friendly
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
