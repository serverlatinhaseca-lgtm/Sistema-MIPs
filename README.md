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

- As avaliações são vinculadas aos usuários já cadastrados; setor e cargo são preenchidos na aba Usuários.
- Cada usuário recebe um modelo de avaliação por função: Embalagem, Forneiro, Líderes, Motorista, Padeiro ou Auxiliar de Padeiro.
- Os modelos iniciais reproduzem as perguntas das planilhas de 2026 fornecidas.
- O Administrador gerencia perguntas separadamente em cada modelo, sem alterar avaliações antigas.
- Cada Editor vê e avalia somente os Leitores vinculados a ele; o Administrador vê todos, inclusive líderes.
- Administrador e Editor aplicam e podem excluir avaliações.
- Cada funcionário acessa o próprio histórico em **Meu desempenho**.
- O sistema lembra mensalmente quem ainda não foi avaliado.
- Cada avaliação recebe um link exclusivo para o funcionário.
- O link mostra o relatório, o gráfico histórico e oferece impressão em A4.

## Edição e histórico

- Administradores e editores podem editar MIPs e receitas.
- Antes de cada alteração, a versão anterior é guardada automaticamente.
- O histórico fica visível apenas para Administrador e Editor.
- Na calculadora de receitas, os pesos são sempre inteiros: decimais de 0,1 a 0,4 arredondam para baixo e de 0,5 a 0,9 para cima.

> Esta versão altera o vínculo das avaliações para os usuários. Em ambiente de testes, recrie o banco com `docker compose down -v` antes de subir a nova versão.

## Testes

```bash
cd backend
npm test
```
