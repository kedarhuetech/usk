# Backup To Drive setup

Backup To Drive uses the server-side Google OAuth web flow and Google Drive API. It reuses the `.usvbackup` payload created by Backup To Computer and uploads a new timestamped file for every request.

## Google Cloud setup

1. Select or create a Google Cloud project and enable the **Google Drive API**.
2. Configure the OAuth consent screen. Add `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file` as the requested scopes. `drive.file` limits USV to files created by this app or explicitly opened/shared with it.
3. If the consent screen is **External** and in **Testing**, add each Google account that will test sign-in under **Test users**. Those accounts may see a testing warning. Google currently limits refresh tokens for External apps in Testing to seven days when Drive scopes are requested; testers may need to sign in again. See [Google OAuth testing behavior](https://developers.google.com/identity/protocols/oauth2) and [Drive scope guidance](https://developers.google.com/drive/api/guides/api-specific-auth).
4. Create an OAuth client with application type **Web application**. Add the exact redirect URI below under **Authorized redirect URIs**. For production, use the public application origin and matching `/api/auth/google-drive/callback` path.
5. Copy the placeholders from the repository's `.env.example` into the ignored root `.env` or `server/.env`, then replace them with the Google OAuth client ID and secret. Never commit `.env`.
6. Restart the backend and frontend. The Backup To Drive page reports when backend OAuth configuration is missing.

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-web-client-secret
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:5173/api/auth/google-drive/callback
```

For a non-default frontend origin, also set the existing backend `CLIENT_ORIGIN` to the allowed frontend origin(s) and `FRONTEND_URL` to the origin where the callback should return. The Drive session cookie is HTTP-only and SameSite protected; configure HTTPS in production.

## Session and data limitations

OAuth tokens remain in the backend process's memory and are never sent to browser storage, logged, or placed in the backup. This repository does not currently configure a durable server-side session/token store, so restarting the backend disconnects Drive and the user must sign in again. A multi-instance deployment needs a durable encrypted server-side session store before it can preserve connections across restarts. Backup contents still come from this browser's existing LocalStorage repositories; backend-only records are excluded.
