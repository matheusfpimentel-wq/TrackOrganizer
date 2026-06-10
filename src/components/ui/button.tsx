import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-accent",
  ghost: "bg-transparent hover:bg-accent",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-9 px-3 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
