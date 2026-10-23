# MEU Job Bot

Extensão do Chrome (Manifest V3) com dois modos:

- **Triagem diária (recomendado)** — pagina suas buscas na Catho e na InfoJobs, abre cada vaga nova, compara a descrição com o seu currículo, guarda o que já foi visto e manda os links por e-mail. Você abre o link e se candidata.
- **Candidatura automática (legado)** — preenche e envia o formulário na vaga, com confirmação.

A extensão não pede, não guarda e não digita senha. Você entra na Catho/InfoJobs pelo próprio Chrome e o bot usa essa sessão. Nada é enviado às empresas no modo triagem.

---

## Instalar

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. **Carregar sem compactação** → selecione esta pasta (`mue-job-bot`).

Depois de qualquer alteração no código, clique no ↻ do cartão da extensão.

## Primeira execução

1. Clique no ícone da extensão → **Abrir triagem diária**.
2. O currículo é carregado sozinho de `data/curriculo.txt` na primeira abertura. Se você trocar de currículo, use **importar .txt** ou cole o texto no campo.
3. Confira **Currículo e alvo**: cargos alvo, cidades, senioridades, piso salarial, stack e termos a evitar. Os cargos alvo **definem a nota**, não as buscas — para transformá-los em buscas, clique em **gerar buscas dos cargos alvo** (cria uma na Catho e uma na InfoJobs por cargo, sem duplicar).
4. Confira **Busca e ritmo**: cada linha é uma busca (`site` + URL da listagem + apelido). Já vêm duas buscas da Catho e duas da InfoJobs ativas (LinkedIn vem desligado). Ajuste:
   - **Páginas por busca** (padrão 2)
   - **Vagas abertas por execução** (padrão 30)
   - **Buscas por execução** (padrão 8; 0 = todas) — com mais buscas que isso, entra em **rodízio**: cada dia pega um bloco diferente e continua de onde parou
   - **Pausa mínima/máxima** entre vagas (padrão 1,2 s a 2,8 s)
   - **Trazer a aba para frente** (deixe desligado para rodar em segundo plano)
5. Clique em **Rodar agora** para o primeiro teste. Acompanhe o log, a barra de progresso e a tabela **Vagas avaliadas**.
6. Se o site pedir autorização de origem, use **autorizar sites**.

### Cargos × buscas (importante)

Uma busca é uma **URL de listagem** do site. O cargo alvo não vira busca sozinho — ele entra na conta da nota. Com 16 cargos × 2 sites você teria 32 buscas; por isso:

- O botão **gerar buscas dos cargos alvo** cria as URLs no padrão de cada site:
  - Catho: `https://www.catho.com.br/vagas/<cargo-com-hifens>/`
  - InfoJobs: `https://www.infojobs.com.br/vagas-de-emprego-<cargo-com-hifens>.aspx`
- `maxSearchesPerRun` (padrão 8) limita quantas rodam por dia e o **rodízio** cobre o resto nos dias seguintes. O log mostra `Rodízio: 8 de 32 buscas nesta execução. A próxima começa em "…"`.
- Quer varrer tudo todo dia? Coloque **Buscas por execução = 0** e aceite a execução mais longa.

## Como a triagem funciona

Para cada busca ativa:

1. Abre a página da lista e lê os cartões de vaga (JSON-LD `JobPosting` quando existe; senão, o HTML).
2. Descobre a próxima página e segue paginando até o limite de páginas.
   - Catho: `?page=N` / botão `a.next-page`.
   - InfoJobs: `?Page=N`.
3. Gera uma chave estável por vaga (`catho:<id>`, `infojobs:<id>`) e descarta o que já está no histórico — inclusive URLs antigas com `utm_*`.
4. Ordena as novas por nota estimada (título/empresa/local) e **abre cada uma** em uma aba de trabalho, com pausa aleatória entre aberturas.
5. Extrai título, empresa, local, salário, data e descrição completa, e calcula a nota.
6. Salva tudo em `chrome.storage.local`, monta o digest e (se o e-mail estiver ligado) envia.
7. Fecha a aba de trabalho, salvo se **Deixar a aba aberta no fim** estiver marcado.

