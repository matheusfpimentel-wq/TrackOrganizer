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
  const rows = useLibraryStore((s) => s.rows);

  const [provider, setProvider] = useState<AiProvider>(config.provider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(config.model);
  const [charLimit, setCharLimit] = useState(String(config.charLimit));
  const [ollamaUrl, setOllamaUrl] = useState(config.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(config.ollamaModel);
  const [genresText, setGenresText] = useState(config.genres.join("\n"));
  const [genreStrict, setGenreStrict] = useState(config.genreStrict);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProvider(config.provider);
      setModel(config.model);
      setCharLimit(String(config.charLimit));
      setOllamaUrl(config.ollamaUrl);
      setOllamaModel(config.ollamaModel);
      setGenresText(config.genres.join("\n"));
      setGenreStrict(config.genreStrict);
      setApiKey("");
      setError(null);
    }
  }, [open, config]);

  const parsedGenres = () =>
    genresText
      .split("\n")
      .map((g) => g.trim())
      .filter(Boolean);

  const seedFromLibrary = () => {
    const merged = new Set(parsedGenres());
    for (const r of rows) {
      const g = r.edited.genre.trim();
      if (g) {
        merged.add(g);
      }
    }
    setGenresText([...merged].sort((a, b) => a.localeCompare(b)).join("\n"));
  };

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
        genres: parsedGenres(),
        genreStrict,
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
        className="max-h-[88vh] w-[480px] overflow-auto rounded-lg border border-border bg-background p-5 shadow-xl"
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

        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs text-muted-foreground">
            Banco de Gêneros{" "}
            <span className="text-muted-foreground/70">({parsedGenres().length})</span>
          </label>
          <button
            className="text-[11px] text-primary underline"
            onClick={seedFromLibrary}
            type="button"
          >
            Preencher da biblioteca
          </button>
        </div>
        <textarea
          value={genresText}
          onChange={(e) => setGenresText(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={"Um gênero por linha, ex.:\nReggaeton Portorriquenho\nGuaracha\nFunk Mandelão\nTech House"}
          className="mb-2 w-full resize-y rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
        <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={genreStrict}
            onChange={(e) => setGenreStrict(e.target.checked)}
            className="accent-primary"
          />
          Restringir a IA a estes gêneros (modo estrito)
        </label>

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
