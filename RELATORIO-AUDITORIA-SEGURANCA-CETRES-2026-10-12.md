# CETRes — relatório de auditoria de segurança

**Data:** 12/10/2026  
**Escopo:** revisão estática do código e configuração, mais consultas somente de leitura aos metadados do PostgreSQL.  
**Resultado:** foram encontrados riscos que precisam ser tratados antes de expor o sistema à rede institucional ou à Internet. Nenhum código, dado, tabela, política ou configuração da aplicação foi alterado.

## Resumo executivo

Os controles de autorização do servidor estão, em geral, bem distribuídos: páginas e ações administrativas chamam `requireAdmin()`, e as operações de reserva verificam o usuário responsável no servidor. As consultas usam Prisma; a revisão não encontrou SQL dinâmico, renderização HTML bruta, `eval`, upload de arquivos ou redirecionamento externo construído por entrada do usuário. As constraints de sobreposição de horário estão presentes no banco.

Os riscos prioritários são:

1. **A aplicação conecta ao PostgreSQL com o superusuário `postgres`.** Em caso de comprometimento do processo web, o invasor poderia ler, alterar ou apagar todo o banco e administrar usuários e bancos.
2. **O cadastro permite a senha compartilhada conhecida `123456` e aceita senhas de quatro caracteres.** A troca obrigatória ajuda, mas quem entrar primeiro com a senha padrão pode escolher uma senha nova, inclusive em uma conta administrativa.
3. **Sessões não são invalidadas no servidor ao sair ou trocar/redefinir a senha.** O cookie é apagado somente no navegador; um token já copiado pode continuar válido por até sete dias. A ação de troca de senha usa `currentUser()` sem exigir que a conta esteja ativa.
4. **Não foi encontrado limite de tentativas no login.** Isso facilita tentativas automatizadas, sobretudo contra contas com senha curta ou padrão.
5. **A configuração de produção não define cabeçalhos de segurança, e HTTPS/proxy não pôde ser verificado.**

### Achados consolidados

| ID | Gravidade | Achado | Verificação |
|---|---|---|---|
| CETRES-01 | Alta | Conta de aplicação usa superusuário PostgreSQL | Confirmado por configuração sanitizada e consulta ao banco |
| CETRES-02 | Alta | Senha padrão conhecida e mínimo de quatro caracteres | Confirmado no código; exploração não executada |
| CETRES-03 | Alta | Sessões antigas não são revogadas ao logout/troca de senha | Confirmado no código; teste de token não executado |
| CETRES-04 | Média | Login sem rate limit e diferença temporal para conta inexistente | Confirmado por revisão estática; teste de carga não executado |
| CETRES-05 | Média | Cabeçalhos de segurança não definidos no projeto | Confirmado no Next config; cabeçalhos de proxy não verificados |
| CETRES-06 | Média condicional | PostgreSQL escuta em todas as interfaces, sem TLS na conexão observada | Confirmado; HBA atual restringe conexões remotas |
| CETRES-07 | Média | CPF persistido sem proteção em nível de aplicação | Confirmado no schema; criptografia de disco/backup não verificada |
| CETRES-08 | Baixa | Auditoria não é transacional em algumas operações | Confirmado no código |
| CETRES-09 | Baixa | Proteção do administrador principal depende da ordem de criação | Confirmado no código; impacto depende de migração/importação |

## Inventário examinado