Vagas com erro de carregamento **não** entram no histórico como vistas: elas são tentadas de novo na execução seguinte.

### O que significa cada nota

A nota local é gratuita e roda sempre:

| Faixa | Veredito | Leitura |
| --- | --- | --- |
| 80–100 | forte | cargo, stack e local batem |
| 65–79 | boa | vale abrir |
| 50–64 | talvez | tem algo fora do alvo |
| 0–49 | fraca | entra no e-mail, mas é o fim da fila |

O cálculo soma cargo (peso maior), tecnologias do seu perfil, senioridade, localização/remoto, faixa salarial versus piso, frescor do anúncio e bônus de domínio (ETL, banco relacional). Desconta título administrativo/suporte, vaga sênior/lead, stack fora do perfil, presença em outra cidade, salário abaixo do piso e anúncio antigo ou encerrado.

**IA opcional:** com **Usar IA na avaliação** ligado, as vagas acima de *nota local mínima* (padrão 45) recebem uma segunda leitura do currículo por um endpoint compatível com OpenAI (`/chat/completions`, `response_format: json_object`). O limite é *máximo de avaliações de IA por execução* (padrão 40). Sem chave, o bot segue só com a heurística. Use **testar IA com uma vaga falsa** para validar endpoint, modelo e chave.

**Reavaliar guardadas** recalcula a nota de tudo que já está no histórico sem reabrir página nenhuma — útil depois de mexer no currículo, no perfil ou no prompt da IA.

## Deduplicação (o que já foi visto)

- Chave por site + id da vaga; parâmetros de rastreio são removidos da URL guardada.
- Histórico em `mjb.jobs`, execuções em `mjb.runs`.
- Uma vaga vista ontem **não** é reaberta hoje, mesmo que apareça em outra página ou com `utm_`.
- **Reavaliar guardadas** recalcula as notas sem apagar nada.
- **zerar histórico** apaga as vagas vistas, para refazer a triagem de um período.

## E-mail do dia

Já vem configurado com **Web3Forms** e a access key preenchida: o digest chega em `felipe.reis.dias@gmail.com`. Para desligar, desmarque **Enviar o e-mail do dia**. O digest continua disponível no painel de qualquer forma: **Prévia do e-mail**, **baixar .html** e **copiar lista**.

Cada execução envia **todas as vagas que o robô abriu e avaliou**, ordenadas da maior nota para a menor, com a nota na primeira linha de cada vaga. Sem corte por padrão — o campo **nota de corte** existe só para quem quiser esconder as notas baixas (0 = todas).

Provedores suportados (dá para trocar no campo **Provedor**):

| Provedor | O que precisa | Observação |
| --- | --- | --- |
| **Web3Forms** (padrão) | access key | Texto simples, sem HTML. A entrega vai para o e-mail dono da chave |
| **Brevo** | API key + remetente verificado | Envia HTML e texto; melhor fidelidade visual |
| **Resend** | API key + `from` | Sem domínio próprio, use `onboarding@resend.dev` (só para o seu e-mail) |
| **Webhook próprio** | URL | POST JSON `{to, subject, html, text, from}` — use Zapier/Make/n8n ou seu servidor |

Sobre o Web3Forms:

- A access key é **pública por projeto** (feita para ficar em código de front-end), então está no `lib/store.js` como padrão. Trocar de chave ou de destino é só editar no painel.
- O destinatário é o e-mail da conta Web3Forms que gerou a chave. O campo **E-mail de destino** vai como reply-to.
- O texto do e-mail tem uma linha por vaga, com nota, empresa, local, salário, motivos, pontos de atenção e o **link direto** — o Gmail transforma os links em clicáveis.
- Se o Cloudflare do Web3Forms bloquear a requisição (erro 403 "Just a moment"), abra `web3forms.com` uma vez neste Chrome, conclua a verificação e use **enviar teste** de novo.

