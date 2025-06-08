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
the backend listens on port `3009`. You can change this by setting the
`BACKEND_PORT` environment variable when running `docker-compose`. The value is
used for both the Node.js server and the Nginx proxy configuration. The front-end itself is served on
`http://localhost:8080`.

### Running with Prebuilt Images

After Docker images are published to GitHub Container Registry you can run the stack with:

```bash
docker-compose -f docker-compose.deploy.yml up -d
```

Replace `OWNER` in `docker-compose.deploy.yml` with your GitHub username or organisation.

### Running Backend Tests

To execute the API test suite, run:

```bash
cd backend && npm test
```

### API Endpoints

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/:id`
- `PUT /api/people/:id`
- `DELETE /api/people/:id`
- `GET /api/export/json`

This is an early version and subject to change.