- **Frontend e servidor:** Next.js App Router, React, TypeScript, Server Components e Server Actions.
- **Persistência:** PostgreSQL via Prisma.
- **Autenticação:** senha verificada com bcrypt; JWT HS256 assinado com `SESSION_SECRET`; cookie `HttpOnly`, `SameSite=Lax`, caminho `/`, expiração de sete dias e `Secure` quando `NODE_ENV=production`.
- **Papéis:** `ADMIN`, `PROFESSOR`, `COORDENADOR` e `GESTOR` no enum; telas de gestão permitem criar `ADMIN` e `PROFESSOR`. As operações privilegiadas exigem explicitamente `ADMIN`.
- **Rotas públicas:** `/`, `/login` e `/alterar-senha` (a última exige sessão para executar a ação de mudança).
- **Rotas autenticadas:** visão geral, nova reserva, reserva de equipamento, reservas da instituição, calendário e edição de reservas.
- **Rotas administrativas:** equipe, laboratórios, cursos, equipamentos, horários, relatórios, auditoria, reservas passadas e `GET /api/admin/relatorios/export`.
- **Ações sensíveis:** login/logout, troca de senha, CRUD de usuários/recursos, configuração de horários, exportação de relatórios, criação/edição/cancelamento de reservas.
- **Banco observado:** `lab_reservas`, porta `3000`, papel efetivo `postgres` com `rolsuper=true`, `listen_addresses=*`. As regras `pg_hba` observadas usam SCRAM e só permitem TCP em `127.0.0.1` e `::1`; a conexão inspecionada não usou SSL. RLS está desativado nas nove tabelas públicas. As duas constraints de exclusão contra sobreposição existem.
- **Segredos:** `.env` local não foi exibido. A inspeção só confirmou que há URL do banco configurada, senha configurada e `SESSION_SECRET` de 64 caracteres. `.gitignore` inclui `.env`; não foi possível confirmar histórico/tracking Git, pois esta cópia do projeto não contém diretório `.git`.
- **Dependências instaladas:** Next.js `15.5.26`, React/React DOM `19.3.0`, Prisma `6.19.3`, `jose` `6.2.12`, `bcryptjs` `3.0.3` e Zod `3.25.76`. `npm audit --omit=dev` não conseguiu consultar `registry.npmjs.org` por falha de DNS, portanto a auditoria de advisories transitive não foi concluída.

## Achados detalhados

### CETRES-01 — Processo web conecta como superusuário PostgreSQL

1. **Descrição:** a URL local do banco usa a conta `postgres`, confirmada como superusuário e com permissão para criar bancos e papéis.
2. **Gravidade:** Alta. Uma falha de execução no servidor web dá ao invasor privilégios equivalentes ao administrador do banco.
3. **Status:** Confirmado por consulta somente de leitura.
4. **Componentes:** `.env` (credencial não reproduzida), `src/lib/db.ts:1`, PostgreSQL `lab_reservas`.
5. **Evidência:** `current_user=postgres`; `rolsuper=true`; `rolcreatedb=true`; `rolcreaterole=true`. Não há RLS habilitado; um superusuário também contorna RLS.
6. **Cenário controlado:** se uma vulnerabilidade no processo Next.js permitir executar consultas arbitrárias, o processo poderá modificar/apagar qualquer tabela, criar papéis ou bancos. Nenhum payload ou alteração foi executado.
7. **Condição/perfil:** acesso ao processo web ou a uma falha que permita executar operações com a conexão do Prisma.
8. **Impacto:** exposição e alteração de dados pessoais, reservas, contas e configurações; destruição ou tomada do banco.
9. **Causa raiz:** uso da conta administrativa do PostgreSQL como identidade da aplicação.
10. **Correção recomendada:** criar papel exclusivo da aplicação, sem `SUPERUSER`, `CREATEDB` ou `CREATEROLE`, concedendo apenas `CONNECT`, `USAGE` e operações necessárias nas tabelas. Manter migrações e administração com credencial separada. Restringir o `.env` e backups.
11. **Componentes futuros:** credenciais/role no PostgreSQL e `DATABASE_URL` de produção.
12. **Testes de correção:** confirmar `rolsuper=false`, `rolcreatedb=false`, `rolcreaterole=false`; verificar CRUD previsto e rejeição de `DROP`, `CREATE ROLE` e acesso fora do schema.
13. **Riscos/efeitos:** migrations, seed e extensão `btree_gist` podem precisar de credencial administrativa separada; o papel runtime não deve receber privilégios para instalar extensões.

### CETRES-02 — Senha inicial compartilhada e mínimo curto