Campos:

- **Nota de corte do e-mail** (padrão 0 = todas) e **máximo de vagas no e-mail** (padrão 15).
- **Enviar teste** valida a configuração sem esperar a próxima execução.
- **Enviar vagas do painel** monta o e-mail na hora com as vagas que estão na tabela (com as notas) e envia, mesmo que já tenham ido antes.

Nenhuma vaga aberta = nenhum e-mail: o assunto "nenhuma vaga nova" cai justamente aí, para não encher sua caixa com dia vazio. Se o e-mail não chegar, o log do painel mostra quantos links cada busca encontrou.

Se o envio falhar, o erro aparece no log e o digest continua salvo — nada se perde.

## Rodar sozinho todo dia

O agendamento usa `chrome.alarms` (sem serviço externo, sem custo):

- Um alarme acorda a extensão a cada 60 minutos e faz uma checagem leve.
- Se o horário configurado (**Hora do dia**, padrão 8) já passou e ainda não houve execução concluída **hoje**, abre `triagem.html?autorun=1` em segundo plano e roda.
- Em `onStartup` e `onInstalled` também há uma checagem de recuperação — se o Chrome ficou fechado no horário, a triagem roda quando você abrir o navegador.
- Se a aba de triagem já estiver aberta, o alarme manda uma mensagem para ela em vez de abrir outra.
- Trava de 90 minutos (`mjb.triageLock`) evita duas execuções simultâneas.

**Limite importante:** o Chrome precisa estar aberto com o perfil onde a extensão está instalada. O alarme não dispara com o navegador fechado; nesse caso a execução acontece na próxima abertura. A aba de triagem é marcada como não descartável para sobreviver ao economizador de memória.

## Estrutura

```
manifest.json          permissões, hosts e service worker
background.js          alarme horário + checagem do dia + abre a triagem
popup.html/js          atalhos: triagem, painel, buscas prontas
triagem.html/css/js    painel de triagem diária (ES modules)
panel.html/js          painel de candidatura automática (legado)
content.js             scripts injetados nas páginas de vaga
lib/store.js           config padrão e persistência
lib/seen.js            chaves, histórico de vagas e execuções
lib/match.js           heurística + avaliação por IA
lib/email.js           digest HTML/texto + provedores
lib/triage.js          orquestrador (paginar, abrir, avaliar, salvar, enviar)
runner/adapters.js     regras por site (lista, detalhe, paginação)
runner/scan.js         leitura da lista e próxima página
runner/extract.js      extração da vaga (JSON-LD/DOM)
data/curriculo.txt     currículo em texto, usado na avaliação
```

Chaves no `chrome.storage.local`: `mjb.config`, `mjb.jobs`, `mjb.runs`, `mjb.digest`, `mjb.triageTabId`, `mjb.triageLock`.

## Modo candidatura automática (legado)

1. Entre no site manualmente.
2. Abra o popup, clique numa busca pronta (ou use a busca do site) e em **Varrer esta página**.
3. Marque as vagas e clique em **Candidatar marcadas**.

Cada leva clica em no máximo 5 vagas, com pausa entre elas. Captcha ou verificação humana **para** a leva. O painel verde no canto mostra as oito primeiras notas; o contorno verde marca o que passou da nota mínima. Na InfoJobs a candidatura costuma estar dentro da vaga — a extensão abre a página quando o botão não está na lista.

## Limites e bom senso

- Os sites mudam o HTML e podem bloquear rajadas. Se a estrutura quebrar, o log mostra `0 link(s)` — ajuste o seletor em `runner/adapters.js`.
- Não resolve captcha, não cria conta e não contorna bloqueio de login.
- O modo triagem **não se candidata**: ele só entrega links. A decisão continua sendo sua.
- O histórico cresce devagar (uma linha por vaga). **zerar histórico** existe para recomeçar.
- Dados ficam só no `chrome.storage.local` deste navegador. Chaves de IA/e-mail não saem da máquina, exceto para os endpoints que você configurar.
