# Unidades Ultimate

Meta: transformar o Unidades em uma versao mais inteligente, bonita e util, sem alterar o repositorio original `Drill23/Unidades`.

## Principios

- Preservar o sistema original e evoluir somente este repositorio experimental.
- Cada ciclo precisa entregar algo verificavel: build, lint, fluxo no navegador ou pacote Apps Script.
- Priorizar melhorias que ajudem reunioes reais: clareza, comunicacao, pendencias, prazos, historico e menos retrabalho.
- Evitar refatoracoes grandes sem ganho visivel.

## Ciclos de melhoria

1. Inteligencia operacional: prioridades, prazos, fila de atencao e resumos copiaveis.
2. Aparencia e ergonomia: densidade melhor, responsivo mais forte, leitura mais clara para Rosa e unidades.
3. Comunicacao: notificacoes internas, status de visto/resposta, mensagens-modelo e filtros por urgencia.
4. Dados: exportacao, auditoria, historico de alteracoes e espelhos mais ricos na planilha.
5. Qualidade: testes automatizados de fluxos principais, validacao do Apps Script e checklist de publicacao.

## Checklist de cada ciclo

- Rodar `npm run lint`.
- Rodar `npm run build`.
- Rodar `npm run build:apps-script` quando houver mudanca de frontend.
- Validar no navegador local pelo menos um fluxo afetado.
- Fazer commit pequeno com resumo claro.