1. **Descrição:** cadastro de usuário substitui senha vazia pela constante `123456`, aceita senha com quatro caracteres e marca a conta para troca obrigatória.
2. **Gravidade:** Alta, especialmente para contas administrativas ou serviço exposto à rede. A senha padrão é pública e reutilizada; a troca obrigatória só ocorre depois de autenticar.
3. **Status:** Confirmado por revisão estática; não foi criado usuário de teste.
4. **Componentes:** `src/app/actions.ts:70`, `src/app/actions.ts:5`, `src/lib/auth.ts:5-6`, `src/app/alterar-senha/page.tsx`.
5. **Evidência:** `passwordInput || '123456'`; validação `password.length<4`; criação com `mustChangePassword:true`; a tela de troca aceita quatro caracteres.
6. **Cenário controlado:** alguém que conheça o identificador de uma conta criada sem senha pode tentar a senha padrão antes do primeiro acesso legítimo; após entrar, escolhe uma senha e assume a conta.
7. **Condição/perfil:** endpoint de login acessível e identificador conhecido (e-mail/CPF); maior impacto se a conta for administradora.
8. **Impacto:** tomada de conta e, para uma conta ADMIN, controle de usuários, recursos, relatórios e reservas.
9. **Causa raiz:** segredo temporário previsível e mínimo de senha baixo, solicitado como requisito funcional.
10. **Correção recomendada:** substituir senha padrão comum por senha aleatória única e temporária ou fluxo de ativação seguro; limitar validade e uso único. Para administradores, exigir senha forte e MFA. Se o mínimo de quatro caracteres for mantido por decisão institucional, rate limiting e bloqueio de senhas comuns são controles compensatórios, mas não tornam `123456` seguro.
11. **Componentes futuros:** cadastro/reset de usuários, política de senha e login.
12. **Testes de correção:** verificar que nenhuma conta recebe credencial igual compartilhada; confirmar expiração/uso único e troca segura; tentar senha comum e senha fora da política.
13. **Riscos/efeitos:** trocar o padrão atual exige plano para contas já criadas com senha temporária e suporte de primeiro acesso.

### CETRES-03 — Tokens de sessão não são revogados no logout ou troca de senha

1. **Descrição:** a sessão é JWT stateless válido por sete dias e contém somente `sub`. Logout apaga o cookie do navegador, mas não invalida tokens já copiados; troca/reset de senha não muda uma versão de sessão nem revoga tokens ativos.
2. **Gravidade:** Alta para conta comprometida ou credencial administrativa redefinida.
3. **Status:** Confirmado por revisão estática; nenhum token foi copiado ou testado.
4. **Componentes:** `src/lib/auth.ts:2-5`; `src/app/actions.ts:4-5,71`.
5. **Evidência:** `issueSession` define expiração de `7d`; `currentUser` valida JWT e busca o usuário, sem `jti`/versão de sessão; `logout` apenas remove cookie; `changePassword` usa `currentUser()` em vez de `requireUser()` e não exige conta ativa; reset administrativo atualiza hash sem invalidar sessões.
6. **Cenário controlado:** token obtido antes de logout ou reset continua sendo aceito. Após reset administrativo, o token antigo pode chegar à ação `changePassword`, que não verifica `active` nem exige a senha atual.
7. **Condição/perfil:** posse de token de sessão válido, por roubo de dispositivo, malware, extensão ou exposição acidental.
8. **Impacto:** manutenção de acesso por até sete dias e potencial reversão de reset de senha por sessão antiga.
9. **Causa raiz:** autenticação stateless sem mecanismo de revogação, associada a uma ação de troca que aceita qualquer sessão ainda assinada.
10. **Correção recomendada:** manter sessões revogáveis (tabela/session version ou `jti` com estado), invalidar todas ao logout, troca/reset de senha e desativação; exigir conta ativa em todas as ações; exigir reautenticação ou token de reset de uso único conforme o fluxo.
11. **Componentes futuros:** emissão/validação de sessão, logout, troca e redefinição de senha.
12. **Testes de correção:** guardar sessão de teste, executar logout/reset/desativação e confirmar que a sessão antiga recebe rejeição; confirmar que não consegue trocar senha.
13. **Riscos/efeitos:** sessões existentes precisarão expirar/reautenticar quando o mecanismo for introduzido; operações de reset devem ter registro de auditoria atômico.

