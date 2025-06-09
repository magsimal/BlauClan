1. Product Overview

Goal
Create a fully featured Family Tree application that allows users to add, edit, and visualize complex family relationships. Key highlights include:
	1.	Multiple visualization templates:
	•	Modern View: Card-style with color-coded avatar and highlighted gender indicators.
	•	Classic View: A minimal, black-and-white style with only text-based information.
	2.	Support for multiple spouses (with children tied to specific spouse relationships).
	3.	Filter by bloodline (ancestors, descendants, or both).
	4.	Export in multiple formats (JSON for data, PNG/JPEG/PDF for visual tree, and potentially GEDCOM).
	5.	Modern reactive UI with autosave.
	6.	Docker-based deployment with GitHub Actions for CI/CD.
        7.      Styling follows the Vue Argon Design System.

⸻

2. Key Features & Requirements

2.1 Family Tree Management
	1.	Add/Edit/Delete Family Members
	•	Basic fields: Name, Gender, Date of Birth (DoB), etc.
	•	Additional fields: Maiden Name, Date of Death (DoD), Place of Birth (PoB), Notes.
	•	Multiple Spouse Support: Each person can have multiple spouse relationships, each with its own children list and an optional dateOfMarriage.
	2.	Filtering by Bloodline
	•	User selects a person and chooses whether to see:
	•	Ancestors only
	•	Descendants only
	•	Both directions
	3.	Autosave
	•	Whenever changes are made (e.g., editing a spouse relationship, updating a name), the system automatically saves to the backend, providing minimal disruption to the user workflow.

2.2 Multiple Visualization Templates
	1.	Modern View
	•	Color-Coded Cards:
	•	Circle avatar on top (placeholder for male/female or user-uploaded avatar).
	•	Blue/pink border or background based on gender.
	•	Name, DoB/DoD, Place of Birth, spouse/children preview.
	•	Layouts: Typically, a hierarchical left-to-right or top-to-bottom display, using a modern UI framework and maybe a library like d3.js or something similar.
	2.	Classic View
	•	Simplified black-on-white style with minimal cards (or boxes).
	•	No Avatars; only:
	•	Name
	•	Birth date & death date
	•	Place of birth (optional)
	•	Ideal for users who want a more traditional, text-focused family tree.
	•	Avoids color-coding or any flashy styling.
	3.	Switching Views
	•	A simple toggle or dropdown in the UI to switch between Modern View and Classic View.
	•	The data source is the same; only the rendering is changed.

2.3 Export & Import
	1.	JSON Export
	•	Full or filtered data export.
	•	“Filtered” = Only the subset (ancestors/descendants) is exported if desired.
	2.	Image/PDF Export of Current View
	•	Supports capturing the displayed tree in either Modern or Classic template.
	•	May use client-side libraries (e.g., html2canvas, jspdf) or a server-side rendering approach.
	3.	GEDCOM (Future/Optional)
	•	Potential partial implementation to integrate with other genealogical tools (e.g., familysearch.org).

⸻

3. Data Model

3.1 Person

{
  "id": "unique_identifier",
  "firstName": "string",
  "lastName": "string",
  "maidenName": "string (optional)",
  "gender": "male|female|other (enumeration)",
  "dateOfBirth": "YYYY-MM-DD",
  "dateOfDeath": "YYYY-MM-DD (optional)",
  "placeOfBirth": "string (optional)",
  "notes": "string (optional)",
  "avatarUrl": "string (optional)",

  "spouseRelationships": [
    {
      "spouseId": "person_id",
      "dateOfMarriage": "YYYY-MM-DD (optional)",
      "children": [ "child_id_1", "child_id_2" ]
    }
  ]
}

Rationale:
	•	Each Person object has enough info to support a “modern” card-based UI (avatar, color-coded by gender) and also minimal data fields for the “classic” text-based rendering.

3.2 Relationship Handling
	•	Multiple spouses stored in spouseRelationships, each with optional marriage date and an array of child IDs unique to that relationship.

⸻

4. System Architecture

4.1 Tech Stack
	1.	Backend:
	•	Node.js (Express) or Python (Flask/FastAPI/Django) providing RESTful APIs for all CRUD operations.
	2.	Frontend:
	•	Modern library or framework (React, Vue, or Angular).
	•	Two main rendering modes (Modern, Classic) to display the same hierarchical data differently.
	•	Possibly a library for diagramming or a custom approach (e.g., react-family-tree, d3.js).
	•	Exporting views to images/PDF (client-side or server-side).
	3.	Database:
	•	Could be relational or document-oriented.
	•	Each Person record stands alone, references spouses and children via IDs.
	4.	Autosave:
	•	Listen for changes in the frontend and update the server with either a debounced call or a short idle timer.
	5.	Docker:
	•	Provide a Dockerfile so that the entire app (backend + frontend) can be run from a single container.
	•	Optionally, a docker-compose.yml if using a separate DB container.

