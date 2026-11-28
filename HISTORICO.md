# Histórico de versões — Rádio do Rosimar

Cada linha é uma publicação. O código completo de qualquer uma fica em https://github.com/kevinpaulor/radio-do-rosimar/commits/main (botão <> abre o projeto como estava naquele momento).

- **28/11/2026 02:25 · versão 23** — Bip mais alto (dois toques ao abrir o microfone, um ao fechar)
- **28/11/2026 02:22 · versão 22** — Falas curtas (Cliente? Serviço? Que dia? Valor?), bip ao abrir e fechar o microfone, microfone abre logo depois da pergunta
- **28/11/2026 02:18 · versão 21** — Voz e texto sem abrir o teclado sozinho (caixa no fim da tela); reconhecimento usa o mesmo microfone da gravação quando o Chrome permite; menos espera entre pergunta e microfone
- **28/11/2026 02:12 · versão 20** — Versão e data/hora no rodapé, com aviso de versão nova; ferramenta nova-versao.py
- **28/11/2026 02:08** — Microfone livre no modo voz: gravar áudio junto vira opção experimental (desligada)
- **28/11/2026 02:04** — Configurações (modo voz/texto/ambos, ordem das perguntas, endereço), perguntas por etapa com barra de progresso, coluna Endereço
- **27/11/2026 18:48** — Modo digitado também grava o som ambiente (para testar o áudio sem falar)
- **27/11/2026 18:45** — Links ▶ Ouvir e 📅 Ver como texto com link (sem #ERROR! em planilha pt-BR); aviso Digitado (teste); nome de cliente novo com acento
- **27/11/2026 18:33** — Modo teste: o app fala as perguntas e as respostas são digitadas
- **27/11/2026 14:41** — Voz do app baixa/muda: pergunta antes de gravar e grava sem cancelamento de eco
- **27/11/2026 13:55** — Começa perguntando o cliente; só desliga a gravação se havia voz e o reconhecimento falhou
- **27/11/2026 13:53** — Dia da semana de hoje com hora que ainda vem: agenda para hoje
- **27/11/2026 13:52** — Agenda: entende hora e agendamento na fala; script cria evento em 'Serviços do Rosimar' com 📅 Ver na planilha
- **27/11/2026 13:46** — Número que faz parte do nome do cliente não vira valor (sete Apóstolos)
- **27/11/2026 10:30** — Reconhece cliente por uma palavra característica (ex.: Apóstolo → 7 Apóstolos)
- **27/11/2026 10:30** — Garante a coluna Áudio em abas antigas
- **27/11/2026 10:29** — Áudio de cada registro: app grava junto com o reconhecimento, script salva no Drive e cria ▶ Ouvir na planilha
- **26/11/2026 14:15** — Chave trocada: o app apaga a lista de clientes e a configuração do celular
- **26/11/2026 14:00** — Configuração: caixa para colar o link; script usa o URL publicado (/exec) informado em URL_APP
- **26/11/2026 13:52** — Mostra o motivo quando o link de configuração falha; força baixar a versão nova dos scripts
- **26/11/2026 13:49** — Aceita link de configuração com endereço /dev (converte para /exec)
- **26/11/2026 11:42** — Rádio do Rosimar: app de registro por voz (fase 1) + Apps Script da planilha