### CETRES-04 — Login sem limitação de tentativas e diferença temporal de enumeração

1. **Descrição:** não há rate limiting, atraso progressivo ou limite por conta/IP encontrado. O fluxo só executa `bcrypt.compare` quando o usuário existe, produzindo custo temporal diferente para usuário inexistente.
2. **Gravidade:** Média; eleva o risco de descoberta de contas e tentativa automatizada de senhas.
3. **Status:** Confirmado por revisão estática; não foi feito teste de volume contra o login.
4. **Componentes:** `src/app/actions.ts:3` e formulário em `src/app/login/page.tsx`.
5. **Evidência:** login consulta usuário ativo e retorna erro genérico, mas a comparação bcrypt é condicional; não existe middleware/serviço de rate limit identificado no inventário.
6. **Cenário controlado:** várias tentativas de senha contra e-mails/CPFs conhecidos; comparar respostas para identificadores existentes e inexistentes.
7. **Condição/perfil:** endpoint acessível pela rede.
8. **Impacto:** força bruta/spray e enumeração auxiliar de contas; combinado com senha padrão/curta aumenta chance de takeover.
9. **Causa raiz:** ausência de limitação compartilhada e de comparação de tempo uniforme.
10. **Correção recomendada:** rate limit distribuído por IP e identificador, atraso progressivo e monitoramento; executar comparação com hash fictício quando a conta não existir; manter mensagens uniformes e evitar bloqueio permanente fácil de abusar.
11. **Componentes futuros:** ação de login e proxy/infra de produção.
12. **Testes de correção:** sequências controladas de tentativas devem ser limitadas; tempos de resposta não devem distinguir conta existente; confirmar que NAT institucional não causa bloqueio coletivo indevido.
13. **Riscos/efeitos:** limites excessivos podem bloquear usuários legítimos; usar janela, recuperação administrativa e limites por múltiplas dimensões.

### CETRES-05 — Cabeçalhos defensivos e HTTPS de produção não comprovados

