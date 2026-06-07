# Tracklistr

Desktop app para **limpar, padronizar e curar metadados (ID3 tags)** de uma
biblioteca de DJ antes de carregar no **Rekordbox / Serato / Traktor / Ableton**.
Foco em DJ Open Format de Reggaeton: organização cirúrgica de gênero, energia e groove.

> Status: **core + IA plugada**. Scan de pasta, tabela editável, leitura/escrita de
> tags, tagueamento com Claude (batch + diff de aprovação) e write-back com backup.

## Stack

- **Tauri 2** (shell desktop) + **React 18** + **TypeScript strict** + **Vite** + **Tailwind** (UI estilo shadcn/ui)
- **Rust** no core, com a crate [`lofty`](https://crates.io/crates/lofty) para ID3v2 / MP4-M4A / FLAC / WAV / AIFF
- **IA:** dois provedores selecionáveis — **Claude** (API, `claude-sonnet-4-6`, via `reqwest` + tool-use) ou **Ollama** (modelo local, grátis e offline, via `/api/chat` + JSON-schema). API key em config local — nunca hardcoded nem exposta ao frontend

## Arquitetura de pastas

```
.
├── index.html
├── package.json / tsconfig*.json / vite.config.ts / tailwind.config.js
├── src/                      # Frontend (React)
│   ├── main.tsx / App.tsx
│   ├── types/track.ts        # Schema compartilhado (espelha o Rust)
│   ├── lib/
│   │   ├── api.ts            # Wrappers de invoke() + dialog nativo
│   │   ├── format.ts         # Padronização determinística de nomes (sem IA)
│   │   ├── export.ts         # Exportar CSV / TXT
│   │   └── utils.ts          # cn(), cellKey()
│   ├── store/useLibraryStore.ts  # Estado global (zustand) + diff + seleção
│   └── components/
│       ├── Toolbar.tsx       # Abrir pasta, busca, export, botão IA (desabilitado)
│       ├── TrackGrid.tsx     # Planilha editável c/ multi-seleção estilo Excel
│       ├── StatusBar.tsx     # Contadores (editadas, sem gênero, erros)
│       └── ui/               # Primitivos shadcn-style (button, input)
└── src-tauri/                # Backend (Rust)
    ├── Cargo.toml / build.rs / tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs / lib.rs  # Bootstrap + registro de comandos
        ├── model.rs          # Structs serde (camelCase) = schema TS
        ├── tags.rs           # Leitura/escrita via lofty
        ├── scan.rs           # Walk recursivo + tolerância a arquivos corrompidos
        └── commands.rs       # #[tauri::command]: scan_folder, read_tags, write_tags
```

## Schema de estado (diff coexistente)

O estado de cada faixa mantém **original**, **edição manual** e **sugestão da IA**
separados, convergindo só após aprovação explícita (`src/types/track.ts`):

```ts
interface TrackRow {
  id: string;
  filePath: string;
  fileName: string;
  format: string;
  hasArtwork: boolean;
  original: TrackTags;                   // snapshot do disco (diff/undo/backup)
  edited: TrackTags;                     // edições manuais (começa = original)
  suggested: Partial<TrackTags> | null;  // proposta da IA (aguardando aprovação)
  status: 'pristine' | 'pending_approval' | 'ready_to_write' | 'writing' | 'error';
  error: string | null;
}
```

Colunas da planilha: **Título, Artista, Álbum, Gênero, BPM, Tom, Ano, Energia,
Comentário** (+ Nome do arquivo, read-only).

## Interações da planilha (já funcionando)

- **Multi-seleção estilo Excel:** clique (célula), `Shift`+clique (intervalo retangular),
  `Ctrl/Cmd`+clique (alternar), clique no cabeçalho (coluna inteira), clique no `#` (linha inteira).
- **Edição inline:** duplo-clique na célula; `Enter` confirma, `Esc` cancela.
- **`Delete`/`Backspace`** limpa as células selecionadas.
- Células editadas ficam destacadas (dirty) e a linha mostra um ponto de status.
- Busca/filtro e exportação **CSV/TXT**.

## Comandos do backend (Rust)

| Comando        | Assinatura                                | Observação |
|----------------|-------------------------------------------|-----------|
| `scan_folder`  | `(path) -> Vec<ScannedTrack>`             | Recursivo; arquivo corrompido vira `error` na linha, sem panic |
| `read_tags`    | `(path) -> Result<TrackTags, String>`     | Re-leitura de uma faixa |
| `write_tags`   | `(items) -> Result<WriteOutcome, String>` | **Backup automático** das tags atuais (JSON) antes de gravar; escrita por arquivo, falha isolada |
| `get_config` / `update_config` / `clear_api_key` | — | Config local (modelo, limite de chars, API key). A key **nunca** é devolvida ao frontend (só `hasApiKey`) |
| `tag_with_ai`  | `(request) -> AiResponse`                 | Chama a API do Claude (tool-use) p/ um lote (~20 faixas) e devolve sugestões |

> O write-back **nunca** é chamado sem aprovação na UI; o backup viabiliza o *undo*.

## IA (Claude ou Ollama)

Na engrenagem (⚙) escolha o **Provedor**:

- **Claude (API paga):** informe a **API key** ([console.anthropic.com](https://console.anthropic.com))
  e o **modelo** (ex.: `claude-sonnet-4-6`; `claude-haiku-4-5-20251001` é mais barato e dá conta).
- **Ollama (local, grátis):** rode `ollama serve`, baixe um modelo (`ollama pull llama3.1`)
  e aponte a **URL** (default `http://localhost:11434`) e o **modelo**. Tudo roda na sua
  máquina, sem custo e sem enviar a tracklist para nuvem nenhuma.

**Banco de Gêneros:** ainda na engrenagem, você mantém um vocabulário de gêneros que a IA
deve usar (um por linha). Em **modo estrito** a IA só pode escolher rótulos da lista
(imposto via `enum` no schema, tanto no Claude quanto no Ollama); fora do estrito, ela
prioriza fortemente a lista mas pode propor algo novo se nada encaixar. O botão
**Preencher da biblioteca** semeia a lista com os gêneros já presentes nas faixas.

Depois:

1. A key/config fica no `config.json` do diretório de config do SO, gerida pelo backend.
2. Selecione células das colunas **Título / Artista / Gênero / Energia** (estilo Excel)
   e clique **Taggear com IA**. As faixas vão em **lotes de ~20** para a API.
3. Revise o **diff original → sugerido** e aprove/rejeite por célula ou em lote.
4. **Gravar** persiste só o aprovado (com backup). A **Energia (1–5)** é dobrada no
   campo `comment` no disco (ex.: `... | Energy: 4`) e lida de volta no próximo scan.

**Regras de curadoria** (no system prompt, `src-tauri/src/ai.rs`): gênero específico
para latino/BR com consistência no lote, remix classificado pelo gênero do remix,
título padronizado `Título - Artista (Versão)` com limite de chars, energia 1–5.

## Como rodar (desenvolvimento)

```bash
npm install
npm run tauri dev        # app desktop (requer toolchain Rust + pré-requisitos do SO)
# ou só o frontend no navegador (usa dados de exemplo):
npm run dev
```

## Build para macOS e Windows

O app é **cross-platform** (Tauri 2). Cada instalador é gerado no respectivo SO.

### Pré-requisitos por plataforma

| SO | Necessário |
|----|-----------|
| **macOS** | Xcode Command Line Tools (`xcode-select --install`), Rust, Node 20+ |
| **Windows** | [Microsoft C++ Build Tools (MSVC)](https://visualstudio.microsoft.com/visual-cpp-build-tools/), [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (já vem no Win 11), Rust, Node 20+ |
| **Linux** | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `librsvg2-dev`, `build-essential` |

### Build local

```bash
npm install
npm run tauri build
```

Saídas (em `src-tauri/target/release/bundle/`):

- **macOS:** `.app` + `.dmg` (em `macos/` e `dmg/`)
- **Windows:** `.msi` (WiX) e `*-setup.exe` (NSIS)

> macOS universal (Intel + Apple Silicon):
> `rustup target add aarch64-apple-darwin x86_64-apple-darwin` e
> `npm run tauri build -- --target universal-apple-darwin`.

### Build via CI (recomendado para mac + win sem ter as duas máquinas)

O workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) compila nos
runners nativos `macos-latest` (Intel + Apple Silicon) e `windows-latest`:

- **Run manual** (aba *Actions* → *Build (macOS & Windows)* → *Run workflow*): os
  instaladores ficam como **artifacts** do run.
- **Push de tag** `vX.Y.Z`: cria um **draft Release** com os instaladores anexados.

> Para distribuir sem avisos de segurança: **assinar/notarizar** no macOS
> (Apple Developer ID) e **assinar** no Windows (code-signing cert). Os hooks de
> assinatura do Tauri/`tauri-action` já estão previstos para quando você tiver os
> certificados — basta adicionar os secrets.

**Linux (apenas dev neste repositório):** sem as libs GTK/webkit acima, o frontend e o
core em Rust compilam, mas o link final do app desktop não.

## Setlist e integração (import/export)

**Importar** (botão *Importar*): coleção **Rekordbox `.xml`** (lê os arquivos referenciados
do disco) ou playlist **`.m3u`/`.m3u8`**. As faixas entram na tabela como num scan.

**Exportar:**
- **Coleção** (botão *RB XML*): a tabela visível como `rekordbox.xml`.
- **Setlist** (painel *Setlist*): monte a ordem do show a partir da seleção, com
  reordenação e **notas de transição** por faixa; exporte como **`.m3u8`** (importa em
  Rekordbox/Serato/Traktor), **Rekordbox XML** (playlist nativa) ou **Roteiro `.txt`**.

> Abordagem: import/export pelos **formatos de intercâmbio** (seguro), não escrita direta
> no banco do Rekordbox. **Fase 2:** `.crate` nativo do Serato e `.nml` do Traktor, e os
> cues/beatgrid (do Deep Scan) embutidos por plataforma. Valide o primeiro import no seu
> app — detalhes de path/atributos podem precisar de ajuste fino por versão.

## Validação feita

- `npm run build` (tsc strict + vite) — **OK**
- `cargo check` de `model` + `tags` + `scan` com `lofty 0.22` — **OK**
- `cargo check` do call-chain `reqwest` (rustls + json) usado em `ai.rs` — **OK**
- Fluxo de IA ponta-a-ponta exercido no navegador (mock tagger): scan → seleção →
  diff → aprovação → write-back — **OK**
- Link final do Tauri e a chamada real à API do Claude dependem do ambiente desktop
  (libs GTK/webkit no Linux) — validar no macOS/Windows ou via CI

## Roadmap

- [x] **IA plugada** (batch ~20/chunk, tool-use, regras de gênero/energia/título)
- [x] **Diff visual** original vs. sugerido, aprovação por célula / lote
- [x] **Padronização de título** `Título - Artista (Versão)` com limite de chars
- [x] **Backup automático** antes do write-back
- [ ] **Undo** da última gravação (a partir do backup JSON já gerado)
- [ ] **Módulos avançados:** Deep Scan (fingerprint p/ duplicatas, detecção de
  "fake 320", estrutura musical p/ cues) e **Setlist** (timeline + transições +
  export `.m3u`/XML)

## Restrições do projeto

- Nunca gravar sem aprovação explícita; batch sempre com preview/confirmação.
- TypeScript strict; sem `console.log` em produção.
- API key da IA somente em config local.
