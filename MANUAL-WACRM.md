# Manual do wacrm — Sunne Sul Assessor de Energia

Registro de tudo que foi configurado e feito no CRM de WhatsApp (wacrm) para a Sunne Sul. Use como referência caso precise mexer em algo de novo ou repassar para outra pessoa.

Última atualização: 20/08/2026

> ⚠️ **Nota sobre este arquivo (20/08/2026):** este manual só era editado localmente e nunca tinha sido commitado no Git desde 03/08/2026 — um `git reset --hard` para sincronizar um fix de código com o GitHub apagou sem querer todo o conteúdo adicionado depois dessa data. Reconstruído a partir de commits reais e dos dados do Supabase (seção 5.1, 11.1, 12, 14 e 14.1). O bug do Telegram Chat ID (seção 11) já estava corrigido há dias, banner desatualizado removido. **A partir de agora, este arquivo é commitado no Git junto com o código para não perder de novo.**

---

## 1. Visão geral do projeto

- **Sistema:** wacrm — CRM de WhatsApp feito em Next.js
- **Repositório:** GitHub `camarguinhocap-max/wacrm`
- **Hospedagem:** VPS próprio (`137.131.246.36`), gerenciado via **EasyPanel**
- **URL de produção:** https://wacrm-wacrm-app.n6hpil.easypanel.host
- **Banco de dados:** Supabase (projeto `dpuiwmwwovwgwnwpsgnw`)
- **Número WhatsApp em uso:** +55 41 8775-7984 (conta oficial "Assessor de Energia | Sunne Sul", WABA da Meta)
- **App da Meta:** SunneSul1

---

## 2. Infraestrutura (o que já está pronto)

1. VPS criado e configurado
2. EasyPanel instalado no VPS
3. App wacrm criado no EasyPanel a partir do Git (deploy automático a cada push)
4. Variáveis de ambiente configuradas no EasyPanel
5. Banco Supabase conectado, todas as migrations (008 a 036) aplicadas
6. Deploy verificado e funcionando
7. Número +55 41 8775-7984 migrado para a WABA da Sunne Sul, com App Secret e token configurados no wacrm

**Pendente:** configurar domínio próprio e SSL customizado (hoje o sistema roda no domínio padrão do EasyPanel, `*.easypanel.host`).

### Especificação real do VPS (confirmada) e por que ele é lento
Confirmado via metadata do próprio Oracle Cloud (`http://169.254.169.254/opc/v2/instance/`): o VPS é um `VM.Standard.E2.1.Micro` do plano **Always Free** — **1 OCPU (2 vCPU threads por hyperthreading), 954MB de RAM**, região São Paulo (`sa-saopaulo-1`). É essa configuração modesta que deixa o build/deploy lento, não é um problema de código.

**Tentativa de upgrade gratuito (Ampere A1) — abandonada:** o Oracle Always Free também oferece um plano Ampere A1 (ARM, até 2 OCPU/12GB desde jun/2026 — antes era 4 OCPU/24GB). Tentamos criar uma instância Ampere A1 duas vezes (4 OCPU/24GB e depois 2 OCPU/12GB) e as duas vezes deu erro **"Out of host capacity"** — problema conhecido e comum do Oracle nesse plano gratuito. Recursos Always Free só podem ser criados na região "home" da conta (São Paulo, sem alternativa de trocar de região de graça), e São Paulo só tem 1 availability domain, então não há como contornar sem pagar. **Decisão do usuário: desistir do Ampere A1 e continuar otimizando a VM atual de 1GB.**

**Ajuste no build (Dockerfile) por causa da RAM baixa:** o build do Next.js estava dando `JavaScript heap out of memory` (V8 calcula o limite de heap com base na RAM física, ~490MB nessa VM). Primeiro ajuste (`NODE_OPTIONS=--max-old-space-size=2560`) evitou o crash mas causou **swap thrashing** (40+ min de build usando só ~12 min de CPU real, resto perdido em I/O de swap). Ajustado para **1024MB** (`Dockerfile`, stage `builder`) — meio-termo documentado direto no comentário do Dockerfile. Commit: `6ee354d`.

### Observação sobre quedas do site
Já aconteceu do site ficar fora do ar por um problema na camada de proxy do EasyPanel (não é o código do app nem o VPS). Se isso acontecer de novo:
- Verifique o container do app no EasyPanel — se os logs mostrarem "Ready" sem erro, o app está ok.
- O problema costuma estar no proxy reverso (Traefik) do EasyPanel. Tentar reiniciar o serviço de proxy ou reiniciar o VPS (via SSH) resolve.
- O painel do EasyPanel roda na porta 3000 direto no IP do VPS e não é afetado por essa queda — dá pra usar ele pra diagnosticar mesmo com o site fora do ar.

---

## 3. Templates de mensagem (WhatsApp)

Templates são as mensagens pré-aprovadas pela Meta, usadas para iniciar conversa com um contato (fora da janela de 24h) ou para automações.

Local no wacrm: **Configurações → Templates**

### Regra importante descoberta na prática
O corpo de um template **não pode começar direto com uma variável** (`{{1}}` logo no início do texto). A Meta rejeita com "Invalid parameter". Sempre coloque um texto fixo antes da primeira variável (ex: "Oi {{1}}," em vez de "{{1}}, ...").

### Templates criados
**Todos os templates estão Aprovados pela Meta**, exceto um: `oferta_energia_sunne`, que ficou em rascunho com erro "Invalid parameter" (foi a primeira tentativa que caiu na regra acima — o texto correto virou o template `oferta_energia_limpa`, esse sim aprovado). Pode ser apagado quando quiser, é só um rascunho abandonado.

Templates aprovados hoje: `hello_world`, `teste_marketing_var1`, `teste_marketing_var2`, `teste_marketing_simples`, `oferta_energia_limpa`, `resultado_economia`, `analise_recebida`.

### Bug conhecido na tela de Templates
O campo "Sample values" (valores de exemplo das variáveis) tinha um bug e não aparecia na tela. Foi corrigido no código (arquivo `src/components/settings/template-manager.tsx`), mas essa correção está **commitada localmente e ainda não foi enviada ao GitHub** (o ambiente usado aqui não tem acesso para dar push). Se a tela de criar template ainda estiver com esse problema, é porque essa correção não foi publicada — peça pra alguém com acesso ao repositório dar `git push` a partir de uma máquina com credenciais do GitHub configuradas.

---

## 4. Respostas rápidas (Quick Replies)

