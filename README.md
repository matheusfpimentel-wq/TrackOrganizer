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
> (Apple Developer ID) e **assinar** no Windows (code-signing cert). No `build.yml` há um
> bloco `env` de assinatura macOS **comentado** — ao cadastrar os secrets (`APPLE_CERTIFICATE`,
> `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
> `APPLE_TEAM_ID`) e **descomentá-lo**, o build sai assinado/notarizado. _Deixar as variáveis
> presentes porém vazias faz o `tauri-action` falhar ao importar o certificado, por isso ficam
> comentadas por padrão (build sai sem assinatura)._

**Linux (apenas dev neste repositório):** sem as libs GTK/webkit acima, o frontend e o
core em Rust compilam, mas o link final do app desktop não.

## Setlist e integração (import/export)

Resumo da abordagem: import/export pelos **formatos de intercâmbio** (seguro), **sem**
escrita direta no banco do Rekordbox. **Fase 2:** `.crate` nativo do Serato e `.nml` do
Traktor, e os cues/beatgrid (do Deep Scan) embutidos por plataforma.

Tutoriais detalhados abaixo. 👇

---

## 📥 Tutorial — Importar para o Tracklistr

Use o botão **Importar** na barra de ferramentas. Formatos aceitos:

### A) Coleção do Rekordbox (`.xml`)
1. No **Rekordbox**: `Arquivo → Exibir/Mostrar → Preferências → Avançado → Banco de dados`
   e ative **"rekordbox xml"** (ou `Arquivo → Biblioteca → Backup/Exportar coleção em XML`,
   dependendo da versão). Anote o caminho do `rekordbox.xml`.
2. No **Tracklistr**: clique **Importar** → selecione esse `rekordbox.xml`.
3. O app lê cada faixa referenciada **direto do arquivo no disco** (tags atuais, BPM, key)
   e popula a tabela. Faixas cujo arquivo não existe mais aparecem com erro na linha.

### B) Playlist `.m3u` / `.m3u8`
1. Clique **Importar** → selecione o `.m3u8`.
2. Cada linha de caminho vira uma faixa (caminhos relativos são resolvidos pela pasta do
   playlist). Útil pra trazer um set específico em vez da coleção inteira.

> Dica: também dá pra usar **Abrir pasta** pra escanear uma pasta recursivamente — o
> Importar é pra quando você já tem uma coleção/playlist montada em outro app.

---

## 📤 Tutorial — Exportar do Tracklistr e levar pro seu app

Primeiro, o **fluxo recomendado** dentro do Tracklistr:
1. **Abrir pasta** (ou Importar) → 2. selecionar células → **Taggear com IA** → 3. revisar
o **diff** e aprovar → 4. **Gravar** (grava as tags nos arquivos, com backup) → 5. exportar.

> ⚠️ Importante: **Gravar primeiro.** O write-back das tags é o que faz Rekordbox/Serato/
> Traktor enxergarem título/artista/gênero/BPM/comentário corrigidos. Os exports de playlist
> só carregam a **ordem e as referências** das faixas, não reescrevem as tags.

### Rekordbox
**Opção 1 — Playlist nativa (recomendada):**
1. No Tracklistr, monte a **Setlist** (ou use *RB XML* pra exportar a coleção visível) e
   exporte um **`rekordbox.xml`**.
2. No Rekordbox: `Preferências → Avançado → Banco de dados → rekordbox xml` e aponte o
   arquivo exportado em **"Arquivo de biblioteca importada"**.
3. Na árvore lateral do Rekordbox vai aparecer **rekordbox xml** → abra a playlist
   *Tracklistr Setlist* e **arraste** as faixas pra sua coleção/playlists.

**Opção 2 — `.m3u8`:** `Arquivo → Importar → Importar playlist` e selecione o `.m3u8`.

**Atualizar tags já na coleção:** selecione as faixas → clique direito → **"Recarregar TAG"**
(*Reload Tag*) pra puxar o que o Tracklistr gravou nos arquivos.

### Serato DJ
1. Exporte a **Setlist** como **`.m3u8`**.
2. No Serato, painel **Files**, navegue até o `.m3u8` e arraste pra área de crates — ele
   cria um crate com as faixas. (Serato lê `.m3u`/`.m3u8`.)
3. Pra atualizar metadados: como o Serato lê tags do arquivo, as tags gravadas pelo
   Tracklistr aparecem ao re-adicionar/reanalisar. *(Cues/beatgrid nativos do Serato = Fase 2.)*

### Traktor
1. Exporte a **Setlist** como **`.m3u8`**.
2. No Traktor: clique direito em **Playlists → Importar Playlist** e selecione o `.m3u8`.
3. Traktor também lê tags do arquivo; use **Consistency Check / re-import** pra atualizar.
   *(Coleção `.nml` nativa com cues = Fase 2.)*

### Roteiro do show (`.txt`)
No painel **Setlist**, **Roteiro .txt** gera uma lista numerada com BPM·Tom e as **notas de
transição** que você escreveu entre as faixas — pra imprimir ou abrir no celular na cabine.

---

## 🔬 Deep Scan (análise de áudio, sob demanda)

Selecione faixas e clique **Deep Scan**. Para cada uma, o backend **decodifica o áudio**
(symphonia) e roda **FFT** (rustfft) para medir o **corte de frequência** real:

- Mostra **kHz de corte**, **bitrate**, **sample rate** e um **veredito**.
- Marca como **suspeito de transcode ("fake 320")** quando um arquivo lossless ou ≥256 kbps
  tem corte abaixo de ~16 kHz (sinal clássico de upscale de um MP3 ruim).

> É pesado (decodifica + FFT), por isso roda **sob demanda** nas faixas selecionadas, com progresso.

**Duplicatas por áudio (fingerprint):** o botão **Dup. áudio** gera um *fingerprint* acústico
pure-Rust (estilo Haitsma-Kalker: bandas log + 2ª diferença → sub-fingerprints de 32 bits) e
agrupa faixas com o **mesmo áudio**, **ignorando nome/tags** (pega cópias renomeadas e
re-encodes). Compara por *bit error rate* com busca de alinhamento; agrupa acima de 80% de
semelhança. Usa a seleção ou a biblioteca inteira.

**Cues / estrutura:** no menu de contexto (clique direito) → **Detectar cues / estrutura**.
Analisa o **envelope de energia** da faixa inteira e detecta **Início, Build, Drop, Quebra/Break
e Outro**, mostrando uma **mini-waveform** com os marcadores e a lista de cues (tempo + tipo).
Os pontos são alinhados a uma **grade de compassos**: o tempo vem da tag ou é estimado por
**autocorrelação do onset (spectral flux)**, a **fase/downbeat** por dobramento do onset no
período do beat, e os cues fazem **snap ao bar** (intro ao beat) — bem mais musical. Ainda é
heurística (sem beat-tracking pleno); ouça no player e ajuste. Miniaturas de capa aparecem na tabela.

**Cues no export do Rekordbox (Fase 2 — feito):** rode **Cues (sel.)** na barra (ou *Detectar
cues* por faixa) e os cues detectados saem como **`POSITION_MARK` (Memory Cues)** dentro de
cada `<TRACK>` no `rekordbox.xml` exportado (coleção *RB XML* ou playlist da Setlist). Importe
o XML no Rekordbox e os cues aparecem nas faixas.

**Serato (Fase 2):**
- **Cues** → menu de contexto **Gravar cues no Serato (MP3/FLAC)**: escreve `Serato Markers2`
  **dentro do arquivo** — GEOB no MP3 (preservando outros GEOB do Serato) e Vorbis comment
  `SERATO_MARKERS_V2` no FLAC — com **cópia de backup** do arquivo antes. _(M4A: futuro.)_
- **Playlists** → painel Setlist → **Serato .crate** (formato nativo de crate).

> O encoder do Markers2 tem **teste de round-trip** (encode→decode), mas a compatibilidade
> final depende do seu Serato — teste num arquivo de cópia e confirme.

**Traktor (Fase 2):** painel Setlist → **Traktor .nml** exporta uma coleção `collection.nml`
com `CUE_V2` (cues, `START` em ms), `TEMPO` (BPM) e a playlist. `VOLUME` é confiável no
Windows (letra do drive); no macOS fica em branco e o Traktor pode pedir um *relocate* único.

### Integração — status
| Plataforma | Playlists | Cues |
|-----------|-----------|------|
| **Rekordbox** | `rekordbox.xml` (coleção/playlist) | `POSITION_MARK` (Memory) ✅ |
| **Serato** | `.crate` | `Serato Markers2` no MP3 (GEOB) e FLAC (Vorbis) ✅ |
| **Traktor** | `.nml` | `CUE_V2` no `.nml` ✅ |
| Universal | `.m3u8` (todos) | — |

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
- [x] **Setlist + import/export** (Rekordbox XML, M3U) — Fase 1
- [ ] Integração Fase 2 (Serato `.crate`, Traktor `.nml`) e ideias de **UI/UX**:
  ver [`docs/UX-SUGESTOES.md`](docs/UX-SUGESTOES.md)
- [ ] **Undo** da última gravação (a partir do backup JSON já gerado)
- [ ] **Módulos avançados:** Deep Scan (fingerprint p/ duplicatas, detecção de
  "fake 320", estrutura musical p/ cues) e **Setlist** (timeline + transições +
  export `.m3u`/XML)

## Restrições do projeto

- Nunca gravar sem aprovação explícita; batch sempre com preview/confirmação.
- TypeScript strict; sem `console.log` em produção.
- API key da IA somente em config local.
