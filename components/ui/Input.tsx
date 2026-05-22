import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, className, id, ...props }, ref) => (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm text-muted">{label}</span>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "w-full rounded-lg bg-bg-card border border-muted/30 px-3 h-11 text-cream",
          "placeholder:text-muted/60 focus:border-accent focus:outline-none transition",
          className,
        )}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  ),
);
Input.displayName = "Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className, children, ...props }, ref) => (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm text-muted">{label}</span>
      )}
      <select
        ref={ref}
        className={cn(
          "w-full rounded-lg bg-bg-card border border-muted/30 px-3 h-11 text-cream",
          "focus:border-accent focus:outline-none transition",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  ),
);
Select.displayName = "Select";
