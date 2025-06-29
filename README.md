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
variable. When using Docker Compose for deployment edit
`docker-compose.deploy.yml` and set this value under the backend
service. If you launch the containers with Portainer make sure the
backend service receives this variable. Newly created GeoNames
accounts can take up to half an hour before they start returning
results, so suggestions may initially appear empty. Set
`VALIDATOR_STRICT=true` if you also want to reject unknown places on
form submission.

You can also tweak how tightly related nodes are drawn together by setting
`RELATIVE_ATTRACTION` (0 = loose layout, 1 = very compact). It defaults to `0.5`.
The bulk delete button is hidden by default. Set `SHOW_DELETE_ALL_BUTTON=true`
if you want to display it in the toolbar.
Authentication can be toggled with `LOGIN_ENABLED`. Set it to `true` to enable
the login dialog and LDAP authentication. The default is `false`.
If `LDAP_ADMIN_FILTER` is set, users matching that filter are treated as admins
and can perform bulk delete operations.

To integrate with an external SSO proxy such as Authelia, set
`USE_PROXY_AUTH=true` and list the proxy IPs in `TRUSTED_PROXY_IPS`

(comma-separated). For example:
`TRUSTED_PROXY_IPS=192.168.0.1,127.0.0.1,localhost`. When a request from a trusted IP includes the
`Remote-User` header (or `X-Remote-User` for backward compatibility), the
backend automatically creates a session for that user. You can also forward
`Remote-Groups` and `Remote-Email` to pass group and email information. A
minimal Nginx configuration with Authelia looks like:

```nginx
location / {
  include /config/nginx/proxy.conf;
  include /config/nginx/authelia-server.conf;
  proxy_set_header Remote-User $remote_user;
  proxy_set_header Remote-Groups $remote_groups;
  proxy_set_header Remote-Email $remote_email;
  proxy_pass http://blauclan:PORT;
}
```

Set `PROXY_ADMIN_GROUP` and `PROXY_USER_GROUP` if your SSO solution uses
different group names than the defaults of `familytree_admin` and
`familytree_user`.

### Running with Prebuilt Images

After Docker images are published to GitHub Container Registry you can run the stack with:

```bash
IMAGE_TAG=latest docker-compose -f docker-compose.deploy.yml up -d
```

Set `IMAGE_TAG=experimental` to pull the development images instead of the
stable ones.

Replace `OWNER` in `docker-compose.deploy.yml` with your GitHub username or organisation.
Ensure `docker-compose.deploy.yml` defines `GEONAMES_USER` so the backend can access GeoNames.

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

### LDAP Configuration

The backend can optionally authenticate users against an external LDAP server
such as [LLDAP](https://github.com/lldap/lldap). To enable this, define the
following environment variables (shown here with example values):

```bash
LDAP_URL=ldap://ldap:389
LDAP_BIND_DN=uid=admin,ou=people,dc=example,dc=org
LDAP_BIND_PASSWORD=secret
LDAP_SEARCH_BASE=ou=people,dc=example,dc=org
LDAP_SEARCH_FILTER=(user_id={{username}})
# Optional filter to mark admin accounts
LDAP_ADMIN_FILTER=(memberOf=cn=admins,ou=groups,dc=example,dc=org)
# Optional override if your directory stores the login name under a different attribute
LDAP_USER_ATTRIBUTE=user_id
```

By default the backend expects the LDAP username attribute to be `user_id`.
If your directory uses a different field (such as `uid`), set `LDAP_USER_ATTRIBUTE`
to that attribute name and adjust `LDAP_SEARCH_FILTER` accordingly.

`LDAP_URL` must include the protocol and port. If you run an LLDAP container on
the default LDAP port `389`, the value would be `ldap://lldap:389` (or the
appropriate IP address) so the backend can reach it.

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
