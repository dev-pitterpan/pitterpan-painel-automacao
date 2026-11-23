# Sincronização completa do catálogo Shopify

Esta integração substitui a paginação do n8n por uma operação em massa da API
GraphQL Admin. A Shopify prepara um JSONL, o sincronizador lê esse arquivo linha
por linha e envia os produtos ao dashboard em lotes.

O catálogo atual continua visível durante a importação. Produtos ausentes só são
removidos quando o novo lote termina com a quantidade esperada.

A aba **Adicionados recentemente** usa a data de criação informada pela Shopify,
armazenada no catálogo sincronizado. A aplicação acrescenta a coluna ao banco
configurado em `DATABASE_URL` na primeira consulta após a publicação. Execute
`npm run shopify:sync` para preencher as datas dos produtos existentes. A aba
consulta apenas o banco local e permite períodos de 7, 30 ou 90 dias; a data de
atualização de um produto não altera sua data de criação.

## 1. Criar e instalar o aplicativo

No Shopify Dev Dashboard, crie um app para a organização da loja, adicione os
escopos `read_products` e `read_inventory`, publique uma versão e instale o app
na loja.

Para uma loja da mesma organização, copie o Client ID e o Client secret. O script
usa essas credenciais para gerar automaticamente o token de 24 horas. Se você já
possui um token Admin offline, também pode usá-lo diretamente.

## 2. Configurar o computador que executará a sincronização

Adicione estas variáveis ao `.env.local` do projeto:

```dotenv
SHOPIFY_STORE_DOMAIN=sua-loja.myshopify.com
SHOPIFY_API_VERSION=2026-07
SHOPIFY_CLIENT_ID=seu_client_id
SHOPIFY_CLIENT_SECRET=seu_client_secret
SHOPIFY_CATALOG_SYNC_TOKEN=o_mesmo_token_configurado_na_vercel
SHOPIFY_CATALOG_API_URL=https://catalogo-pro-sepia.vercel.app/api/shopify-products
```

Se usar um token Admin offline, substitua Client ID e Client secret por:

```dotenv
SHOPIFY_ADMIN_ACCESS_TOKEN=seu_token_admin
```

Nunca publique essas credenciais no GitHub ou envie o token ao navegador.

## 3. Preparar e testar

No PowerShell, dentro do projeto:

```powershell
npm run shopify:sync
```

Após o teste, o comando pode ser agendado no Agendador de Tarefas do Windows.
O computador precisa estar ligado e conectado à internet no horário escolhido.

## Como o JSONL é interpretado

Cada produto vem em uma linha. Variantes e coleções vêm nas linhas seguintes e
contêm `__parentId`, que identifica o produto pai. Por isso o arquivo é processado
como fluxo; ele não é convertido em um único JSON grande na memória.



