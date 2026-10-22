# Public Legal Pages

## Purpose

Public legal pages support the Meta/Facebook Smart Ads integration and can be opened without dashboard authentication.

## Routes

- `/privacy-policy`
- `/terms`
- `/data-deletion`

## Files

- `src/pages/Legal/LegalPages.jsx` - Privacy Policy, Terms, and Data Deletion page components.
- `src/App.jsx` - Public routes added outside `MainLayout`.
- `vercel.json` - SPA rewrite so direct Vercel route visits load the React app.

## Meta Developer App URLs

- Privacy Policy URL: `https://vyapar-ui.vercel.app/privacy-policy`
- Terms of Service URL: `https://vyapar-ui.vercel.app/terms`
- User Data Deletion URL: `https://vyapar-ui.vercel.app/data-deletion`

## Current Data Note

Meta tokens/assets are temporary backend in-memory state. Smart Ads campaign records and Meta publish IDs are currently browser local storage prototype data.
