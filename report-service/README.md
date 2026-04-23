# report-service (PDF Presiometrie)

Server Express care citește date din Supabase, randează HTML (Handlebars) și generează PDF cu Puppeteer. **Next.js (`web`) îl apelează** prin `REPORT_SERVICE_URL` — trebuie să fie o adresă **publică HTTPS** în producție, nu `localhost`.

## De ce vezi „fetch failed” pe Vercel

Pe Vercel, codul Next rulează pe serverele Vercel. `localhost` sau `127.0.0.1` de acolo **nu** este PC-ul tău. Trebuie să deploy-ezi **report-service separat** undeva pe internet și să pui în Vercel variabilele:

- `REPORT_SERVICE_URL` = `https://subdomeniu.railway.app` (sau URL-ul serviciului tău)
- `REPORT_SERVICE_SECRET` = același string secret setat și pe report-service

---

## Flux complet: GitHub + Railway + Vercel

Ordinea contează: mai întâi **Railway** (report-service), apoi **Vercel** (`web`), apoi completezi **CORS** cu URL-ul Vercel.

### 1. GitHub

- Monorepo Presiometrie: la rădăcină există aplicația web (Next.js) și `report-service/`.
- Împinge codul pe branch-ul folosit pentru producție (ex. `main`). Railway și Vercel pot redeploya automat la fiecare push (în funcție de setări).

### 2. Railway — report-service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → alege repository-ul ROCA.
2. **Settings** (serviciul creat):
   - **Root Directory**: `report-service`.
   - Sursa de build: **Dockerfile** din acel folder (dacă Railway propune Nixpacks, comută pe Docker / setează dockerfile path corespunzător).
3. **Variables**:
   - `REPORT_SERVICE_SECRET` — string secret lung; îl vei duplica în Vercel.
   - `SUPABASE_URL` — din Supabase → Project Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` — cheia **service_role** (secretă).
   - Opțional: `REPORTS_BUCKET` (implicit `reports` dacă bucket-ul din Supabase Storage se numește la fel).
   - `REPORT_SERVICE_CORS_ORIGIN` — îl lași gol la primul deploy; îl pui după pasul 3 (URL Vercel).
4. **Networking** → generează domeniu public. Copiază URL-ul `https://….up.railway.app` (sau custom) — acesta este **`REPORT_SERVICE_URL`** în Vercel.
5. Verifică: `https://<url-railway>/health` → JSON cu `"ok": true`.

### 3. Vercel — aplicația Next (`web`)

1. [vercel.com](https://vercel.com) → **Add New Project** → **Import** același repo GitHub.
2. **Root Directory**: `web`.
3. **Environment Variables** (Production; la nevoie și Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `REPORT_SERVICE_URL` = URL-ul HTTPS Railway de la pasul 2.4.
   - `REPORT_SERVICE_SECRET` = identic cu cel din Railway.
4. **Deploy**. Notează URL-ul producției, ex. `https://proiect.vercel.app`.

### 4. CORS pe Railway (după ce ai URL-ul Vercel)

1. Railway → serviciul report-service → **Variables** → adaugă:
   - `REPORT_SERVICE_CORS_ORIGIN` = `https://proiect.vercel.app` (fără `/` la final; exact domeniul din browser).
2. Lasă Railway să redeploy-eze (sau **Redeploy** manual).

### 5. Verificare în ROCA

- Tab **Raport** pe un test → **Verifică report-service**.
- **Generează PDF** (UCS / Young / Point load).

### 6. Actualizări

- Push pe GitHub → ambele platforme pot rula build nou. Opțional, în Railway restricționezi **Watch paths** la `report-service/**` ca să nu rebuild-ui la fiecare schimbare doar în `web/` (dacă interfața o oferă).

---

## Variabile de mediu (report-service)

| Variabilă | Rol |
|-----------|-----|
| `PORT` | Port ascultare (implicit 4000) |
| `REPORT_SERVICE_SECRET` | Trebuie să coincidă cu `REPORT_SERVICE_SECRET` din Vercel / `.env.local` al Next |
| `SUPABASE_URL` | URL proiect Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (secret) |
| `REPORTS_BUCKET` | Opțional, implicit `reports` |
| `PUPPETEER_EXECUTABLE_PATH` | În Docker: `/usr/bin/chromium` (vezi Dockerfile) |
| `REPORT_SERVICE_CORS_ORIGIN` | Recomandat în producție: URL-ul aplicației web (ex. `https://….vercel.app`). Browserul apelează direct report-service la PDF; fără asta, unele browsere blochează cererile față de `*`. |

## Pornire locală

```bash
cd report-service
cp .env.example .env
# editați .env (Supabase + același secret ca în web/.env.local)
npm install
npm run dev
```

În `web/.env.local`:

```env
REPORT_SERVICE_URL=http://localhost:4000
REPORT_SERVICE_SECRET=acelasi-secret-ca-in-report-service
```

## Deploy report-service (recomandat: Docker)

În repo există `Dockerfile`. Poți folosi orice platformă care rulează containere:

### Railway (exemplu)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo (același repo ca ROCA).
2. Adaugă serviciu **Docker** și setează **Root Directory** la `report-service`.
3. În **Variables** pune: `REPORT_SERVICE_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, opțional `REPORTS_BUCKET`, și `REPORT_SERVICE_CORS_ORIGIN` = URL-ul Vercel al aplicației (după ce îl ai).
4. Railway dă un URL public `https://....railway.app` → acesta este `REPORT_SERVICE_URL` pentru Vercel.

### Render (exemplu)

1. [render.com](https://render.com) → New **Web Service** → conectează GitHub.
2. Root: `report-service`, Environment **Docker**.
3. Setează aceleași variabile de mediu ca mai sus.
4. Copiază URL-ul `https://....onrender.com` în Vercel ca `REPORT_SERVICE_URL`.

### Fly.io / Cloud Run / VPS

Build imaginea din folderul `report-service`, publică portul (ex. 4000), setează env-urile, folosește HTTPS (reverse proxy sau TLS oferit de platformă).

## Deploy Next.js pe Vercel + legătură GitHub

1. **GitHub**: împinge codul pe un repository.
2. **Vercel**: [vercel.com](https://vercel.com) → Add New Project → Import acel repository.
3. Setează **Root Directory** la `web` (dacă monorepo-ul tău are aplicația în `web/`).
4. În **Settings → Environment Variables** adaugă (Production / Preview după nevoie):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `REPORT_SERVICE_URL` = URL-ul **public** al report-service (nu localhost)
   - `REPORT_SERVICE_SECRET` = identic cu cel din report-service
5. Redeploy după ce modifici variabilele.

## Verificare

- Din browser: deschide `https://<report-service>/health` — trebuie JSON `{ "ok": true, ... }`.
- Din aplicație: butonul **„Verifică report-service”** în tab Raport (apelează `/api/report-service/status` pe Next).

### Eroare: „Tip test nesuportat pentru raport: point_load”

Mesajul apare când **imaginea Docker de pe Railway** este construită dintr-un commit **înainte** ca `report-service` să accepte `point_load`. **Soluție:** push pe GitHub cu codul curent din `report-service/`, apoi **Redeploy** serviciul Railway (sau lasă auto-deploy la push pe `master`). Vercel poate fi la zi, dar PDF-ul este generat de Railway — acolo trebuie ultimul cod.

## Securitate

`REPORT_SERVICE_SECRET` protejează endpoint-urile `/reports` și `/reports/preview`. Nu îl pune în cod; folosește variabile de mediu pe ambele părți.
