import { useEffect } from "react";
import { useLibraryStore, type Toast } from "@/store/useLibraryStore";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<Toast["kind"], string> = {
  success: "border-l-primary",
  error: "border-l-danger",
  info: "border-l-border",
};

function ToastItem({ id, kind, message, detail }: Toast) {
  const dismiss = useLibraryStore((s) => s.dismissToast);
  useEffect(() => {
    const ms = kind === "error" ? 7000 : 4000;
    const t = setTimeout(() => dismiss(id), ms);
    return () => clearTimeout(t);
  }, [id, kind, dismiss]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-l-4 border-border bg-background px-3 py-2 text-sm shadow-xl",
        KIND_STYLE[kind],
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", kind === "error" ? "text-danger" : "text-foreground")}>{message}</p>
        {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
      </div>
      <button
        onClick={() => dismiss(id)}
        aria-label="Fechar notificação"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

/** Renders the stack of transient notifications (bottom-right). */
export function Toaster() {
  const toasts = useLibraryStore((s) => s.toasts);
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex w-80 max-w-[92vw] flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
