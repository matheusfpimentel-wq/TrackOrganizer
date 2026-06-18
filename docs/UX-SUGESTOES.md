# Sugestões de UI/UX — Tracklistr

Revisão do estado atual (core + IA + análise + setlist/import-export) com sugestões
priorizadas. Marcadas com esforço aproximado: 🟢 rápido · 🟡 médio · 🔴 grande.

## ✅ Implementado (leva edição/biblioteca/cliques/estética)
- **Edição rápida**: `Ctrl+D` (preencher pra baixo), `Tab`/`Shift+Tab` confirmam e
  avançam, `Ctrl+A` seleciona tudo que está visível, e botões ✓/✗ inline nas células
  com sugestão da IA (aceitar/rejeitar sem abrir o Revisar). Ação `setCells` no store
  aplica lotes em 1 passo de undo.
- **Menos cliques**: **Command palette** (`Ctrl+K`) com busca difusa de ações; atalhos
  globais `Ctrl+S` (gravar) e `/` (focar busca); botão "Comandos" no cabeçalho.
- **Bibliotecas grandes**: **filtros por coluna** (toggle) — numéricos entendem faixa
  (`120-130`), comparação (`>120`, `<=128`) e número; texto é substring. Contador "N de M".
- **Estética**: densidade **Compacta/Confortável** (persistida), **zebra striping**,
  **empty state** com ações e dica do `Ctrl+K`, barra de controles acima da grade.

### Também implementado (2ª parte da leva)
- **Barra de ação contextual** na seleção (definir gênero/energia, autotag, +setlist).
- **Views salvas / Smart Crates** (busca + lente + ordenação + filtros de coluna).
- **Toasts unificados** (gravar/renomear/desfazer/cues).
- **Dashboard de saúde** da biblioteca (+ lentes "sem capa" e "sem BPM").
- **Resolver duplicatas**: marca a melhor de cada grupo e seleciona as outras.

- **Agrupar por** (gênero/Tom/faixa de BPM) com grupos recolhíveis na própria grade
  (virtualização preservada; recolher/expandir todos).

## ✅ Implementado (leva UX quick-wins)
- Duração da faixa + **tempo total do set** (item 3)
- **Camelot/key colorido** na coluna Tom (item 2 — parte visual; ordenação ainda pendente)
- **Confirmação de gravação estilizada** com preview (item 5)
- **Energia em ●●●○○** (item 19)
- **Menu de contexto** (clique direito): Adicionar à setlist, Revelar no Finder/Explorer,
  Reverter edições da linha (item 7)
- **Indicador do provedor de IA** (Claude/Ollama) na toolbar (item 9)
- **Legenda dos status** na barra inferior (item 12)
- **Ordenar por coluna** + **navegação por teclado** + **autocomplete de gênero** (itens 1, 4, 11)
- **Undo/redo de edições** (`Ctrl+Z`/`Ctrl+Y`) (item 15)
- **Drag-and-drop na setlist** (item 16)
- **Virtualização da tabela** para bibliotecas grandes (item 6)
- **Colunas redimensionáveis** + **persistência das larguras** (itens 20, 21)
- **Energia clicável** (clique no ●○ para setar 1–5) (item 19)
- **Acessibilidade**: aria-labels nos botões de ícone (item 18)

- **Miniaturas de capa** (lazy) · **snap dos cues por BPM** · **persistir filtro/lente**

Pendentes (próximas levas): **i18n** (refactor grande, baixo ROI enquanto PT-BR único),
cues Serato em **M4A**, **code-signing Windows** (precisa de certificado), assinatura/
notarização macOS (secrets já passados no CI).

## Prioridade alta (maior impacto no uso real de DJ)

1. **Navegação por teclado estilo Excel** 🟡 — hoje só `Delete` e duplo-clique editam.
   Faltam: setas pra mover a célula ativa, `Enter`/`Tab` pra confirmar e pular, digitar
   pra começar a editar, `Ctrl+C/V` entre células. É o que mais aproxima de uma planilha.
