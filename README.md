# Unidades

Sistema de registros de documentos separado por unidade, com banco em Google Sheets via Google Apps Script.

Este repositorio e a trilha experimental **Unidades Ultimate**, criada para evoluir o sistema sem alterar o repositorio original.

## Primeiras melhorias Ultimate

- Fila **Atencao agora** com as pendencias mais importantes da unidade.
- Prioridade por pendencia: baixa, normal, alta e urgente.
- Prazo por pendencia, com aviso visual para vencimentos de hoje, amanha e atrasados.
- Cola de reuniao copiavel, com resumo do documento, andamento, pendencias e concluidos.
- Build integrado para Google Apps Script em `apps-script/Index.html`.

## Links

- App publicado: https://script.google.com/macros/s/AKfycbzKBQlkB3c4EBu7FAeoF-TUHxEsGH43rVZ32r54H3QxmXrukF-wiB9xmt0uQYB0s7n8/exec
- Planilha banco de dados: https://drive.google.com/open?id=1xFwY5UEs0nkUvz7we3WFlrRjfoEQsIHezZlP2k7rHeM
- Projeto Apps Script: https://script.google.com/d/10TCgouVk5KqrtKv7QjgVbTt1ZM0XHoyv1-Y_2sky6jcYDTfjTwRV25gx/edit

## Acessos

- Jaguapitã: `jaguapita`
- Palmeiras: `palmeiras`
- Ipuaçu: `ipuacu`
- Arapongas: `arapongas`
- Rondon: `rondon`
- Painel da Rosa: login `rosa`, senha inicial `gass`

## Desenvolvimento

```bash
npm install
npm run dev
npm run lint
npm run build
npm run build:apps-script
```

Para publicar o Apps Script:

```bash
cd apps-script
npx @google/clasp push --force
npx @google/clasp deploy --description "Unidades web app"
```
