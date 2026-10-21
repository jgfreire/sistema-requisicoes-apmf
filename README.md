# Requisições APMF

Você escolhe os PDFs das requisições e o sistema devolve uma planilha Excel pronta. Funciona sem internet.

## Abrir
1. Tenha o Node.js instalado (nodejs.org, versão 22.5 ou mais nova).
2. Dê dois cliques em `iniciar.bat`. Na primeira vez ele instala o que falta e abre o navegador em http://localhost:4200. Mantenha a janela preta aberta enquanto usa o sistema.

## Usar
1. No primeiro acesso, crie o administrador. Depois, o administrador cadastra os outros usuários no link **Cadastrar usuários**, no topo da tela.
2. Escolha os PDFs (vários de uma vez) e clique em **Gerar planilha**. O Excel é baixado.

## Colunas da planilha
Tipo, Número, Fornecedor/Prestador, Discriminação, Justificativa, Categoria (com o número, como "7-Despesas Diversas"), Valor e Data da requisição, com uma linha de Total no fim.
Um PDF que não puder ser lido aparece na planilha como "NÃO LIDO: nome do arquivo".

## Dados
O banco `apmf.db` guarda só os usuários. Para backup, copie esse arquivo com o sistema fechado.