⸻

5. API Endpoints
	1.	Persons
	•	GET /api/people (list/search)
	•	GET /api/people/:id
	•	POST /api/people (create)
	•	PUT /api/people/:id (update)
	•	DELETE /api/people/:id (delete)
	2.	Tree
	•	GET /api/tree/:id
	•	Returns hierarchical data for the specified person’s family (ancestors, descendants, or both) based on query params, e.g., ?type=descendants.
	3.	Export
	•	GET /api/export/json?filter=[id]
	•	Export filtered or full data as JSON.
	•	GET /api/export/gedcom?filter=[id] (optional/future)
	•	Tree image/PDF export may be primarily client-side but can be integrated server-side if needed.

⸻

6. User Stories (Expanded)
	1.	Visual Template Switching
	•	“As a user, I can switch between a modern, vibrant card view and a classic text-based view with one click/toggle, so I can choose a style that suits my preference or usage scenario.”
	2.	Minimal vs. Detailed
	•	“As a user, sometimes I only want text-based details (classic view) for printing or official genealogical references, while at other times I want a visually appealing design (modern view) for family presentations.”
	3.	Export in Chosen View
	•	“As a user, I want to export whichever visualization I currently have displayed (modern or classic) as an image or PDF.”

⸻

7. Wireframe / UX Flow
	1.	Main Dashboard
	•	A toggle or dropdown in the top navigation that switches between “Modern View” and “Classic View.”
	•	Central area to render the tree.
	•	A side panel for searching/filtering (ancestors/descendants).
	•	A button for “Export Tree” (generates image/PDF).
	2.	Person Cards (Modern)
	•	Color-coded circle avatar up top.
	•	Name, birth/death years, place of birth, small icons or text for spouse count, children count.
	•	Expand or click to edit (opens side panel or modal).
	3.	Classic Boxes
	•	Minimal black text on white background.
	•	Name, DoB, DoD, PoB in a rectangle with connecting lines to relatives.
	•	No avatars or colors (besides black).

⸻

8. CI/CD: GitHub Actions
	1.	Build:
	•	Install dependencies for front-end & back-end.
	•	Generate production build of UI.
	2.	Test:
	•	Run unit tests (both back-end + front-end).
	•	Possibly include coverage checks.
	3.	Docker Build:
	•	Build the Docker image with a tag from commit SHA or version.
	4.	(Optional) Deploy:
	•	Push the image to a registry or deploy to a hosting service.

⸻

9. Milestones & Roadmap
	1.	MVP (Core CRUD, JSON export, single view)
	2.	Phase 2
	•	Multiple spouses, dateOfMarriage.
	•	Autosave & search.
	•	Modern view vs. classic view switch.
	3.	Phase 3
	•	Filter by bloodline (ancestors/descendants).
	•	Export tree as image/PDF.
	4.	Phase 4
	•	GEDCOM export (partial compliance).
	•	Additional features & performance optimizations.

⸻

10. Performance & Scalability
	•	Two rendering modes must efficiently handle large data sets. May require lazy loading or partial rendering.
	•	Image export for large trees might be slow — consider limiting export size or requiring user to zoom/pan and export the visible area.

⸻

11. Security & Privacy
	•	Minimal user-based authentication if it’s a multi-user scenario.
	•	SSL/TLS if deployed publicly.

⸻

12. Testing & QA
	•	Unit Tests: Data model, multi-spouse logic, toggling between templates.
	•	UI Tests: Ensuring modern view vs. classic view switch works.
	•	Integration Tests: Full CRUD flow with multiple spouses + children.
	•	Export Tests: Checking JSON and image/PDF exports.

⸻

13. Acceptance Criteria (Additional)
	1.	Visualization Templates: Users can easily switch between a “Modern” and a “Classic” family tree rendering.
	2.	Modern View:
	•	Cards with avatars, color-coded border for gender.
	•	All core attributes shown.
	3.	Classic View:
	•	Black text on white background, minimal data (name, birth, death, etc.).
	•	Clean, printer-friendly.
	4.	Filtering: Ability to show only specific lineages (ancestors or descendants).
	5.	Autosave: Changes to members/relationships are saved in real time.
	6.	Docker: The application runs in a single Docker container.
	7.	CI/CD: GitHub Actions pipeline builds, tests, and optionally deploys.

⸻

14. Summary

By adding dual visualization templates (modern vs. classic), you address varied user preferences and use cases, from a decorative family tree suitable for presentation to a straightforward, text-based layout for archiving or print-outs. The rest of the requirements, including support for multiple spouses, filtering by bloodlines, JSON/GEDCOM exports, and Docker-based deployment, remain central to this design.
