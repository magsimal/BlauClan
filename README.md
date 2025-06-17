# Tree of Life

A simple genealogy web application. This MVP provides a basic REST API and a minimal front-end powered by Vue.js. The UI styling is based on the [Vue Argon Design System](https://www.creative-tim.com/product/vue-argon-design-system?affiliate_id=116187).
All UI components should use elements from the Vue Argon Design System to maintain a consistent look across the app.


## Development

The project is split into two folders:

- `backend/` – Express API using Sequelize
- `frontend/` – Vue client served via Nginx with a Vue Flow canvas for the family tree

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

For place of birth suggestions to work you must provide a valid
GeoNames username. Sign up for a free account at
<https://www.geonames.org/> and set the `GEONAMES_USER` environment
variable. When using Docker Compose this variable can be added to a
`.env` file in the project root or passed directly on the command
line. If you launch the containers with Portainer make sure the
backend service receives this variable. Newly created GeoNames
accounts can take up to half an hour before they start returning
results, so suggestions may initially appear empty. Set
`VALIDATOR_STRICT=true` if you also want to reject unknown places on
form submission.

You can also tweak how tightly related nodes are drawn together by setting
`RELATIVE_ATTRACTION` (0 = loose layout, 1 = very compact). It defaults to `0.5`.
The bulk delete button is hidden by default. Set `SHOW_DELETE_ALL_BUTTON=true`
if you want to display it in the toolbar.

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

### Loading Sample Data

For quick testing of the frontend you can populate the database with a small set
of example records:

```bash
cd backend && npm run seed
```

This will insert a couple of people and a marriage so that the UI has something
to display.

### API Endpoints

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/:id`
- `PUT /api/people/:id`
- `DELETE /api/people/:id`
- `GET /api/people/:id/spouses`
- `POST /api/people/:id/spouses`
- `DELETE /api/people/:id/spouses/:marriageId`
- `GET /api/tree/:id` – query param `type` can be `ancestors`, `descendants`, or `both`
- `GET /api/export/json`
- `GET /api/export/db`
- `POST /api/import/db`

This is an early version and subject to change.

### Keyboard Shortcuts

- **Enter**: When editing a person, press Enter to save changes and close the modal.
