# Sistema de Reservas de Laboratórios UNI-CET

Aplicação institucional para reservas de laboratórios, construída com Next.js, TypeScript, Prisma e PostgreSQL. Os registros de laboratórios, usuários, agenda e reservas são persistidos no PostgreSQL.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL 14 ou superior

## Instalação local

1. Crie um banco PostgreSQL chamado `lab_reservas`.
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `SESSION_SECRET` (segredo aleatório com pelo menos 32 caracteres), `ADMIN_EMAIL` e `ADMIN_INITIAL_PASSWORD` (mínimo de 12 caracteres).
3. Instale dependências com `npm install`.
4. Gere o cliente e aplique o schema: `npx prisma generate` e `npx prisma db push`.
5. Aplique a constraint de sobreposição no PostgreSQL: `npm run db:constraints` (requer permissão para habilitar `btree_gist`).
6. Crie o administrador e os seis laboratórios de partida: `npm run db:seed`.
7. Inicie a aplicação: `npm run dev`, depois acesse http://localhost:3001. A aplicação web usa 3001 porque, neste computador, a porta 3000 será usada pelo PostgreSQL.

O primeiro login administrativo é feito com o email e senha configurados no ambiente; por segurança, altere a senha inicial em seguida. No cadastro de usuários, o administrador pode escolher o perfil de professor ou administrador e definir uma senha inicial ou deixar o campo vazio para usar `123456`. Senhas de usuários podem ter qualquer conteúdo, com mínimo de 4 caracteres, são armazenadas somente como hash e exigem troca no primeiro acesso. A primeira conta administrativa, criada inicialmente com `carlos.aragao@unicet.edu.br`, é protegida contra desativação e pode atualizar o próprio e-mail no perfil.

## Banco e produção

O schema está em `prisma/schema.prisma`. `db:push` sincroniza o schema, e `db:constraints` aplica a constraint GiST contra reservas sobrepostas, também durante pedidos concorrentes. Em produção, versione o schema com Prisma Migrate e aplique a constraint SQL como parte da implantação; habilite a extensão PostgreSQL `btree_gist` se o provedor não permitir que a aplicação a crie. Configure HTTPS para habilitar cookies `Secure`.

## Segurança e funcionamento

- Sessões assinadas e cookies `HttpOnly`, `SameSite=Lax`; autenticação consulta conta ativa no banco.
- Senhas armazenadas via bcrypt com fator 12; papéis e permissões conferidos nas operações de servidor.
- Validação Zod no login de reserva; horários derivados da configuração persistida, duração fixa por grade, intervalos bloqueados e checagem de conflito no servidor e no banco.
- Cada reserva transaciona persistência e trilha de auditoria. Professores podem consultar a agenda institucional completa, mas só editar ou cancelar as próprias reservas; administradores podem editar as reservas de professores e consultar o conjunto.
- Reservas permanecem na agenda institucional até uma hora após o horário final; depois aparecem na aba Reservas passadas. O histórico é uma visualização dos mesmos registros persistidos, sem exclusão de dados.
- Configuração do administrador inicial por variáveis de ambiente, sem segredo versionado.

## Escopo

Estão incluídos login por email/CPF, troca obrigatória de senha, gestão administrativa de professores e administradores, painel com dados reais, criação e cancelamento de reservas, agenda, cadastro de laboratórios, configuração de horários, relatórios básicos e auditoria. Contas excluídas são retiradas da lista de usuários, com dados de acesso removidos e registros de reservas/auditoria preservados. O envio de email, exportação Excel/PDF/CSV e rate limiting distribuído podem ser acrescentados numa próxima etapa; não há serviços externos ou dados demonstrativos de reservas embutidos.
