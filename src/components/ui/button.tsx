import type { ButtonHTMLAttributes } from "react";

const styles = {
  primary: "bg-accent text-bg hover:opacity-90",
  surface: "border border-line bg-surface text-fg hover:border-accent",
  quiet: "bg-transparent text-muted hover:text-fg",
  danger: "bg-danger text-fg hover:opacity-90",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof styles;
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
