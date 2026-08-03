# Manual do wacrm — Sunne Sul Assessor de Energia

Registro de tudo que foi configurado e feito no CRM de WhatsApp (wacrm) para a Sunne Sul. Use como referência caso precise mexer em algo de novo ou repassar para outra pessoa.

Última atualização: 01/08/2026

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
`Números de telefone → clique no número → aba "Perfil"`. Lá tem: Categoria, Descrição, Endereço, Email e até **2 campos de Site**. Hoje estão vazios — pode preencher direto ali, não precisa mexer no wacrm.

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

## 9. Pendências gerais

- [ ] Apagar `D:\CRM\wacrm\.git\index.lock` (arquivo de lock travado) antes de usar git de novo
- [ ] Push das 3 correções pendentes: "Sample values" nos Templates (commit local `dfa7121`), botões de template não disparando automação e Flow disparando junto com automação de botão (últimas duas no mesmo `webhook/route.ts`, ainda não commitadas)
- [ ] Apagar/limpar templates de teste que não serão usados de verdade (`teste_marketing_var1/var2/simples`, `oferta_energia_sunne` — todos já podem ser apagados, aprovação não bloqueia mais)
- [ ] Configurar domínio próprio e SSL (item #9 da lista de infraestrutura)
- [ ] Decidir sobre o Catálogo de produtos (desvincular de outro lugar ou criar novo)
- [ ] Preencher o campo "Site" no Perfil da empresa no WhatsApp Manager
- [ ] Duas WABAs antigas/órfãs no Business Manager sem uso (`1688746219127408`, `1748496489727941`) — só mexer se for necessário limpar

---

## 10. Onde encontrar cada coisa no wacrm

| O que | Onde |
|---|---|
| Templates de mensagem | Configurações → Templates |
| Respostas rápidas | Configurações → Quick Replies |
| Automações | Configurações → Automações |
| Importar contatos | Contatos → Importar |
| Mandar primeira mensagem para um contato | Dentro do contato, na tela de conversa (Inbox) |
| Fluxos de triagem/menu | Flows (BETA) |
