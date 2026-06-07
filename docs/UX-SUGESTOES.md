# Sugestões de UI/UX — Tracklistr

Revisão do estado atual (core + IA + análise + setlist/import-export) com sugestões
priorizadas. Marcadas com esforço aproximado: 🟢 rápido · 🟡 médio · 🔴 grande.

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
