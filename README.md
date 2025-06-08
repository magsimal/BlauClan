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

The API will be available through the front-end container under `/api`. By default
the backend container exposes port `3000`, but you can map this to any host port
in `docker-compose.yml` (e.g. `3009:3000`). The front-end itself is served on
`http://localhost:8080`.

### Running with Prebuilt Images

After Docker images are published to GitHub Container Registry you can run the stack with:

```bash
docker-compose -f docker-compose.deploy.yml up -d
```

Replace `OWNER` in `docker-compose.deploy.yml` with your GitHub username or organisation.

### API Endpoints

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/:id`
- `PUT /api/people/:id`
- `DELETE /api/people/:id`
- `GET /api/export/json`

This is an early version and subject to change.