Local no wacrm: **Configurações → Quick Replies**

Foram cadastradas 8 respostas rápidas para agilizar o atendimento manual, incluindo uma com o texto completo explicando a mecânica de desconto da Sunne Sul (o texto com os emojis 🔆/1️⃣/2️⃣ que você passou).

---

## 5. Automações

Local no wacrm: **Configurações → Automações**

Foram configuradas as 4 automações padrão do sistema:

1. **Welcome Message** — mensagem de boas-vindas
2. **Out of Office** — resposta fora do horário
3. **Lead Qualifier** — qualificação de lead
4. **Follow-up Reminder** — lembrete de follow-up

### Bug corrigido: "Cannot keep automation active with invalid configuration"
Ao tentar ativar o Welcome Message, dava esse erro. Causa: o passo de "adicionar tag" (`add_tag`) estava configurado com uma tag vazia, e a conta não tinha nenhuma tag cadastrada ainda. Foi criada uma tag "Novo contato" e vinculada a esse passo — resolveu.

### Status atual
O **Welcome Message foi desativado** depois que o Flow de triagem (ver seção 7) foi criado, porque os dois disparavam na primeira mensagem do contato e mandariam mensagem duplicada. As outras 3 automações (Out of Office, Lead Qualifier, Follow-up Reminder) estão ativas.

---

## 5.1 Follow-ups automáticos (regras completas)

Além das 4 automações padrão acima, existem hoje **4 automações de follow-up/reengajamento** na conta. Local: **Configurações → Automações**.

**1. Follow-up Triagem (5min/1h/6h/23h)** — criada 07/08/2026, junto com a tradução do funil de vendas (seção 7).
Gatilho: **primeira mensagem do contato**. Ao disparar: marca a tag "Aguardando resposta - Triagem" e manda 4 variações de lembrete de vendas escalonadas — **5min → 1h → 6h → 23h** depois da etapa anterior — checando antes de cada envio se a tag ainda está presente (ou seja, se o cliente ainda não respondeu). No fim do ciclo remove a tag.
Status: **inativa desde 10/08/2026** (dois dias depois de criada, e não roda desde então). Não há registro do motivo da desativação — confirmar se foi proposital ou se deveria ser reativada.

**2. Follow-up Triagem - Parar se responder** — criada 07/08/2026, ativa.
Gatilho: **nova mensagem do contato**. Rede de segurança: se o cliente responder com texto livre (sem clicar em botão) enquanto está com a tag "Aguardando resposta - Triagem", remove a tag na hora e corta os lembretes agendados pela automação acima.

Existe também, direto no código (não aparece como automação na tela), uma segunda camada da mesma proteção: sempre que um atendente manda mensagem manual pelo Inbox (`src/lib/whatsapp/send-message.ts`), o sistema já remove a tag "Aguardando resposta%" do contato — ou seja, um atendente assumir a conversa também para os lembretes da triagem, não só uma resposta do próprio cliente.

**3. Lembrete de Follow-up** — a mais antiga (criada 01/08/2026), ativa. É a automação por trás da mensagem *"Oi! So passando pra saber se ficou alguma duvida sobre a economia na conta de luz. Ainda posso te ajudar?"*.
Gatilho: **nova mensagem do contato**. Regra (**trava adicionada em 12/08/2026**): ao disparar, marca a tag "Aguardando resposta - Follow-up 24h"; espera **1 dia**; checa se a tag ainda está presente e só manda o lembrete se estiver; remove a tag no final. Como essa tag começa com "Aguardando resposta", ela já é coberta pela mesma trava de código que a triagem usa: assim que **qualquer atendente manda uma mensagem manual pro contato** (`src/lib/whatsapp/send-message.ts`), a tag é removida na hora e o lembrete de 24h não sai mais — a não ser que o próprio atendente/automação inicie um novo ciclo depois disso. Não precisou de deploy, é só configuração de automação no banco.
Antes dessa trava, o lembrete disparava sempre depois de 1 dia, **mesmo que um atendente já tivesse resolvido a conversa manualmente** — 3 execuções que já estavam agendadas nesse formato antigo foram canceladas ao aplicar a trava (não vão mais sair).

**4. Reengajamento - Cliente sumiu (5 dias)** — ativa. Gatilho: **primeira mensagem do contato**. Espera 5 dias e, se o contato nunca recebeu a tag "Segmento Definido" (ou seja, nunca escolheu uma opção no menu de triagem), reenvia o template de Marketing `oferta_desconto_luz`.

### Bug corrigido 19/08/2026: contato que clicou "Não tenho interesse" ainda podia receber follow-up

Encontrado ao investigar um pedido do usuário: contatos que clicam no botão **"Não tenho interesse"** do template `oferta_desconto_luz` recebem corretamente a tag **"Não contatar"** e uma mensagem de confirmação (automação "Marketing - Nao tenho interesse", isso já funcionava certo). Porém nenhuma das automações de follow-up checava essa tag antes de mandar mensagem de novo. Dois problemas reais encontrados e corrigidos direto no banco (sem precisar de deploy — automações são configuração, não código):

1. **Config duplicada/conflitante**: a automação "Marketing - Falar em 1 mes" também estava configurada para disparar no clique de "Não tenho interesse" (reply_ids incluía os dois botões por engano). Ou seja, ao clicar em "não tenho interesse", o contato recebia a tag de opt-out **e também** a mensagem "Combinado! Te chamamos daqui a 1 mês", uma contradição. Corrigido: essa automação agora só dispara no botão "Falar em 1 mês".
2. **Follow-ups não respeitavam o opt-out**: nem "Lembrete de Follow-up" (24h) nem "Reengajamento - Cliente sumiu (5 dias)" verificavam a tag "Não contatar" antes de enviar. Adicionada uma checagem (`condition` de presença da tag "Não contatar") no início do envio das duas — se o contato tiver essa tag, a automação para e não manda nada.

### Bug corrigido 20/08/2026: falha no envio de broadcast não guardava o motivo

Encontrado ao investigar por que alguns contatos do lote de reconexão "Cliente OP" apareciam como "Falhou" mesmo tendo WhatsApp ativo. Causa: o webhook (`src/app/api/whatsapp/webhook/route.ts`) recebe o motivo do erro do Meta (`status.errors`) em toda falha de entrega, mas só usava essa informação para um caso específico (código 131026, tag automática "Sem WhatsApp") — o motivo em si **nunca era salvo** na coluna `broadcast_recipients.error_message`, então qualquer outra causa de falha aparecia como "Falhou" genérico, sem explicação, indistinguível de "não tem WhatsApp". Corrigido: agora o motivo completo (`[código] título - mensagem`) é sempre salvo em `error_message`. Commit `9d73515`/`ed36123`, precisa de deploy (push + GitHub Actions + EasyPanel) para valer em produção.