2. **Camelot/key colorido (mixagem harmônica)** 🟡 — colorir a coluna **Tom** pela roda
   Camelot e permitir ordenar/filtrar por compatibilidade. Valor enorme pra montar set.
3. **Duração da faixa + tempo total do set** 🟢 — o `lofty` já expõe `properties().duration()`;
   ler e mostrar coluna `Tempo` e, no painel Setlist, o **tempo total do show**.
4. **Ordenar a tabela por coluna** 🟡 — clicar no cabeçalho hoje só seleciona a coluna.
   Adicionar ordenação (BPM, Tom, Gênero, Ano) — essencial pra organizar/agrupar.
5. **Confirmação de gravação estilizada com preview** 🟢 — trocar o `window.confirm`
   nativo por um modal on-brand listando o que será gravado (faixa → campos alterados).
6. **Virtualização da tabela** 🟡 — bibliotecas com milhares de faixas vão travar.
   `@tanstack/react-virtual` resolve mantendo a UX.

## Prioridade média

7. **Menu de contexto (clique direito) na linha/célula** 🟡 — Reset da linha (já existe
   `resetRow` no store, sem UI), Adicionar à setlist, Reabrir/Reler tags, **Revelar no
   Finder/Explorer**, copiar valor. Centraliza ações hoje espalhadas.
8. **Toolbar agrupada em menus** 🟢 — está ficando cheia (Abrir, Importar, CSV, TXT, RB XML,
   Setlist, Taggear, Revisar, Gravar, Desfazer, ⚙). Agrupar em **Importar/Exportar ▾** e
   deixar as ações de IA/Gravar em destaque.
9. **Indicador do provedor de IA ativo** 🟢 — um chip “Claude” / “Ollama” perto do botão
   *Taggear*, pra não precisar abrir a engrenagem pra saber o que está ativo.
10. **Padronizar títulos sem IA (preview)** 🟡 — `lib/format.ts` já tem `cleanText/
    formatTitle/applyCharLimit` prontos; expor uma ação **“Padronizar títulos”** com preview
    (determinístico, grátis) separada da IA.
11. **Modo estrito do Banco de Gêneros na própria tabela** 🟡 — ao editar a célula Gênero,
    oferecer autocomplete/datalist com os gêneros do banco (consistência manual também).
12. **Legenda dos status** 🟢 — os pontos coloridos (pristine/dirty/pending/erro) e os
    marcadores `D`/`!` não têm legenda. Um popover “?” explicando as cores.
13. **Barra/aviso de progresso da IA + cancelar** 🟡 — hoje o progresso fica só no texto do
    botão. Uma barrinha e um **Cancelar** ajudam em lotes grandes.
14. **Ações em duplicatas** 🟡 — na lente de duplicatas, oferecer “manter melhor (maior
    bitrate/ tem artwork) e marcar as outras”.

## Prioridade baixa / polish

15. **Undo/redo de edições manuais** (`Ctrl+Z`) 🔴 — além do undo de gravação.
16. **Arrastar pra reordenar a setlist** 🟡 — hoje é só ▲▼; drag-and-drop é mais fluido.
17. **Thumbnail de capa** 🟡 — `hasArtwork` já é detectado; mostrar miniatura/ícone.
18. **Acessibilidade** 🟢 — `aria-label` nos botões com emoji (⚙, ✕, ▲▼), foco visível,
    não depender só de cor pra status.
19. **Energia como barras/●●●○○** 🟢 — leitura mais rápida que o número 1–5.
20. **Persistir filtros/lente e largura de colunas** 🟢 — lembrar o estado entre sessões.
21. **Colunas redimensionáveis / reordenáveis** 🟡 — larguras hoje são fixas.
22. **i18n** 🟡 — a UI é toda PT-BR hardcoded; extrair strings se for distribuir.

## Quick wins sugeridos pra próxima leva (bom custo/benefício)
- Duração + tempo total do set (3)
- Confirmação de gravação estilizada (5)
- Indicador do provedor de IA (9)
- Legenda de status (12)
- Energia em ●●●○○ (19)
- Menu de contexto com “Revelar no Finder/Explorer” + Reset (7)
