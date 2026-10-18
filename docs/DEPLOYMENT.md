# Deployment and Google integrations

Project Telos is a single-service deployment: one Cloud Run container serves the
compiled React app and FastAPI API. The root [Dockerfile](../Dockerfile) builds the
web app and packages it with the API. The deployed prototype runs directly on Cloud Run.
Firebase is used through Firestore for storage. [Firebase Hosting](#firebase-hosting-in-front-of-cloud-run)
is an optional extra that is not deployed.

> The commands below deploy the current prototype. They do not replace a review of
> access control, cost limits, and data retention before a public launch.

## Local Google AI setup

The offline demo works without credentials. To enable live Google features:

1. Create a Gemini Developer API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. In `.env`, set `PROJECT_TELOS_PROVIDER=gemini`, `GEMINI_API_KEY`, and
   `PROJECT_TELOS_OFFLINE_FALLBACK=false`.
3. To enable YouTube search, add a server-side `YOUTUBE_API_KEY` restricted to
   YouTube Data API v3. Never expose either key through a `VITE_` variable.
4. Install optional SDKs and restart the API:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -e "services/api[dev,google,cloud]"
   ```

5. Set `PROJECT_TELOS_GEMINI_MODEL` to a video-capable model available to your
   account. `/health` reports whether model calls are enabled.

If Google rejects `gemini-2.5-flash` as unavailable to new users, select an
available replacement in `PROJECT_TELOS_GEMINI_MODEL` and restart the API.
`gemini-3.5-flash` (Vertex AI, location `global`) was verified with the public-video creator check.
Restart after changing `.env`; Python source reload does not reliably reload
environment-file settings. Creator scans require `google-genai>=2.29.0` and
use its JSON Schema configuration, not the narrower legacy response-schema format.
Profile extraction, viewer video audits, and reframing use the same JSON Schema
configuration. Profile generation sends a structural projection of the shared
contract (types, required fields, enums, and object shape), with local references
inlined. The complete original contract, including length and pattern constraints,
still validates every profile before it is saved.
Viewer audits also send a structural schema to avoid provider constraint rejection;
their complete Pydantic schema and timeline checks still validate all returned evidence.

Creator and viewer video checks report Gemini outages/timeouts as HTTP 503 and
quota/rate limits as HTTP 429. HTTP 402 indicates a billing/payment issue; if
prepaid credits are depleted, replenish the API key's project balance in
[Google AI Studio](https://ai.studio/projects) before retrying. A new key in the
same project will not restore credits. Retry transient outages later; do not repeatedly
resubmit checks on quota errors. HTTP 502 distinguishes rejected requests/access
from invalid model evidence. Logs include the exception type and upstream status
and validation-error categories only, never raw provider messages, model output,
or credential-bearing URLs.

The selected provider handles public YouTube-video analysis. Search sends declared interests only, not boundary reasons. Search
results are candidates, not safety verdicts. Analysis and playback each require
separate user approval. Public YouTube playback is not frame-gated.

### Switch between Gemini Developer API and Vertex AI

`PROJECT_TELOS_PROVIDER` controls all AI calls: profiles, creator checks, live
viewer audits, reframing, and Imagen. No automatic provider fallback occurs.
Keep `PROJECT_TELOS_OFFLINE_FALLBACK=false` for live calls.

For Developer API:

```dotenv
PROJECT_TELOS_PROVIDER=gemini
GEMINI_API_KEY=your-key
```

For Vertex AI:

```dotenv
PROJECT_TELOS_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
PROJECT_TELOS_GEMINI_MODEL=gemini-2.5-flash
```

The model above is an example: choose one currently available to your Vertex
project and location. Do not assume a Developer API model ID is available on
Vertex. Set `PROJECT_TELOS_IMAGEN_MODEL` similarly if using image generation.
No storage bucket is required for inline uploads or public YouTube URL input.

Enable `aiplatform.googleapis.com` in the project and grant the calling identity
`roles/aiplatform.user`. For local development, authenticate with:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project your-project-id
```

On Cloud Run, attach an appropriately authorized service account instead;
do not upload a service-account key into the app. A stale
`GOOGLE_APPLICATION_CREDENTIALS` setting can override local ADC, so leave it
unset unless intentionally using a credentials file.

When Vertex is selected, an existing `GEMINI_API_KEY` is ignored. The YouTube
Data API still uses `YOUTUBE_API_KEY`, independently of the AI provider.
Restart the API after switching and inspect `/api/health` and the creator/viewer
status endpoints. Configuration presence does not prove credentials, quota,
model access, or successful video analysis. Vertex is billed separately; verify
trial/credit eligibility before making requests.

## Cloud Run integrations

Integrations are opt-in and are reported by `GET /health` under `integrations`.
Settings requiring Google Cloud need `GOOGLE_CLOUD_PROJECT`.

| Service | Setting | Purpose |
| --- | --- | --- |
| Gemini | `PROJECT_TELOS_PROVIDER=gemini`, `GEMINI_API_KEY` | Intent parsing, approved video audits, creator checks |
| YouTube Data API v3 | `YOUTUBE_API_KEY` | Intent search and video metadata; pasted links can use oEmbed without the key |
| Imagen | `PROJECT_TELOS_IMAGEN_MODEL` | Generate an honest thumbnail suggestion; billing-enabled key required |
| Firestore | `PROJECT_TELOS_STORAGE=firestore`, `PROJECT_TELOS_FIRESTORE_DATABASE` | Persist profiles, sessions, receipts, analyses, and each creator's recent checks (`creator_checks`) |
| Firebase Hosting (optional, not deployed) | [firebase.json](../firebase.json) | Serve the web app from the CDN; rewrite `/api/**` to Cloud Run |
| BigQuery | `PROJECT_TELOS_BIGQUERY_ENABLED=true`, `PROJECT_TELOS_BIGQUERY_DATASET` | Store content-free verdict statistics |
| Cloud Translation v3 | `PROJECT_TELOS_TRANSLATION_ENABLED=true` | Translate non-English creator drafts before analysis |
| Cloud Run | Root `Dockerfile` | Serve API and built web app from one service |

BigQuery creates the `verdicts` table on first write. It stores metadata such as
band, score, counts, region, and language, not titles or transcripts. Analytics
write failures are logged and do not fail a user request.

## Deploy

Deployment has two parts:

1. **One-time setup and first deploy** (below, from your machine). This creates the
   Cloud Run service and sets its env vars, secrets, and runtime service account.
2. **Continuous deployment from GitHub.** A Cloud Build trigger runs
   [cloudbuild.yaml](../cloudbuild.yaml) on every push to `main`: it builds the root
   [Dockerfile](../Dockerfile), pushes the image to Artifact Registry, and deploys it.
   Each deploy changes only the image; the service configuration from step 1 is kept.

Prerequisites: the [gcloud CLI](https://cloud.google.com/sdk/docs/install), a Google
Cloud project with billing enabled, admin access to the GitHub repository, and a
PowerShell terminal at the repository root. The commands use Vertex AI with
Application Default Credentials; see [Using a Gemini API key instead](#using-a-gemini-api-key-instead).

### 1. Project setup

```powershell
$PROJECT = "your-project-id"; $REGION = "us-central1"
gcloud config set project $PROJECT
$NUM = gcloud projects describe $PROJECT --format="value(projectNumber)"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com `
  secretmanager.googleapis.com aiplatform.googleapis.com youtube.googleapis.com `
  firestore.googleapis.com bigquery.googleapis.com translate.googleapis.com

# Image registry used by cloudbuild.yaml (_AR_REPO).
gcloud artifacts repositories create project-telos --repository-format=docker --location=$REGION

# Optional integrations; skip any you do not enable in step 3.
gcloud firestore databases create --location=$REGION
bq --location=US mk --dataset "${PROJECT}:project_telos_analytics"
```

### 2. Service accounts and secrets

Use two dedicated identities: one the app runs as, and one Cloud Build deploys with.

```powershell
gcloud iam service-accounts create telos-runtime  --display-name="Project Telos runtime"
gcloud iam service-accounts create telos-deployer --display-name="Project Telos deployer"
$RUNTIME  = "telos-runtime@$PROJECT.iam.gserviceaccount.com"
$DEPLOYER = "telos-deployer@$PROJECT.iam.gserviceaccount.com"

# What the running app may call. Drop roles for integrations you do not enable.
foreach ($role in "roles/aiplatform.user","roles/secretmanager.secretAccessor","roles/datastore.user",
                  "roles/bigquery.dataEditor","roles/bigquery.jobUser","roles/cloudtranslate.user") {
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$RUNTIME" --role=$role
}

# What a build may do: push images, deploy Cloud Run, write build logs.
foreach ($role in "roles/run.developer","roles/artifactregistry.writer","roles/logging.logWriter") {
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$DEPLOYER" --role=$role
}
# The deployer must be allowed to deploy a service that runs as the runtime account.
gcloud iam service-accounts add-iam-policy-binding $RUNTIME `
  --member="serviceAccount:$DEPLOYER" --role="roles/iam.serviceAccountUser"

# Keys live in Secret Manager, never in the image, the repo, or a VITE_ variable.
Set-Content -NoNewline -Path youtube.key -Value "YOUR_YOUTUBE_KEY"
gcloud secrets create YOUTUBE_API_KEY --data-file=youtube.key
Remove-Item youtube.key

# Site access code: every visitor must enter it before the app or API responds.
Set-Content -NoNewline -Path access.code -Value "YOUR_ACCESS_CODE"
gcloud secrets create PROJECT_TELOS_ACCESS_CODE --data-file=access.code
Remove-Item access.code
```

`Set-Content -NoNewline` avoids the trailing newline PowerShell piping adds, which
makes Google reject a key. Restrict the YouTube key to YouTube Data API v3.

### 3. First deploy

```powershell
gcloud run deploy project-telos --source . --region $REGION --allow-unauthenticated `
  --service-account $RUNTIME --memory 1Gi --max-instances 3 --timeout 300 `
  --set-env-vars "PROJECT_TELOS_PROVIDER=vertex,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=global,PROJECT_TELOS_GEMINI_MODEL=gemini-3.5-flash,PROJECT_TELOS_OFFLINE_FALLBACK=false,PROJECT_TELOS_STORAGE=firestore,PROJECT_TELOS_BIGQUERY_ENABLED=true,PROJECT_TELOS_BIGQUERY_DATASET=project_telos_analytics,PROJECT_TELOS_TRANSLATION_ENABLED=true" `
  --set-secrets "YOUTUBE_API_KEY=YOUTUBE_API_KEY:latest,PROJECT_TELOS_ACCESS_CODE=PROJECT_TELOS_ACCESS_CODE:latest"

# Optional one-line hint under the code box. ^|^ makes | the separator, because the hint has commas.
gcloud run services update project-telos --region $REGION `
  --update-env-vars '^|^PROJECT_TELOS_ACCESS_HINT=Two words, and the first one starts with "Chinna".|PROJECT_TELOS_ACCESS_HINT_ENABLED=true'

$URL = gcloud run services describe project-telos --region $REGION --format="value(status.url)"
gcloud run services update project-telos --region $REGION --update-env-vars "PROJECT_TELOS_ALLOWED_ORIGINS=$URL"
curl "$URL/api/health"
```

`--source .` builds the same Dockerfile with Cloud Build. Files ignored by git
(including `.env`) are not uploaded. `--timeout 300` leaves room for a whole-video
creator check, which runs two Gemini calls with one retry each.

`GOOGLE_CLOUD_LOCATION=global` is required for `gemini-3.5-flash`; regional
locations such as `us-central1` may not serve it. The Cloud Run region and the
Vertex location are independent.

### 4. Connect the GitHub repository

The connection uses a GitHub OAuth app, so do this part in the browser:

1. Open **Cloud Build → Repositories** ([console](https://console.cloud.google.com/cloud-build/repositories/2nd-gen)),
   choose region `us-central1`, and select **Create host connection → GitHub**.
   Name it `github` and authorize the **Google Cloud Build** GitHub app.
2. When asked, install the app on your account and grant it access to only the
   `project-telos` repository.
3. Back in the console, select **Link repository**, choose the `github` connection
   and `KotanaSai21/project-telos`. Keep the generated name `KotanaSai21-project-telos`.

Then create the trigger:

```powershell
gcloud builds triggers create github --name=project-telos-main --region=$REGION `
  --repository="projects/$PROJECT/locations/$REGION/connections/github/repositories/KotanaSai21-project-telos" `
  --branch-pattern='^main$' --build-config=cloudbuild.yaml `
  --service-account="projects/$PROJECT/serviceAccounts/$DEPLOYER"
```

If your Cloud Run region is not `us-central1`, also pass
`--substitutions=_REGION=$REGION` so the build pushes to and deploys in that region.

Test the trigger without pushing a commit:

```powershell
gcloud builds triggers run project-telos-main --region=$REGION --branch=main
gcloud builds list --region=$REGION --limit=3
```

From now on every push to `main` builds and deploys. A failed build leaves the
current revision serving. Builds appear under **Cloud Build → History**, and each
image is tagged with its short commit SHA.

> **Alternative (all in the console):** Cloud Run → the `project-telos` service →
> **Connect repo** (Set up continuous deployment) walks through the same GitHub
> connection and creates a Dockerfile-based trigger. It does not use
> `cloudbuild.yaml` or the dedicated deployer account, so prefer the steps above.

### Access code

With `PROJECT_TELOS_ACCESS_CODE` set, the page asks for the code first, and every
API route except `/api/health` and `/api/access/*` answers 401 without it. A correct
code sets an HttpOnly cookie for seven days; changing the code signs everyone out.
Case and spaces are ignored, and ten wrong tries in five minutes from one
address are refused with 429. Hide the hint with
`PROJECT_TELOS_ACCESS_HINT_ENABLED=false`; remove the secret to open the site.

This is a shared password for a prototype, not user accounts.

### Changing configuration later

The pipeline never changes env vars or secrets. Change them on the service; the
next push keeps them:

```powershell
gcloud run services update project-telos --region $REGION --update-env-vars "PROJECT_TELOS_GEMINI_MODEL=gemini-2.5-flash"
gcloud secrets versions add YOUTUBE_API_KEY --data-file=youtube.key   # then redeploy or update the service
```

### Using a Gemini API key instead

To use the Gemini Developer API rather than Vertex AI, store the key and change
the provider. The runtime account then does not need `roles/aiplatform.user`.

```powershell
Set-Content -NoNewline -Path gemini.key -Value "YOUR_GEMINI_KEY"
gcloud secrets create GEMINI_API_KEY --data-file=gemini.key; Remove-Item gemini.key
gcloud run services update project-telos --region $REGION `
  --update-env-vars "PROJECT_TELOS_PROVIDER=gemini" `
  --update-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

Restrict the Gemini key to the Generative Language API.

### Firebase Hosting in front of Cloud Run

Optional. The deployed prototype does not use it; it is served directly from Cloud Run.

[firebase.json](../firebase.json) serves the built web app (`apps/web/dist`) from
Firebase Hosting and rewrites `/api/**` to the `project-telos` Cloud Run service in
`us-east1` (change it in that file if your service runs elsewhere). Deploy the Cloud Run service first, then, from the repository root:

```powershell
npm install -g firebase-tools
firebase login
firebase projects:addfirebase $PROJECT   # once, if the project is not a Firebase project yet
npm run build
firebase deploy --only hosting --project $PROJECT
```

The site is then at `https://$PROJECT.web.app`; the Cloud Run URL keeps working.
Notes:

- Hosting forwards only a cookie named `__session` to Cloud Run, which is why the
  access-code cookie uses that name.
- Hosting waits at most **60 seconds** for a Cloud Run response. Creator checks of
  a draft or a video's first minute normally finish well within that; a whole long
  video may not. Use the Cloud Run URL for long whole-video checks.
- Redeploy Hosting after web changes. Cloud Build only redeploys Cloud Run.

### Verify, analyze, and roll back

The response from `GET <service-url>/api/health` should report `status: "ok"` and
show the expected enabled integrations.

Example aggregate query:

```sql
SELECT kind, band, region, COUNT(*) AS checks, ROUND(AVG(risk_score), 1) AS avg_risk
FROM `project_telos_analytics.verdicts`
GROUP BY kind, band, region ORDER BY checks DESC;
```

To roll back, list revisions and direct traffic to a previous revision:

```powershell
gcloud run revisions list --service project-telos --region $REGION
gcloud run services update-traffic project-telos --region $REGION --to-revisions=REVISION_NAME=100
```

The prototype has no user accounts. Keep the instance cap low, set a Gemini budget
alert, and add suitable access controls before using it beyond a hackathon demo.