---

## 6. Importação de contatos

Local no wacrm: **Contatos → Importar**

### Formato exigido pelo sistema
O arquivo CSV precisa ter cabeçalhos em minúsculo, exatamente assim:
```
phone,name,email,company,tags
```
Só `phone` é obrigatório. Um export do Google Contacts (que usa cabeçalhos como "First Name", "Phone 1 - Value") **não funciona direto** — o sistema não reconhece as colunas e importa zero contatos, sem avisar claramente o motivo.

### O que foi feito
Duas listas de contatos foram limpas e reformatadas para o padrão exigido (número normalizado, DDD corrigido quando ambíguo — assumido DDD 41 conforme sua confirmação). Resultado:
- Lista 1: 673 contatos prontos para importar, 42 descartados (número inválido/incompleto)
- Lista 2: 500 contatos prontos, 1 descartado

Os arquivos finais (`contacts_wacrm.csv`, `contacts2_wacrm.csv`) e as listas de não-importados foram entregues separadamente na conversa.

### O que significa "skipped" na importação
Contatos "pulados" (skipped) são contatos cujo número já existia previamente na base — o sistema evita duplicar automaticamente pelo número de telefone normalizado. Não é um erro, é uma checagem de duplicidade funcionando.

### Por que alguns números dão "not on WhatsApp" ao tentar mandar mensagem
Isso acontece quando **a empresa tenta iniciar** a conversa com um contato que nunca teve WhatsApp naquele número, ou que trocou de número. A checagem "está no WhatsApp" só é feita nesse sentido (empresa → contato). Já quando é o cliente que manda mensagem primeiro para a Sunne Sul, essa checagem não existe — por isso alguém pode te mandar mensagem mesmo que uma tentativa de contato feita pela empresa não teria funcionado.

---

## 7. Flows (BETA) — Fluxo de triagem automática

Local no wacrm: **Flows** (menu lateral, marcado como BETA)

Um Flow é um fluxo de decisão automático (tipo um bot de menu), diferente de uma Automação simples — permite ramificações com botões, condições, coleta de resposta, etc.

### Fluxo criado: "Menu inicial - Triagem"
Dispara na **primeira mensagem** de qualquer contato novo (substituiu o Welcome Message). Estrutura:

1. **Mensagem inicial** com 3 botões:
   - **Casa/Empresa (baixa tensão)** — até 40% de desconto
   - **Empresa (média/alta tensão)** — até 40% de desconto, contrato de tempo pré-determinado
   - **Quero ser Assessor** — cadastro para quem quer se juntar ao time

2. **Ramo baixa tensão:** mensagem explicando o desconto de até 20%/40% para residências e pequenas empresas.

3. **Ramo média/alta tensão:** mensagem dizendo que um Assessor de Energia Sunne vai entrar em contato com os detalhes, reforçando o desconto de até 40% e contrato pré-determinado.

4. **Ramo "quero ser Assessor":** mensagem de boas-vindas ao interesse em fazer parte do time, avisando que o recrutamento vai entrar em contato, com os dois gatilhos de comissão:
   - 40% da primeira fatura de cada contrato fechado
   - Percentual recorrente todo mês sobre os contratos fechados

### Como editar o texto do fluxo
Pelo wacrm não existe editor visual pronto ainda para Flows — as edições de texto feitas aqui foram aplicadas diretamente via API (`PUT /api/flows/[id]`). Se precisar mudar o texto de novo, me chame que eu ajusto.

### Como resetar um número para teste
Para testar como se fosse a "primeira mensagem" de novo com um número que já conversou, é necessário apagar a conversa (isso apaga o histórico de mensagens daquele contato e reseta o status para "novo contato"). Já foi feito isso duas vezes durante os testes.

---

## 8. Meta Business Manager — Perfil da empresa e Catálogo

Fora do wacrm, direto no **Gerenciador do WhatsApp** da Meta (business.facebook.com), existe o equivalente às configurações do app WhatsApp Business do celular:

### Site da empresa
`Números de telefone → clique no número → aba "Perfil"`. Lá tem: Categoria, Descrição, Endereço, Email e até **2 campos de Site**. **Atualização 04/08/2026:** Email (`contato@sunnesul.com.br`) e os 2 campos de Site (`https://sunnesul.com.br/`, `https://sunnesul.com.br/cartao`) já estão preenchidos — a nota antiga dizendo que estavam vazios estava desatualizada. Só **Descrição** e **Endereço** continuam vazios (opcional, ver seção 8.3).

### Catálogo de produtos
Menu lateral → **"Catálogo"**. Ainda não está conectado nenhum catálogo a essa conta.

**Atenção:** ao tentar conectar um catálogo existente, apareceu o erro *"Catálogo de produtos já vinculado a uma conta do WhatsApp Business"* — a Meta só permite 1 catálogo por conta do WhatsApp Business por vez. Esse catálogo específico já está linkado em outro lugar (possivelmente o WhatsApp Business do celular, ou uma das contas antigas). Duas opções:
1. Desvincular o catálogo de onde está hoje e depois conectar aqui.
2. Criar um catálogo novo, exclusivo para essa conta.
Essa decisão ainda está em aberto — falta confirmar se o catálogo atual pode ser desvinculado do celular sem prejudicar o uso de lá.

---

## 8.1 Envio em massa (broadcast) — template com imagem e botões

Template final: **`oferta_desconto_luz`** (Marketing, PT_BR) — imagem de topo com "ATÉ 40% DE DESCONTO", corpo explicando a oferta, rodapé "Sunne Sul - Energia limpa" e **3 botões**: "Quero saber mais" (abre um mini-menu igual ao Flow de triagem), "Falar em 1 mês" e "Não tenho interesse". Enviado para aprovação da Meta (status Pending — prazo típico até 24h). Existe um template anterior de 2 botões (`promo_desconto_energia`) parado em Pending — foi substituído por esse, pode ser ignorado/apagado depois.

