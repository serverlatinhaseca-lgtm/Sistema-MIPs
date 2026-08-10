# Portal MIPs · Nova Esperança

Portal operacional com MIPs, receitas, usuários e avaliações mensais de colaboradores.

## Configuração inicial

Crie o arquivo de ambiente antes de subir os contêineres:

```bash
cp .env.example .env
```

Em instalações existentes, mantenha no `.env` o mesmo usuário, senha e nome do banco já utilizados. Substitua `JWT_SECRET` por uma chave aleatória forte. `ADMIN_INITIAL_PASSWORD` só é utilizada quando a conta `admin` ainda não existe; a senha atual não é redefinida a cada reinicialização.

## Executar

```bash
docker compose up -d --build
```

- Portal: `http://SERVIDOR:7070`
- API: `http://SERVIDOR:7001`

As novas tabelas são criadas automaticamente pelo backend sem apagar os dados existentes.

## Avaliações

- Administrador e Editor cadastram colaboradores e aplicam avaliações.
- O sistema lembra mensalmente quem ainda não foi avaliado.
- Cada avaliação recebe um link exclusivo para o funcionário.
- O link mostra o relatório, o gráfico histórico e oferece impressão em A4.

## Testes

```bash
cd backend
npm test
```
