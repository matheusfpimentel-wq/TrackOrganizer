import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLUMNS, type TagKey } from "@/types/track";
import { useLibraryStore } from "@/store/useLibraryStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FindReplace({ open, onClose }: Props) {
  const findReplace = useLibraryStore((s) => s.findReplace);
  const selectionCount = useLibraryStore((s) => s.selection.size);
  const [col, setCol] = useState<TagKey>("genre");
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [ci, setCi] = useState(true);

  if (!open) {
    return null;
  }

  const apply = () => {
    findReplace(col, find, repl, selectionOnly, ci);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[440px] rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">Localizar &amp; substituir</h2>

        <label className="mb-1 block text-xs text-muted-foreground">Coluna</label>
        <select
          value={col}
          onChange={(e) => setCol(e.target.value as TagKey)}
          className="mb-3 h-8 w-full rounded-md border border-border bg-muted px-2 text-sm text-foreground"
        >
          {COLUMNS.filter((c) => c.type === "text").map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs text-muted-foreground">Localizar</label>
        <Input value={find} onChange={(e) => setFind(e.target.value)} className="mb-3 w-full" autoFocus />
        <label className="mb-1 block text-xs text-muted-foreground">Substituir por</label>
        <Input value={repl} onChange={(e) => setRepl(e.target.value)} className="mb-3 w-full" />

        <label className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={ci} onChange={(e) => setCi(e.target.checked)} className="accent-primary" />
          Ignorar maiúsculas/minúsculas
        </label>
        <label className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={selectionOnly}
            onChange={(e) => setSelectionOnly(e.target.checked)}
            className="accent-primary"
          />
          Só nas faixas selecionadas ({selectionCount} células)
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={find === ""} onClick={apply}>
            Substituir
          </Button>
        </div>
      </div>
    </div>
  );
}