Total de 5 automações novas pra cobrir todos os cliques:
1. "Quero saber mais" → tag "Novo contato" + envia o mini-menu de 3 opções
2. Opção "Baixa Tensão (casa)" → tag + mensagem (mesma copy do Flow) — até 20% de desconto
3. Opção "Média/Alta (empresa)" → tag + mensagem (mesma copy do Flow) — até 40% de desconto
4. Opção "Quero ser Assessor" → tag + mensagem (mesma copy do Flow) — gatilhos de comissão
5. "Não tenho interesse" / "Falar em 1 mês" → tags de opt-out / follow-up + confirmação

**Dois bugs de código corrigidos** (ambos em `src/app/api/whatsapp/webhook/route.ts`), nenhum ainda publicado (push):
1. Toque em botão de **template** chega num formato de webhook diferente do botão de Flow, e o wacrm não sabia processar — sem a correção, a automação nunca disparava.
2. Descoberto durante os testes: o Flow "Menu inicial - Triagem" dispara em qualquer primeira mensagem do contato — e pra maioria dos 1157 contatos, o toque no botão do broadcast SERIA a primeira mensagem deles. Isso faria o Flow "brigar" com as automações novas (ex: alguém toca "Não tenho interesse" e ainda assim recebe o menu de boas-vindas do Flow). Corrigido: toque em botão de template nunca conta como "primeira mensagem" pra fins de disparo de Flow/automação.

**Atenção:** ao tentar comitar essas correções pelo terminal aqui, o comando travou e deixou um arquivo de lock preso: `D:\CRM\wacrm\.git\index.lock`. Isso vai bloquear qualquer comando git (`commit`, `pull`, etc.) até esse arquivo ser apagado manualmente. Apague esse arquivo primeiro, depois comite e envie (push) as 3 correções pendentes:
1. Bug do "Sample values" nos Templates (`template-manager.tsx`)
2. Bug dos botões de template não disparando automação (`webhook/route.ts`)
3. Bug do Flow disparando junto com as automações de botão (`webhook/route.ts`)

**Sem esse push + deploy, as automações de botão do broadcast não vão funcionar de verdade** — os cliques chegam mas não marcam tag nem respondem. Isso precisa acontecer antes do broadcast de amanhã.

Também adicionei a variável de ambiente `META_APP_ID` no EasyPanel (necessária pra upload de imagem em template) e reimplantei o app — essa parte já está ativa em produção, independente do git.

## 8.2 Primeiro teste real de broadcast (04/08/2026) e tag automática "Sem WhatsApp"

### Teste com 20 contatos aleatórios
Feito em 04/08/2026 com o template `oferta_desconto_luz` (já aprovado), via a API pública do próprio wacrm (`/api/v1/broadcasts`) — mesmo caminho oficial usado pelo assistente de criação de campanha no painel. Resultado: **15 de 20 entregues** (8 entregues, 3 lidas, 1 resposta em segundos), **5 falharam**. Nenhum sinal de bloqueio/restrição na conta. Motivo mais provável das 5 falhas: número nunca teve WhatsApp (lista importada do Google Contacts, sem opt-in confirmado — ver aviso de risco discutido na conversa: dos 1.158 contatos importados, só 6 já tinham conversado antes com a Sunne Sul).

Onde ver o resultado detalhado de qualquer broadcast (não aparece na Inbox — ver observação abaixo): **Campanhas/Broadcasts** no menu, ou `/broadcasts/[id]`.

**Observação de comportamento (não é bug, é assim que o sistema foi desenhado):** mensagens de broadcast **nunca aparecem na conversa/Inbox do contato** — nem as enviadas pelo painel, nem pela API. Só ficam registradas na tela de Campanhas. A conversa no Inbox só nasce quando o cliente responde, e mesmo assim sem a mensagem original enviada aparecendo na thread. Se quiser mudar isso (fazer o broadcast também virar uma mensagem na conversa do contato), é uma mudança de código a parte, ainda não feita.

### Tag automática "Sem WhatsApp" (implementado 04/08/2026 — pendente de push/deploy)
Decisão: quando um envio falha porque o número não tem WhatsApp (ou casos parecidos — ver abaixo), o contato é **marcado com a tag "Sem WhatsApp"** em vez de apagado do sistema. Isso permite excluir esses contatos de campanhas futuras (o assistente de criação de broadcast no painel já suporta excluir por tag — Step 2, "audience") sem perder o cadastro.

Como funciona (arquivo `src/app/api/whatsapp/webhook/route.ts`):
- A Meta reporta entrega malsucedida de forma assíncrona (webhook de status, código de erro **131026 "Message Undeliverable"**). Esse código é um "balaio" — cobre número sem WhatsApp, número que bloqueou a empresa, conta sem aceitar os novos Termos da Meta, ou app do WhatsApp desatualizado no aparelho do cliente. Tratamos todos igual: não vale a pena reenviar automaticamente pra nenhum desses casos.
- Quando isso acontece, o contato recebe a tag "Sem WhatsApp" (criada automaticamente na primeira vez que precisar, por conta).
- **A tag é removida automaticamente** assim que o contato manda qualquer mensagem pra Sunne Sul — a mensagem já prova que ele tem WhatsApp de novo.
- **Não existe reenvio automático** pra quem está com essa tag — decisão deliberada, pra não repetir o mesmo padrão de risco de bloqueio (mandar pra quem já falhou antes, sem confirmação de que a situação mudou). Se um dia quiserem tentar de novo com esses contatos, é uma decisão manual (tirar a tag ou não usá-la como filtro de exclusão numa campanha).

**Correção (04/08/2026):** ao contrário do que estava anotado aqui, o código já estava commitado e sincronizado com `origin/main` — confirmado via `git commit`/`git push` (nada a enviar). A anotação de "pendente" estava desatualizada. A funcionalidade já está no repositório; falta só confirmar se o deploy em produção reflete essa versão (checar EasyPanel).

### Bug de conteúdo corrigido: automação "Marketing - Triagem baixa tensão" não pedia email (04/08/2026)
Um cliente do teste de 22 contatos clicou "Baixa Tensão (casa)" e recebeu a mensagem automática sem pedido de email (só pedia a foto da conta de luz) — diferente do Flow de triagem normal, que já tinha sido corrigido antes pra pedir os dois. Causa: a automação de botão (`automation_steps.id = 131c4905-4d64-4d69-950d-b45eaf67b216`, automação "Marketing - Triagem baixa tensão") ficou com uma cópia de texto mais antiga, nunca sincronizada com a correção do Flow. **Corrigido direto no banco em 04/08/2026** — texto agora pede foto/PDF da conta **e** o email, igual ao Flow. Não precisa de deploy (é conteúdo, não código).

