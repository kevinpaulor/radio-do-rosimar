# 📡 Rádio do Rosimar

O Rosimar registra cada serviço **falando ao celular**: cliente, valor, serviço e dia.
O app repete em voz alta, ele confirma com "sim", e o registro cai na aba
**Lançamentos por voz** da planilha K-AUTO da dedetização, para o Kevin conferir e conciliar com o extrato.

- `docs/` — o app (PWA), publicado no GitHub Pages: https://kevinpaulor.github.io/radio-do-rosimar/
- `apps-script/Radio.gs` — o código que roda dentro da planilha e recebe os registros.
- Os testes usam nomes reais de clientes, por isso ficam fora deste repositório público.

Nenhuma chave ou nome de cliente fica neste repositório: o app recebe a chave pelo link de
configuração e baixa a lista de clientes direto da planilha.

Criado por Kevin Paulo · @Arkev.arq
