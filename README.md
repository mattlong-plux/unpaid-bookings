# Plux Stays — Unpaid Bookings Tracker

A React app for tracking unpaid Hostaway bookings across multiple property management instances.

## Deploy to Netlify

### Option A: Drag & Drop (Quickest)

1. **Install & build locally first:**
   ```bash
   npm install
   npm run build
   ```
2. Go to [netlify.com](https://netlify.com) → Log in → **Add new site** → **Deploy manually**
3. Drag the `dist/` folder onto the Netlify drop zone
4. Done! Your site will be live at a `*.netlify.app` URL

### Option B: GitHub + Netlify CI (Recommended for ongoing use)

1. Push this folder to a GitHub repo
2. In Netlify: **Add new site** → **Import from Git** → Select your repo
3. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Click **Deploy site**

---

## Local Development

```bash
npm install
npm run dev
```
Open http://localhost:5173

---

## Configuration

### Hostaway Instances
- Click **Add Instance** in the app
- Enter a name, your Hostaway Account ID, and API Secret
- Credentials are stored in browser localStorage only

### Google Drive Export (optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create/select a project → Enable **Google Drive API**
3. Create **OAuth 2.0 credentials** (Web application type)
4. Add your Netlify URL as an Authorized JavaScript origin
5. Paste the Client ID into **Settings** in the app

### CORS Issues
If you see network errors fetching from Hostaway, enable the CORS proxy in **Settings → API Proxy**.
For production, consider deploying a private CORS proxy instead of using the public one.