## 8.3 Auditoria do WhatsApp Manager e Business Manager (04/08/2026)

Auditoria feita a pedido do usuário, navegando direto em business.facebook.com (WhatsApp Manager + Central de Segurança do Business Manager). **Nenhuma ação foi tomada** — tudo abaixo é só levantamento, pendente de decisão do usuário sobre o que fazer.

### Qualidade e limites — está tudo bem, sem ação necessária
- Qualidade do número `+55 41 8775-7984`: **Alta** (verde). O teste de broadcast de 20 contatos (seção 8.2) não prejudicou a qualidade.
- Limite atual: 19 de 250 conversas iniciadas pela empresa este mês; 1 de 2 números de telefone cadastrados.
- Dois caminhos pra aumentar o limite (250 → 2.000+): (1) **Verificação da empresa** — já em andamento no lado da Meta, só aguardar notificação, nada a fazer aqui; (2) **Melhorar qualidade das mensagens** — métrica exibida "22 conversas iniciadas / 30 dias" (isso é só o progresso atual desse critério alternativo, não é um alerta de problema).
- "Conta comercial oficial" (selo azul): botão de solicitação aparece desabilitado — provavelmente porque depende da verificação da empresa terminar primeiro.

### Perfil do número (aba Perfil) — pendências opcionais, precisam de aprovação pra eu submeter
- Email e Site (2 campos) já preenchidos — ver correção na seção 8 acima.
- **Descrição** e **Endereço** continuam vazios. Baixo risco, mas é uma mudança de conta — preciso do texto que o usuário quer usar antes de preencher.
- Facebook/Instagram não conectados ao perfil (opcional).

### WABAs órfãs no Business Manager (portfólio "Rendaextraskill")
Existem 3 WABAs no total:
1. **Assessor de Energia|Sunne Sul** (ID `2504146196723505`) — a em uso, com o número real.
2. **Sunne Sul Assessor de Energia** (ID `1748496489727941`) — sem nenhum telefone vinculado. Confirma a pendência já registrada na seção 12 (um dos dois IDs órfãos citados ali).
3. **Test WhatsApp Business Account** (ID `2031215254158524`) — parece ser uma conta de testes intencional, não necessariamente "órfã"; não mexer sem confirmação.

O outro ID órfão que já estava anotado na seção 12 (`1688746219127408`) **não apareceu** na lista atual de WABAs do portfólio — pode já ter sido removido antes, ou pertencer a outro portfólio. Não confirmado.

### Central de Segurança do Business Manager (fora do WhatsApp Manager, mas mesmo portfólio) — "Action needed"
1. **1 conta de anúncios sem segurança por aprovação de semelhantes** — risco: anúncios não autorizados podem ser publicados sem revisão. Recomendação da Meta: verificar níveis de proteção e adicionar usuários confiáveis às contas de anúncios.
2. **1 usuário com domínio de email público** (ex: gmail/hotmail) cadastrado no portfólio — risco: domínios públicos são mais visados por sequestro de conta. Recomendação da Meta: remover esse usuário do portfólio.
   - Também mostrado como já resolvido/ok: pelo menos 1 domínio confiável na aprovação de semelhantes, e acesso "controle total" limitado a 10 usuários ou menos.
3. Autenticação de dois fatores: painel mostra "Quem precisa ativar" = "Ninguém" (configuração atual, não exigindo 2FA de ninguém no portfólio).
4. Administrador secundário: já há pelo menos um outro admin no portfólio (ok, já resolvido).

### Painel de Alertas (dentro do WhatsApp Manager, tela Visão geral)
1. **"Agenda de contatos ativada"** — informativo, ativado automaticamente pela Meta como parte da transição pra nomes de usuário. Sem ação necessária.
2. **"Comece a receber insights sobre o modelo de mensagem"** — opt-in gratuito pra métricas por template (entrega, engajamento). Baixo risco, útil pra avaliar performance de templates de campanha. Sugestão: ativar.
3. **"Deseja instruir a Meta a ativar eventos automáticos..."** — permite que a Meta monitore marcos das conversas e mande atualizações automáticas; aplica a todas as contas WhatsApp do negócio; reversível a qualquer momento nas configurações. É mudança de configuração de conta, precisa de aprovação explícita antes de eu clicar em "Ativar".
4. **"Até 9% de mensagens de marketing a mais via API de Mensagens de Marketing"** — promove migrar da Cloud API (que usamos hoje) pra uma API separada, otimizada pra picos de entrega de mensagens de marketing. Não é um clique simples — exigiria mudança de integração no código do wacrm (endpoint/fluxo diferentes). Fica como item de pesquisa separado, não uma ação imediata.

### Resolução dos dois riscos da Central de Segurança (04/08/2026)
- **Risco "conta de anúncios sem aprovação de semelhantes" (DragaoSupp):** investigado e **confirmado 100% resolvido de fato**. ID exato encontrado via inspeção do código da página: `793173567874318` (nome "DragaoSupp", dono "Rendaextraskill" na visão da Central de Segurança, mas conta pessoal do usuário). Status real na Meta: **"Conta de anúncios encerrada" — não pode ser usada pra veicular anúncios**, saldo $0,00, nenhuma forma de pagamento cadastrada, nenhum anúncio jamais criado nela. Não tinha nenhum aprovador elegível pra selecionar no fluxo da Central de Segurança (Meta não permite escolher usuários inativos há 90+ dias como aprovadores), mas isso é irrelevante — uma conta encerrada não pode veicular anúncio nenhum, autorizado ou não. **Nenhuma ação adicional necessária**; o alerta pode continuar aparecendo na tela por ser cosmético (a Meta não reconhece "encerrada" como mitigação válida pra esse alerta específico).
  - Nota: as outras 2 contas de anúncios pessoais do usuário (`649637912125330` — ativa mas com as 2 únicas campanhas já "Desativado" e R$0,00 gastos; `158700034203711` — também encerrada desde 2019) foram checadas por engano antes de achar o ID certo da DragaoSupp; ambas confirmadas sem problema/sem gasto ativo.
- **Risco "usuário com domínio de email público":** identificado como `camarguinhocap2@gmail.com` (Josmair Franco De Camargo Filho) — conta pessoal antiga do próprio usuário, confirmada por ele como sem uso no Business Manager. **Removida do portfólio Rendaextraskill em 04/08/2026** (autorizado explicitamente pelo usuário). A remoção foi processada em segundo plano pela Meta ("Tarefa em andamento") — confirmar na próxima visita à Central de Segurança que o alerta sumiu.

