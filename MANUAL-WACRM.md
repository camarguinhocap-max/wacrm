# Manual do wacrm — Sunne Sul Assessor de Energia

Registro de tudo que foi configurado e feito no CRM de WhatsApp (wacrm) para a Sunne Sul. Use como referência caso precise mexer em algo de novo ou repassar para outra pessoa.

Última atualização: 03/08/2026

> ⚠️ **Prioridade atual (03/08/2026):** há um bug em aberto (campo "Telegram Chat ID" some em Configurações → Seu perfil) que está sendo investigado. Por decisão do usuário, **outras atualizações/deploys ficam em standby até esse problema ser resolvido**. Ver seção 11 para o diagnóstico completo e o que falta fazer.

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

**Pendente:** essa mudança está só no código local — falta commit + push + deploy (ver pendências, seção 12).

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

## 11. Problema em aberto — campo "Telegram Chat ID" aparece vazio em Configurações → Seu perfil

**Prioridade atual do projeto.** Outras atualizações/deploys estão em standby até isso ser resolvido (decisão do usuário em 03/08/2026).

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

## 12. Pendências gerais

**🔴 Prioridade máxima (em standby até resolver):**
- [ ] Descobrir por que o campo "Telegram Chat ID" aparece vazio em Configurações → Seu perfil, mesmo salvo no banco — ver diagnóstico completo e próximos passos na seção 11. Outras tarefas abaixo ficam pausadas até isso ser resolvido.

**Broadcast:**
- [ ] Commit + push + deploy da tag automática "Sem WhatsApp" (código pronto em 04/08/2026, sem migration necessária — só usa as tabelas `tags`/`contact_tags` que já existiam). Arquivo alterado: `src/app/api/whatsapp/webhook/route.ts`. Ver seção 8.2 para detalhes.

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
| Telegram Chat ID (aviso de mensagem nova) | Configurações → Seu perfil (bug em aberto, seção 11) |
| Assistente de IA (rascunho/auto-resposta) | AI Agents (menu lateral) |