1. **Descrição:** `next.config.ts` está vazio e o projeto não configura CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`/proteção contra framing ou `Referrer-Policy`.
2. **Gravidade:** Média em produção; impacto depende do proxy, HTTPS e cabeçalhos adicionados fora do repositório.
3. **Status:** Ausência confirmada no projeto; ambiente/proxy público não estava disponível para inspeção.
4. **Componentes:** `next.config.ts:1-2`, configuração do proxy/VM não fornecida.
5. **Evidência:** `const config: NextConfig = {}`; não há configuração de headers no projeto. O cookie passa a `Secure` apenas quando `NODE_ENV=production`.
6. **Cenário controlado:** em uma publicação sem proxy com cabeçalhos, páginas autenticadas poderiam ser enquadradas por outro site; a falta de CSP reduz defesa em profundidade caso apareça XSS futuro.
7. **Condição/perfil:** aplicação publicada sem cabeçalhos equivalentes na camada frontal.
8. **Impacto:** clickjacking e menor contenção de ataques de navegador; ausência de HSTS pode permitir downgrade se HTTPS estiver mal configurado.
9. **Causa raiz:** responsabilidade de hardening HTTP/HTTPS não está expressa no projeto nem confirmada na infraestrutura.
10. **Correção recomendada:** publicar exclusivamente por HTTPS e configurar cabeçalhos no reverse proxy ou Next.js: CSP ajustada ao app, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, política de permissões e HSTS após validar HTTPS.
11. **Componentes futuros:** proxy reverso/VM e `next.config.ts`.
12. **Testes de correção:** verificar cabeçalhos em todas as respostas, HTTPS sem conteúdo misto, cookie `Secure` e compatibilidade da CSP com fontes/estilos reais.
13. **Riscos/efeitos:** CSP estrita pode bloquear estilos/recursos existentes; HSTS mal configurado pode tornar o domínio inacessível via HTTP.

### CETRES-06 — PostgreSQL escuta em todas as interfaces; conexão sem TLS observada

1. **Descrição:** `listen_addresses=*`; a sessão observada não usa SSL. As regras atuais de `pg_hba` permitem somente loopback (`127.0.0.1` e `::1`) com SCRAM, portanto **não foi confirmada aceitação de conexão remota**.
2. **Gravidade:** Média condicional. O risco aumenta se regras/firewall forem ampliados para ligar aplicação e banco em máquinas diferentes.
3. **Status:** Configuração confirmada por consulta; firewall da máquina/VM não inspecionado.
4. **Componentes:** `postgresql.conf`, `pg_hba.conf`, firewall e `DATABASE_URL` (arquivos do PostgreSQL fora do projeto).
5. **Evidência:** `listen_addresses=*`; somente regras host para `127.0.0.1` e `::1`; `auth_method=scram-sha-256`; `pg_stat_ssl.ssl=false` na conexão observada.
6. **Cenário controlado:** se uma regra `pg_hba` for ampliada ou o firewall abrir a porta, o serviço já está escutando interfaces não loopback; em rede, a conexão sem TLS não protege os dados contra observação no caminho.
7. **Condição/perfil:** acesso à rede e alteração/abertura de regra; não confirmado na configuração atual.
8. **Impacto:** tentativa de acesso ao banco, exposição de credenciais/dados em rede e aumento de impacto do uso de superusuário (CETRES-01).
9. **Causa raiz:** listener global para uma instalação cuja necessidade de acesso remoto não foi estabelecida.
10. **Correção recomendada:** se app e banco ficarem na mesma VM, escutar só em loopback; se separados, usar interface/rede privada, `pg_hba` com IPs exatos, firewall restritivo e TLS verificado. Não publicar a porta PostgreSQL na Internet.
11. **Componentes futuros:** configuração do PostgreSQL, firewall e conexão de produção.
12. **Testes de correção:** verificar `listen_addresses`, `pg_hba`, TLS e conectar somente do host permitido; testar rejeição fora da rede autorizada.
13. **Riscos/efeitos:** restringir a interface sem coordenar o host da aplicação pode interromper o serviço.

### CETRES-07 — CPF armazenado sem criptografia em nível de aplicação

1. **Descrição:** CPF é guardado como texto (`String?`) com índice único; não há criptografia de campo ou mascaramento no modelo.
2. **Gravidade:** Média por envolver identificador pessoal. Criptografia de volume/backup pode existir, mas não foi verificável.
3. **Status:** Ausência de criptografia na camada do aplicativo confirmada; criptografia de disco, backup e volume não verificada.
4. **Componentes:** `prisma/schema.prisma:24-42`, banco, exportações/backups e equipe de administração.
5. **Evidência:** campo `cpf String? @unique`; o filtro de equipe exibe CPF completo a administradores. Não foram lidos CPFs reais.
6. **Cenário controlado:** leitura indevida de dump, arquivo de backup ou credencial de banco expõe identificadores em formato legível.
7. **Condição/perfil:** acesso não autorizado ao banco, backup ou exportação.
8. **Impacto:** exposição de dado pessoal e risco de fraude/uso indevido.
9. **Causa raiz:** proteção depende integralmente de controle de acesso ao PostgreSQL e aos backups.
10. **Correção recomendada:** restringir fortemente DB/backup e acesso à equipe; avaliar criptografia em repouso para VM/volume e backups. Se houver criptografia de campo, desenhar busca/normalização/índice com chave fora do banco e mascarar CPF em listas que não precisam exibi-lo integralmente.
11. **Componentes futuros:** armazenamento, backup, interface de equipe e gestão de chaves.
12. **Testes de correção:** comprovar criptografia em repouso; verificar mascaramento e acesso por perfil; testar restauração e busca sem expor o dado.
13. **Riscos/efeitos:** criptografia de campo muda busca por CPF e exige processo seguro de rotação/backup de chaves.

### CETRES-08 — Algumas alterações podem não gerar log de auditoria

1. **Descrição:** em algumas operações, a gravação principal ocorre antes da inserção do log, sem uma transação única.
2. **Gravidade:** Baixa; afeta rastreabilidade e investigação, não permite por si só executar uma ação sem autorização.
3. **Status:** Confirmado por revisão estática.
4. **Componentes:** `src/app/actions.ts:68,70,73`; `src/app/course-actions.ts:21-29`.
5. **Evidência:** criação de usuário/laboratório/curso ou alteração de status e criação do log são chamadas separadas em alguns caminhos; outras ações, como atualização de usuário, já usam transação.
6. **Cenário controlado:** falha do banco ou encerramento entre a mutação e o `auditLog.create` deixa alteração realizada sem evento correspondente.
7. **Condição/perfil:** falha operacional no momento da escrita ou erro de persistência de log.
8. **Impacto:** trilha de auditoria incompleta e dificuldade de atribuir mudanças.
9. **Causa raiz:** ausência de atomicidade uniforme entre ação e respectivo evento de auditoria.
10. **Correção recomendada:** persistir mutação e log na mesma transação; proteger retenção e acesso aos logs.
11. **Componentes futuros:** ações administrativas e serviço de auditoria.
12. **Testes de correção:** provocar falha controlada no log e confirmar rollback da mutação; confirmar que cada alteração gera exatamente um evento.
13. **Riscos/efeitos:** transações longas podem aumentar contenção; registrar apenas dados necessários e nunca incluir senha ou token.

### CETRES-09 — Identidade do administrador principal é inferida pela data de criação

1. **Descrição:** a conta protegida é calculada como o administrador não excluído mais antigo, em vez de uma marca imutável de principal.
2. **Gravidade:** Baixa; o comportamento atual protege uma conta, mas pode proteger outra após importação/restauração com datas alteradas.
3. **Status:** Confirmado por revisão estática; não foi simulada migração.
4. **Componentes:** `src/lib/auth.ts:7`, `src/app/actions.ts:71-73`.
5. **Evidência:** `getPrimaryAdminId()` ordena por `createdAt` e `id` e escolhe o primeiro ADMIN não excluído.
6. **Cenário controlado:** importação/restauração com `createdAt` diferente pode fazer outro administrador se tornar a conta protegida.
7. **Condição/perfil:** operação administrativa de migração/importação ou alteração direta dos dados.
8. **Impacto:** proteção de exclusão pode deixar de corresponder ao administrador institucional pretendido.
9. **Causa raiz:** propriedade de segurança derivada de ordenação de dados mutáveis.
10. **Correção recomendada:** manter identificador explícito e imutável da conta principal, com constraint e fluxo controlado de migração.
11. **Componentes futuros:** schema, seed e funções de proteção da conta.
12. **Testes de correção:** restaurar/importar usuários em ordem diferente e confirmar que a mesma conta continua protegida.
13. **Riscos/efeitos:** migração precisa escolher e validar a identidade protegida sem bloquear o acesso administrativo.

## Controles observados como presentes

- `requireUser()` bloqueia contas inativas nas rotas protegidas; `requireAdmin()` valida o papel no servidor.
- Ações de gestão de laboratórios, usuários, cursos, equipamentos, horários e exportação requerem administrador no servidor.
- Ações de edição de reserva verificam proprietário/estado; professores só editam as próprias reservas e administradores não podem editar a reserva de outro administrador.
- Login apresenta erro genérico; senhas usam bcrypt com fator 12.
- Sessão usa assinatura JWT e cookie `HttpOnly`, `SameSite=Lax`; em `NODE_ENV=production`, o cookie tem `Secure`.
- Prisma constrói as consultas sem concatenação SQL identificada. O único SQL encontrado são constraints estáticas de banco.
- React renderiza conteúdo como texto; a busca não encontrou `dangerouslySetInnerHTML`, `eval`, `new Function`, execução de comandos ou chamadas `fetch` na aplicação.
- A planilha escreve texto como `inlineStr` com escape XML; não foi encontrado uso de fórmulas para conteúdo vindo de reservas.
- A constraint de exclusão GiST para conflitos de laboratório e equipamento está ativa no banco.

## Componentes e verificações não concluídos

- **Auditoria transitive de dependências:** inconclusiva. `npm audit --omit=dev` falhou porque `registry.npmjs.org` não resolveu por DNS. A versão instalada do Next (`15.5.26`) está acima dos patches publicados que conferi: `15.2.6` para CVE-2025-66478, `15.2.8` para os problemas de RSC de dezembro de 2025, `15.5.21` para SSRF em rewrites e `15.5.24` para os advisories críticos de agosto de 2026. Isso não substitui um `npm audit` funcional. Fontes oficiais: [CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478), [Next.js Security Update de 11/12/2025](https://nextjs.org/blog/security-update-2025-12-11), [Windows RCE GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [AVIF RCE GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [SSRF GHSA-p9j2-gv94-2wf4](https://github.com/vercel/next.js/security/advisories/GHSA-p9j2-gv94-2wf4).
- **Teste HTTP dinâmico:** nenhum endereço de staging/produção foi fornecido; não foram enviados payloads a servidor, tentativas de força bruta, exploração de XSS/SQLi/SSRF, testes de autorização por requisições diretas ou teste de carga.
- **Infraestrutura fora da VM:** firewall, NAT, reverse proxy, HTTPS/certificados, cabeçalhos efetivamente servidos, backups, criptografia de volume, acesso ao host/AnyDesk e monitoração não foram inspecionados.
- **Políticas PostgreSQL:** não há RLS nas tabelas. A aplicação parece depender do controle de acesso no servidor Next.js; o banco não foi configurado para usuários finais conectarem diretamente.
- **Histórico Git e segredos versionados:** não foi possível auditar o histórico porque esta cópia não contém `.git`. Nenhum segredo foi reproduzido.

## Prioridade recomendada

1. Antes de qualquer exposição em rede, substituir a conta `postgres` por papel runtime de privilégio mínimo e confirmar as regras de firewall/listener.
2. Remover o padrão compartilhado `123456` para novas contas e estabelecer ativação/reset seguro; proteger contas ADMIN com MFA e senha forte.
3. Implementar revogação de sessões em logout, troca/reset de senha e desativação; corrigir `changePassword` para exigir conta ativa.
4. Colocar rate limiting e detecção de abuso no login.
5. Confirmar HTTPS, proxy e cabeçalhos de segurança na VM de produção.
6. Completar `npm audit` em ambiente com acesso ao registro npm; manter Next.js/React atualizados e repetir a revisão após upgrade.
7. Formalizar proteção de CPF, atomicidade dos logs e identidade imutável do administrador principal.

## Plano de correção sugerido (não executado)

1. Fazer backup testado do PostgreSQL e inventariar acessos/VMs.
2. Criar papel de aplicação de privilégio mínimo; manter papel de migração separado; atualizar segredo de conexão em ambiente seguro.
3. Migrar senha inicial para segredo único temporário/ativação segura; adotar MFA para administradores.
4. Criar mecanismo revogável de sessão e testes para logout, reset e desativação.
5. Aplicar limites de login no proxy/aplicação e alertas de tentativa.
6. Configurar HTTPS, headers e restrição de rede no Proxmox/VM/Firewall/PostgreSQL.
7. Proteger dados pessoais e backups, tornar logs atômicos e fixar a conta principal por identificador imutável.
8. Rodar auditoria de dependências, revisão de configuração e testes de autorização em staging; revisar esta lista antes da publicação.

**Encerramento:** auditoria documental concluída dentro do escopo permitido. Nenhuma correção foi implementada.