### Resumo — o que ainda precisa de decisão do usuário
- [ ] Preencher Descrição/Endereço do perfil do número (dar o texto desejado)
- [ ] Conectar Facebook/Instagram ao perfil do número (sim/não)
- [ ] Apagar a WABA órfã `1748496489727941` ou deixar como está (sim/não)
- [ ] Ativar "insights de template" (recomendado)
- [ ] Ativar "eventos automáticos" da Meta (opcional)
- [ ] Investigar/decidir sobre a migração pra API de Mensagens de Marketing (pesquisa futura)
- [x] ~~Desativar/resolver risco da conta de anúncios DragaoSupp~~ — confirmado que já está encerrada pela Meta, nenhuma ação necessária (04/08/2026)
- [x] ~~Central de Segurança: remover usuário com domínio de email público~~ — feito 04/08/2026

---

## 9. Notificações via Telegram

Cada atendente pode receber um aviso no Telegram sempre que chega uma mensagem nova no WhatsApp (útil pra não depender de ficar olhando o wacrm o tempo todo).

### Como funciona
1. Existe um bot no Telegram: **`@sunnesul_avisos_bot`**, com o token configurado no wacrm (variável de ambiente).
2. Cada atendente precisa: abrir uma conversa com o bot no Telegram, mandar qualquer mensagem, e então alguém com acesso ao Supabase pega o `chat_id` gerado (via API `getUpdates` do bot) e salva no perfil dele.
3. O `chat_id` fica salvo na coluna `telegram_chat_id` da tabela `profiles` (migration dedicada) e também deveria aparecer/ser editável em **Configurações → Seu perfil**, campo "Telegram Chat ID".
4. Quando chega mensagem nova no webhook do WhatsApp, o wacrm dispara um envio pro Telegram do(s) atendente(s) com `telegram_chat_id` preenchido.

### Status
- **Funciona em produção** — confirmado em 03/08/2026 (teste real recebido no Telegram do camarguinhocap@gmail.com, `chat_id 7340357750`).
- **Falta:** pegar o `chat_id` do segundo atendente (jrcorretorjr@gmail.com) — ele precisa mandar mensagem pro bot `@sunnesul_avisos_bot` primeiro.
- **Bug cosmético em aberto:** ver seção 11 abaixo — o campo na tela de Configurações não mostra o valor salvo, mesmo a notificação funcionando.

---

## 10. AI Agents — assistente de IA (bring-your-own-key)

Local no wacrm: **AI Agents** (menu lateral), abas Playground / Setup / Usage.

### O que é
Módulo de IA embutido no wacrm: você conecta sua própria chave de API (não é uma feature paga do wacrm) e ela passa a alimentar dois recursos:
1. **Rascunho de resposta ("Draft with AI")** — botão na Inbox, o atendente humano revisa e envia.
2. **Auto-resposta** — o bot responde sozinho mensagens novas que não caem em nenhum Flow e não têm atendente atribuído, até um limite configurável (`Max auto-replies per conversation`), passando pra fila humana quando não sabe responder ou atinge o limite.

Tem também uma "Embeddings key" opcional (chave da OpenAI, mesmo que o provedor de chat seja outro) que liga busca semântica na base de conhecimento — sem ela, a busca é só por palavra-chave.

### Provedores suportados
- **OpenAI**
- **Anthropic (Claude)**
- **Groq** — adicionado em 03/08/2026. A API da Groq é compatível com o formato da OpenAI (mesmo request/response, só muda a URL base e a chave), então foi uma adição pequena e de baixo risco: `src/lib/ai/providers/groq.ts` reaproveita a mesma lógica do adapter OpenAI (`generateOpenAiCompatible` em `shared.ts`) apontando para `https://api.groq.com/openai/v1/chat/completions`. Chave da Groq tem prefixo `gsk_...`. Modelo padrão sugerido: `llama-3.3-70b-versatile` (conferir catálogo atual em console.groq.com/docs/models — o campo de modelo é texto livre, não trava numa lista).
- **Vale ter em mente escolhendo o provedor:** Groq é bom pra respostas rápidas/baratas (hardware próprio, latência baixa); OpenAI/Anthropic tendem a ter modelos mais "espertos" pra contexto de negócio complexo. Pra WhatsApp de atendimento (respostas curtas), Groq costuma ser suficiente e mais barato.
- **Migration:** `038_ai_groq_provider.sql` — já aplicada no Supabase, alarga o `CHECK` de `provider` nas tabelas `ai_configs` e `ai_usage_log` pra aceitar `'groq'` além de `'openai'`/`'anthropic'`.
- **Pendente:** commit + push + deploy dessas mudanças de código (ver seção 12).

### Recomendação de configuração pra Sunne Sul
No campo "Business context & instructions", ser explícito sobre o que a IA **não pode** prometer — percentual de desconto, prazo de contrato, valores — e mandar isso pra um humano (fila `__queue__`). Sugestão: testar primeiro no **Playground** com "Auto-reply" desligado (só rascunho) antes de ligar resposta automática de verdade.

---

## 11. Bug corrigido — campo "Telegram Chat ID" aparecia vazio em Configurações → Seu perfil

**Resolvido** (commit `d7f73bb`: "fix: profile fetch estava sem telegram_chat_id no select, campo sempre aparecia vazio"). O diagnóstico abaixo foi mantido como registro histórico do problema.

### Sintoma
Em **Configurações → Seu perfil**, o campo "Telegram Chat ID" aparece **vazio**, mesmo o valor estando salvo corretamente no banco (`profiles.telegram_chat_id = "7340357750"` para camarguinhocap@gmail.com, confirmado via SQL direto no Supabase).

### O que já foi descartado como causa
- **Não é problema de dado.** Confirmado via SQL no Supabase que o valor está lá e corretamente vinculado (`profiles.user_id` = `auth.users.id`).
- **Não é bug no componente do formulário.** `src/components/settings/profile-form.tsx` já lê e salva `profile.telegram_chat_id` corretamente (`.eq('user_id', user.id)`, coluna certa).
- **Não é bug de código-fonte.** `src/hooks/use-auth.tsx` (branch `main` no GitHub) já faz o `select` incluindo `telegram_chat_id` e já monta o objeto `profile` com esse campo.
- **Não é cache do navegador.** Testado com query param cache-busting + hard reload, campo continuou vazio.

