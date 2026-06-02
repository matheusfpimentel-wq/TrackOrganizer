# Tracklistr

Desktop app para **limpar, padronizar e curar metadados (ID3 tags)** de uma
biblioteca de DJ antes de carregar no **Rekordbox / Serato / Traktor / Ableton**.
Foco em DJ Open Format de Reggaeton: organização cirúrgica de gênero, energia e groove.

> Status: **scaffold do core** (scan de pasta + tabela editável + leitura/escrita de
> tags). A camada de IA está **desplugada de propósito**, aguardando validação.

## Stack

- **Tauri 2** (shell desktop) + **React 18** + **TypeScript strict** + **Vite** + **Tailwind** (UI estilo shadcn/ui)
- **Rust** no core, com a crate [`lofty`](https://crates.io/crates/lofty) para ID3v2 / MP4-M4A / FLAC / WAV / AIFF
- **IA (futuro):** API do Claude (`claude-sonnet-4-6`), API key em config local — nunca hardcoded

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
  suggested: Partial<TrackTags> | null;  // proposta da IA (futuro)
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

> O write-back **nunca** é chamado sem aprovação na UI; o backup viabiliza o *undo*.

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

## Validação feita

- `npm run build` (tsc strict + vite) — **OK**
- `cargo check` de `model` + `tags` + `scan` com `lofty 0.22` — **OK**
- Link final do Tauri depende de libs GTK/webkit do SO (ver acima)

## Roadmap (pós-validação)

1. **Plugar a IA** (batch ~20 faixas/chunk): gênero de alta granularidade para
   latino/brasileiro, agrupamento lógico p/ Smart Crates, detecção de remix pelo
   título (classificar pelo gênero do remix), e tag de Energia 1–5.
2. **Diff visual** original vs. sugerido com aprovação por célula / batch.
3. **Padronização de título** `Título - Artista (Versão)` com limite de chars (default 50).
4. **Undo** da última gravação (a partir do backup JSON).
5. **Módulos avançados:** Deep Scan (fingerprint p/ duplicatas, detecção de "fake 320",
   estrutura musical p/ cues) e **Setlist** (timeline + transições + export `.m3u`/XML).

## Restrições do projeto

- Nunca gravar sem aprovação explícita; batch sempre com preview/confirmação.
- TypeScript strict; sem `console.log` em produção.
- API key da IA somente em config local.
