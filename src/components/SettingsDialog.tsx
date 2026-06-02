import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLibraryStore } from "@/store/useLibraryStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const config = useLibraryStore((s) => s.config);
  const saveConfig = useLibraryStore((s) => s.saveConfig);
  const clearApiKey = useLibraryStore((s) => s.clearApiKey);

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(config.model);
  const [charLimit, setCharLimit] = useState(String(config.charLimit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setModel(config.model);
      setCharLimit(String(config.charLimit));
      setApiKey("");
      setError(null);
    }
  }, [open, config.model, config.charLimit]);

  if (!open) {
    return null;
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: { model?: string; charLimit?: number; apiKey?: string } = {
        model: model.trim(),
        charLimit: Number.parseInt(charLimit, 10) || config.charLimit,
      };
      if (apiKey.trim()) {
        patch.apiKey = apiKey.trim();
      }
      await saveConfig(patch);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[460px] rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">Configurações</h2>

        <label className="mb-1 block text-xs text-muted-foreground">
          API key do Claude{" "}
          <span className={config.hasApiKey ? "text-primary" : "text-dirty"}>
            {config.hasApiKey ? "(configurada)" : "(não configurada)"}
          </span>
        </label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config.hasApiKey ? "•••••••• (deixe vazio para manter)" : "sk-ant-..."}
          className="mb-1 w-full"
          autoComplete="off"
        />
        <p className="mb-4 text-[11px] text-muted-foreground">
          Guardada localmente pelo backend; nunca é enviada de volta para a interface.
        </p>

        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Modelo</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} className="w-full" />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs text-muted-foreground">Limite de chars</label>
            <Input
              type="number"
              value={charLimit}
              onChange={(e) => setCharLimit(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={!config.hasApiKey}
            onClick={() => void clearApiKey()}
          >
            Remover chave
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