### Hipótese principal (não confirmada)
O **bundle JS publicado em produção está desatualizado** em relação ao código-fonte atual — a requisição real ao Supabase feita pelo site em produção (inspecionada via DevTools/Network) **não inclui `telegram_chat_id`** no `select=`, o que só acontece se o JS rodando ainda for de uma versão anterior ao fix. Isso é estranho porque o container no EasyPanel aparecia como "criado há poucos minutos" (deploy recente) — essa contradição não foi resolvida.

Outra pista secundária, não crítica: a interface TypeScript `Profile` em `use-auth.tsx` não declara o campo `telegram_chat_id` (o código funciona em runtime porque `next.config.ts` tem `typescript: { ignoreBuildErrors: true }`), mas isso não explica sozinho o bundle desatualizado.

### O que foi tentado para confirmar a hipótese (e travou)
Tentativa de entrar via **Console do servidor no EasyPanel** (Servidor → Console — shell root real na VPS) e rodar, dentro do container do app:
```
grep -rl telegram_chat_id /app/.next/static
cat /app/.next/BUILD_ID
```
para ver se o texto `telegram_chat_id` está mesmo presente no JS publicado.

**Isso não foi possível de terminar.** O console web do EasyPanel (baseado em xterm.js) está **engolindo espaços entre palavras** ao digitar comandos, provavelmente por causa da carga/lentidão da própria VPS (1 OCPU, RAM baixa — ver seção 2). Tentativas feitas sem sucesso:
- Digitar palavra por palavra intercalando `space` + espera (1-4s) — ainda perdeu espaços.
- Codificar o comando em base64 e tentar `echo <base64> | base64 -d | bash` para evitar espaços no comando sensível — o próprio comando de decodificação também perdeu espaços (`base64-d` colado).
- Copiar via clipboard (`navigator.clipboard` e `document.execCommand('copy')`) para colar de uma vez só — bloqueado pela página (sem permissão de clipboard).

### Próximos passos sugeridos (para quando isso for retomado)
1. Tentar o diagnóstico via **SSH direto** (cliente de terminal de verdade, não o console web do EasyPanel) — deve evitar o bug de espaços perdidos.
2. Se confirmar que o bundle está desatualizado: forçar um **rebuild sem cache** no EasyPanel (limpar cache do builder Docker) e reimplantar.
3. Se o rebuild limpo não resolver: verificar se há alguma camada de cache (CDN/proxy do EasyPanel) servindo JS antigo mesmo com container novo — checar cabeçalhos `Cache-Control` da resposta do JS bundle (não confundir com o `Cache-Control` das rotas de API/páginas, que já foi checado e está ok em `next.config.ts`).
4. Depois de corrigido: também declarar `telegram_chat_id` na interface `Profile` em `use-auth.tsx` (ajuste de tipagem, cosmético, não bloqueia nada).

---

## 11.1 Ativar/desativar acesso de um membro da conta (14/08/2026)

Local no wacrm: **Configurações → Membros da conta** (aba Members), botão/switch de status ao lado de cada membro.

Feature nova: permite bloquear o acesso de um atendente/membro **sem excluir a conta dele** (mantém histórico, mensagens, negócios associados — só impede login/uso enquanto desativado). Implementação (commits 14/08/2026):
- Coluna `is_active` passou a ser checada em `getCurrentAccount()` e na validação de sessão (`864930f`) — um membro desativado é barrado mesmo com sessão válida.
- `is_active` incluído no select do perfil e no endpoint de listagem de membros (`8fb6355`).
- Switch de ativar/desativar adicionado na tela de Membros (`25b770e`), campo `is_active` adicionado ao tipo `Profile` do `useAuth` (`b1cc770`), textos em pt/en/ko (`29ffaab`, `96816de`, `88d8a21`).

**Bug encontrado e corrigido no mesmo dia:** o switch clicava e parecia funcionar, mas `PATCH /api/account/members/[userId]` **nunca tratava o campo `is_active`** no corpo da requisição — ou seja, o toggle não fazia nada de verdade no banco até esse fix (`6d7fec8`).

**Ajuste relacionado:** membro desativado não deve mais gerar notificação no Telegram de mensagens novas (evita alertar quem não pode mais acessar o CRM).

---

## 12. Pendências gerais

**Broadcast:**
- [x] ~~Commit + push + deploy da tag automática "Sem WhatsApp"~~ — já estava sincronizado com `origin/main` (confirmado 04/08/2026 via `git commit`/`git push`, "nothing to commit"). Falta só confirmar que o deploy em produção está na versão certa. Ver seção 8.2.

**AI Agents:**
- [ ] Commit + push + deploy do suporte a Groq como provedor de IA (código pronto localmente em 03/08/2026: migration `038_ai_groq_provider.sql` já aplicada no Supabase; arquivos alterados: `src/lib/ai/types.ts`, `src/lib/ai/providers/shared.ts`, `src/lib/ai/providers/openai.ts`, `src/lib/ai/providers/groq.ts` (novo), `src/lib/ai/generate.ts`, `src/lib/ai/defaults.ts`, `src/lib/ai/config.ts`, `src/app/api/ai/config/route.ts`, `src/app/api/ai/test/route.ts`, `src/components/settings/ai-config.tsx`, `messages/en.json`). Não foi possível rodar a suíte de testes localmente (ambiente Linux do sandbox não roda o `node_modules` instalado pra Windows — erro de binding nativo do rolldown/vitest); revisão foi manual, sem testes automatizados confirmando.
- [ ] Depois do deploy: testar o provedor Groq de ponta a ponta no Playground com uma chave real (`gsk_...`) antes de habilitar em produção.

**Telegram:**
- [x] ~~Obter o `chat_id` do segundo atendente~~ — Jr Mulbauer mandou "oi" pro bot em 03/08/2026 e o `chat_id` foi capturado via `getUpdates` da API do Telegram: **`8761001933`**
- [ ] Salvar `8761001933` no perfil do Jr. **Não precisa esperar o bug da seção 10 ser corrigido** — o bug é só na exibição/leitura do campo (fetch), o salvamento (`profile-form.tsx` → `.update(...).eq('user_id', ...)`) funciona normalmente. Caminho mais simples: o próprio Jr entra em Configurações → Seu perfil e cola `8761001933` no campo Telegram Chat ID e salva. Alternativa: salvar direto via SQL no Supabase (MCP do Supabase estava desconectado no momento desse registro).

