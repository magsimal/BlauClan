# Overview

We want to create a Family Tree web application using Node.js (Express) for the backend, Vue.js for the frontend, and PostgreSQL as our database. The core objectives include:
	1.	Multiple Spouses: Each person can have multiple spouse relationships, with children allocated per relationship.
	2.	Filtering by Bloodline: For any person, show only ancestors, descendants, or both.
	3.	Visualization Templates:
	•	Modern: Cards with avatars (blue/pink border for gender), minimal but visually appealing.
	•	Classic: A black-and-white, text-focused layout (no avatars, minimal styling).
	4.	Immediate Autosave: Automatically persist form changes without requiring a manual save button.
	5.	Export:
	•	Data as JSON (full or filtered view)
	•	Rendered Tree as image/PDF (client-side capture)
	6.	No Authentication: Single-user, local usage scenario.
	7.	Docker & CI/CD:
	•	Multi-container docker-compose setup (backend, frontend, PostgreSQL)
	•	GitHub Actions for continuous integration and delivery
	8.	No GEDCOM / FamilySearch: Compatibility with external genealogy tools is not required.

⸻

# Detailed Requirements

1. Backend
	•	Language/Framework: Node.js (Express)
	•	Database: PostgreSQL (via Sequelize, Knex, or a similar ORM/Query Builder)
	•	Data Model:
	•	Must support multiple spouses per person
	•	Optional fields: dateOfBirth, dateOfDeath, placeOfBirth, dateOfMarriage (per spouse relationship), etc.
	•	Immediate autosave triggers a PUT/POST request on every field change
	•	CRUD Endpoints:
	•	Create, read, update, delete people (and relationships)
	•	Filter endpoints for retrieving ancestors, descendants, or both

2. Frontend
	•	Framework: Vue.js
	•	Visualization: D3.js for rendering the family tree
	•	Templates:
	•	Modern: Card-based design with avatars (placeholder or user-supplied), color-coded by gender
	•	Classic: Minimal black-and-white layout with text-based boxes
	•	Features:
	•	Toggle between Modern and Classic views
	•	Search/filter for a person, then show only their ancestors/descendants
	•	Autosave on each field change (immediate calls to the backend)
	•	Export the current tree view as PNG/JPEG/PDF (client-side, e.g., via html2canvas and jspdf)

3. Visualization
	•	D3.js:
	•	Build a tree diagram that can handle multiple spouses and children
	•	Zoom/pan for large trees
	•	Filtering:
	•	Show only ancestors, descendants, or both from a selected person

4. Export Features
	•	JSON:
	•	Entire or filtered tree data
	•	Download via a simple button in the UI
	•	Image/PDF:
	•	Capture the currently displayed tree (Modern or Classic) as an image or PDF file
	•	Use client-side libraries (no server-side rendering needed)

5. Dockerization
	•	Multi-Container:
	•	Container 1: Backend (Node.js + Express)
	•	Container 2: Frontend (Vue.js), possibly served via an Nginx container or Node-based static server
	•	Container 3: PostgreSQL database
	•	docker-compose:
	•	Configuration to spin up all containers together
	•	Examples:

docker-compose build
docker-compose up


	•	Containers exposed on appropriate ports (e.g., 3000 for backend, 8080 for frontend)

6. GitHub Actions
	•	Automated CI to:
	1.	Check out the repository
	2.	Install dependencies (backend & frontend)
	3.	Run tests (unit + integration)
	4.	Build Docker images for each service (backend, frontend)
	5.	(Optional) Push images to Docker registry

7. Development Steps
	1.	Project Structure
	•	backend/ (Node.js + Express code)
	•	frontend/ (Vue.js code)
	•	Possibly a shared/ folder for common models or types
	2.	Design Data Model
	•	Person entity with array of spouse relationships, each containing optional dateOfMarriage and a child array
	•	Manage references via unique IDs
	3.	Build CRUD Endpoints
	•	POST /api/people, GET /api/people, GET /api/people/:id, PUT /api/people/:id, DELETE /api/people/:id
	•	Add endpoints for partial or filtered tree retrieval
	4.	Frontend Implementation
	•	Modern view with color-coded cards + avatars
	•	Classic view with minimal, text-only boxes
	•	Toggle switch between these two views
	•	Immediate autosave on each field change
	5.	Export
	•	JSON export endpoint or client side
	•	Image/PDF export with html2canvas + jspdf
	6.	Docker
	•	Dockerfile in both backend/ and frontend/
	•	docker-compose.yml to define backend, frontend, and a PostgreSQL service
	7.	CI/CD
	•	A GitHub Actions workflow that builds, tests, and optionally deploys to a container registry

⸻

# Acceptance Criteria
	•	Multiple Spouse Relationships per Person
	•	Two Tree Layouts: Modern (avatars, color-coded) and Classic (text-only)
	•	Filtering: Ancestors, Descendants, or Both
	•	Immediate Autosave: No manual save button needed
	•	Export:
	•	JSON (full or filtered data)
	•	Image/PDF of the current tree view
	•	Docker: Spin up separate containers for frontend, backend, and PostgreSQL
	•	CI/CD: GitHub Actions pipeline that passes all build/test stages with no errors
	•	Local Single-User: No authentication or multi-user support

⸻

Use these final requirements to implement the Family Tree application from scratch. Adhere to best practices in coding style, performance, and maintainability while ensuring a user-friendly experience on both desktop and mobile browsers.
