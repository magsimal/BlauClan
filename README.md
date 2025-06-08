# BlauClan

A simple genealogy web application. This MVP provides a basic REST API and a minimal front-end powered by Vue.js.

## Development

The project is split into two folders:

- `backend/` – Express API using Sequelize
- `frontend/` – Vue client served via Nginx

### Prerequisites

- Node.js 18+
- Docker

### Running with Docker

```bash
docker-compose up --build
```

The API will be available on `http://localhost:3000` and the front-end on `http://localhost:8080`.

### API Endpoints

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/:id`
- `PUT /api/people/:id`
- `DELETE /api/people/:id`
- `GET /api/export/json`

This is an early version and subject to change.