**Já resolvidas (mantido aqui só como histórico — confirmado em 03/08/2026 via `git log`/`git status`, branch `main` sem pendência de push):**
- [x] ~~Apagar `.git\index.lock`~~ — lock não existe mais
- [x] ~~Push das 3 correções pendentes (Sample values nos Templates, botões de template, Flow x automação de botão)~~ — tudo commitado e sincronizado com `origin/main`

**Outras pendências:**
- [ ] Apagar/limpar templates de teste que não serão usados de verdade (`teste_marketing_var1/var2/simples`, `oferta_energia_sunne` — todos já podem ser apagados, aprovação não bloqueia mais)
- [ ] Configurar domínio próprio e SSL (item #9 da lista de infraestrutura)
- [ ] Decidir sobre o Catálogo de produtos (desvincular de outro lugar ou criar novo)
- [ ] Preencher o campo "Site" no Perfil da empresa no WhatsApp Manager
- [ ] Duas WABAs antigas/órfãs no Business Manager sem uso (`1688746219127408`, `1748496489727941`) — só mexer se for necessário limpar
- [ ] **Bug encontrado 17/08/2026:** no assistente de Transmissão (Transmissões → Nova Transmissão → Público), a opção "Enviar CSV" existe na tela mas não tem nenhum campo real de upload — `src/components/broadcasts/step2-select-audience.tsx` guarda `audience.csvContacts` mas nunca renderiza o input de arquivo, então o botão "Avançar" nunca libera nesse modo. Workaround usado: marcar os contatos com uma tag e usar "Filtrar por Tags" no lugar. Precisa implementar o upload de verdade ou remover a opção quebrada da tela.

---

## 13. Onde encontrar cada coisa no wacrm

| O que | Onde |
|---|---|
| Templates de mensagem | Configurações → Templates |
| Respostas rápidas | Configurações → Quick Replies |
| Automações | Configurações → Automações |
| Importar contatos | Contatos → Importar |
| Mandar primeira mensagem para um contato | Dentro do contato, na tela de conversa (Inbox) |
| Fluxos de triagem/menu | Flows (BETA) |
| Telegram Chat ID (aviso de mensagem nova) | Configurações → Seu perfil (corrigido, ver seção 11) |
| Assistente de IA (rascunho/auto-resposta) | AI Agents (menu lateral) |
| Ativar/desativar acesso de um membro | Configurações → Membros da conta (ver seção 11.1) |

---

## 14. Bug corrigido: "Failed to send template: HTTP 502" + templates sem imagem no preview (15/08/2026)

Dois bugs distintos, corrigidos no mesmo dia.

### Bug 1 — erros da Meta apareciam como "502" genérico
Causa: o **proxy reverso do EasyPanel descarta o corpo de respostas HTTP 502**, escondendo o motivo real do erro que a Meta retornava (ex.: "template does not exist in pt_BR"). A aplicação repassava o código de status da Meta (que às vezes é 502) direto pro navegador, e o proxy comia a mensagem no caminho — sobrava só "Failed to send template: HTTP 502" sem detalhe nenhum. Corrigido trocando o código de resposta para **422** (não passa pelo mesmo filtro do proxy) em três pontos, um por vez conforme foram descobertos:
- `templates/submit` (envio de template pra aprovação) — commit `0d965f6`, 13/08/2026
- `templates/[id]` (editar/apagar template) — commit `c7e4d7f`, 14/08/2026
- Envio de mensagem/template pro cliente — commit `2127b54`, 15/08/2026

### Bug 2 — templates com imagem apareciam "sem imagem" ao selecionar
O modal de enviar template (tanto no Inbox quanto na ficha do contato) só renderizava o texto do corpo/rodapé no preview — nunca mostrava a imagem/vídeo/documento do cabeçalho, mesmo quando o template tinha `header_media_url` configurado. Por isso, ao escolher um template com imagem pra enviar, parecia que a imagem tinha sumido (mas o envio em si funcionava normalmente). Corrigido adicionando a renderização de mídia no preview do modal — commit `6077046`, 15/08/2026.

---

## 14.1 Contatos "Cliente OP" (479 contatos antigos) e campanha de reconexão

Em 01/08/2026 foi importado um lote de **479 contatos** com nome no padrão "Cliente OP `<número>`" (ex.: "Cliente OP 54") — pessoas que já tinham conversado com o número de WhatsApp da empresa antes dele virar conta oficial (Business API), mas nunca tiveram o contato salvo com nome de verdade. Numeração tem duas lacunas conhecidas (OP 01, OP 02 e OP 43 não existem — provavelmente removidos como duplicados no import original).

**Estratégia adotada:** reconectar em lotes pequenos (10 contatos por vez) usando o template de Marketing `oferta_desconto_luz`, checando a qualidade da conta no WhatsApp Manager da Meta (classificação de qualidade do número, status do template, limite de conversas iniciadas) **antes de cada lote**, e analisando entrega/leitura/resposta/falha do lote anterior antes de liberar o próximo. Como a tela de Transmissão não tem upload de CSV funcional (bug documentado na seção 12), cada lote é feito criando uma tag temporária ("Teste OP loteN") via SQL direto no Supabase e usando "Filtrar por Tags" no assistente de Transmissão.

**Progresso até 20/08/2026** (73 de 479 contatos, OP 03 a OP 73):

| Lote | Contatos | Data | Entregue+ | Lida | Respondida | Falhou |
|---|---|---|---|---|---|---|
| 1 | OP 03-12 | 17/08 | 8 | 4 | 1 | 1 |
| 2 | OP 13-22 + pessoal | 17/08 | 11 | 11 | 2 | 0 |
| 3 | OP 23-32 | 18/08 | 10 | 7 | 2 | 0 |
| 4 | OP 33-42 | 18/08 | 9 | 8 | 1 | 1 |
| 5 | OP 44-53 | 19/08 | 10 | 6 | 2 | 0 |
| 6 | OP 54-63 | 19/08 | 10 | 9 | 0 | 0 |
| 7 | OP 64-73 | 20/08 | 5 | 1 | 0 | 4 |

O lote 7 teve 4 falhas, mas só o OP 73 tem a tag automática "Sem WhatsApp" (código de erro 131026 da Meta, ou seja, esse contato realmente não tem WhatsApp nesse número). Os outros 3 (OP 69, 70, 72) falharam por outro motivo que não dava pra descobrir por causa do bug corrigido na seção 5.1 (motivo do erro não era salvo) — depois do deploy desse fix, falhas futuras já vêm com o motivo real registrado.

**Restam 406 contatos** (a maioria da faixa OP 74 em diante) para continuar a campanha em lotes futuros.
