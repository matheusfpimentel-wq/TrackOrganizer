import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AiProvider, ConfigPatch } from "@/lib/api";
import { useLibraryStore } from "@/store/useLibraryStore";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const config = useLibraryStore((s) => s.config);
  const saveConfig = useLibraryStore((s) => s.saveConfig);
  const clearApiKey = useLibraryStore((s) => s.clearApiKey);

  const [provider, setProvider] = useState<AiProvider>(config.provider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(config.model);
  const [charLimit, setCharLimit] = useState(String(config.charLimit));
  const [ollamaUrl, setOllamaUrl] = useState(config.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(config.ollamaModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProvider(config.provider);
      setModel(config.model);
      setCharLimit(String(config.charLimit));
      setOllamaUrl(config.ollamaUrl);
      setOllamaModel(config.ollamaModel);
      setApiKey("");
      setError(null);
    }
  }, [open, config]);

  if (!open) {
    return null;
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: ConfigPatch = {
        provider,
        charLimit: Number.parseInt(charLimit, 10) || config.charLimit,
      };
      if (provider === "claude") {
        patch.model = model.trim();
        if (apiKey.trim()) {
          patch.apiKey = apiKey.trim();
        }
      } else {
        patch.ollamaUrl = ollamaUrl.trim();
        patch.ollamaModel = ollamaModel.trim();
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
        className="w-[480px] rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">Configurações</h2>

        <label className="mb-1 block text-xs text-muted-foreground">Provedor de IA</label>
        <div className="mb-4 flex gap-2">
          {(["claude", "ollama"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
                provider === p
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {p === "claude" ? "Claude (API paga)" : "Ollama (local, grátis)"}
            </button>
          ))}
        </div>

        {provider === "claude" ? (
          <>
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
            <label className="mb-1 block text-xs text-muted-foreground">Modelo</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} className="mb-4 w-full" />
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs text-muted-foreground">URL do Ollama</label>
            <Input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="mb-3 w-full"
            />
            <label className="mb-1 block text-xs text-muted-foreground">Modelo Ollama</label>
            <Input
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="llama3.1"
              className="mb-1 w-full"
            />
            <p className="mb-4 text-[11px] text-muted-foreground">
              Rode <code>ollama serve</code> e baixe o modelo com{" "}
              <code>ollama pull {ollamaModel || "llama3.1"}</code>. Tudo roda local, sem custo.
            </p>
          </>
        )}

        <label className="mb-1 block text-xs text-muted-foreground">Limite de caracteres (título)</label>
        <Input
          type="number"
          value={charLimit}
          onChange={(e) => setCharLimit(e.target.value)}
          className="mb-4 w-32"
        />

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={!config.hasApiKey}
            onClick={() => void clearApiKey()}
          >
            Remover chave Claude
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
