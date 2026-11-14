# MissionPulse — Crew SOS

## What is implemented
- Tap SOS and select a reported problem and symptoms, onset, and severity.
- View missing or explicitly synthetic readings with timestamps.
- Navigate a nonclinical demo checklist and record complete/skipped states.
- Simulate alerts and human acknowledgment without network access.
- Optional Flask/Twilio backend submits an SMS and call to one configured support number.
- Explicit acknowledgment requires the configured recipient to reply `ACK <incident-id>` to the Twilio number. Delivery or call completion never counts as acknowledgment.
- Export incident JSON and display a browser-local daily incident activity summary.
- Answer a small set of crew workflow questions using predefined responses.

There is no LLM in this version. A deterministic workflow keeps demo behavior reviewable. Daily incident summaries are not daily health reports; a health report needs connected health data. No reviewed medical protocol, sensor integration, diagnosis, treatment, automated triage, resolution logic, or real spacecraft communications is supplied.

## Static demo on GitHub Pages
Upload index.html, styles.css, app.js, protocols.js to your repository root. Settings → Pages → Deploy from a branch → main → /(root) → Save. Open the published site and keep Alert mode set to Simulation. Python files are not run by GitHub Pages. Only upload public source code; never upload actual credentials, database files, or incident exports.

## Local demo
From this folder run:

    python3 -m http.server 8000

Open http://localhost:8000. No installation or credentials are required for the browser simulation. Click Crew SOS → choose a problem → optionally load synthetic readings → navigate demo steps → Request help → Simulate human acknowledgment → download incident JSON.

## Optional backend, local test
In a separate terminal:

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    export SOS_ACCESS_TOKEN='replace-with-a-long-random-test-token'
    export FRONTEND_ORIGIN='http://localhost:8000'
    python3 server.py

In the page choose Configured backend, URL http://localhost:5000, and the same token. ENABLE_REAL_ALERTS defaults to false, so this backend still simulates alerts. The token is a demo access control, not a production identity system. The .env.example file is a reference; it is not loaded automatically.

## Real Twilio integration — developer setup
No real message or call was sent during creation. To test live delivery, use consenting test recipients and a correctly configured Twilio account/number. Configure all .env.example variables as environment variables, including ENABLE_REAL_ALERTS=true. Deploy the backend separately using HTTPS and an appropriate WSGI host. Set FRONTEND_ORIGIN to the exact origin of your Pages site, such as https://YOUR-USERNAME.github.io (no repository path). Configure your Twilio number's incoming SMS webhook as POST https://YOUR-BACKEND/twilio/inbound and set PUBLIC_BASE_URL to https://YOUR-BACKEND, without a trailing slash. Signed requests are validated against that exact callback URL.

The backend polls provider statuses when Refresh status is selected. This is not automatic monitoring. ACK requires the designated support phone's signed inbound SMS containing the full incident ID. No call acknowledgment is implemented. A human acknowledgment only confirms receipt, not action or resolution. No automatic retries are performed, to avoid duplicate calls. If submission is interrupted its state may remain pending or uncertain: inspect the provider console before any manual retry. A repeated incident ID will not submit again.

Twilio runs on terrestrial networks. The prototype cannot contact Earth from space without an independent working communications link, and does not simulate physical delay. Offline static navigation remains available only if the page is already loaded; a fresh offline reload is not guaranteed. No service worker is included.

## Change the appearance
styles.css owns colors and layout. index.html owns sections and labels. Keep existing element IDs used by app.js. protocols.js holds demo content. Do not relabel demo content as medically reviewed. Operational procedures need authoritative review, scope, versioning, branching/escalation logic, and verification before implementation. The linear demo checklist is not a medical protocol engine.

## Data and limits
Incident records are stored in localStorage on the current browser. They are accessible to other users of that browser and lost if site data is cleared. Download JSON for a separate copy. Active records do not resume automatically after refresh; do not depend on browser storage for operational monitoring. The daily report counts all local crew codes and labels simulations separately. No cross-device sync or patient authentication exists. Backend SQLite stores the minimal request and alert states; external notifications omit symptoms/readings. All timestamps are ISO UTC; the UI displays local time.

Future AI should summarize supplied facts or retrieve an approved protocol section with citations, never invent procedure steps. Keep emergency checklist navigation and alerting independent of model availability. Additional production work includes role-based identity, retention policy, audit controls, rate limiting, secured hosting, communications resilience, and medically reviewed procedures.

## Validation
JavaScript and Python syntax checked. Five backend tests passed: authentication, invalid input, simulation/idempotency/status, unsigned acknowledgment rejection, and CORS preflight. Tests are included in test_server.py. Live Twilio transmission and browser end-to-end behavior have not been verified in this environment.
