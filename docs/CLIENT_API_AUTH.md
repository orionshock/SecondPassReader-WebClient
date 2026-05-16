# Client API linking flow (current)

This app links to a Second Pass server using a **PIN/code + polling** flow (not OAuth/OIDC).

## Flow

1. **Discover server**
   - `GET /.well-known/secondpass`
   - Use discovery response to learn `api_base_url` and the client API endpoints.

2. **Create login request**
   - `POST` the server’s “login request” endpoint (from discovery).
   - Response includes:
     - `code` (authorization code/PIN to display to the user)
     - `authorize_url` (URL the user visits to approve)
     - `poll_url` (URL the client polls)
     - `interval` (poll interval in seconds)

3. **Display and wait**
   - Show the `code` and provide a link to open `authorize_url`.

4. **Poll for completion**
   - Repeatedly `GET poll_url` until one of:
     - **approved:** one-time bearer token returned
     - **denied:** user denied the request
     - **expired:** request timed out
     - **consumed:** token already exchanged/used
   - Stop polling immediately on any terminal state.

5. **Verify (/me)**
   - Call `GET {apiBaseUrl}/accounts/me/` with the bearer token.
   - Treat success as “verified”.

## /me verification

- Request:
  - `GET {apiBaseUrl}/accounts/me/`
  - `Authorization: Bearer <accessToken>`
  - `Accept: application/json`
- Server phase 1 note:
  - Bearer token support currently only needs to support `GET /api/v1/accounts/me/` on the server.
- Failure handling:
  - `401` / `403` => token invalid/revoked/not allowed; profile may need re-linking.
- If `must_change_password` is true:
  - Warn the user to change their password in the server web UI before continuing.

## Security notes

- The bearer token is **password-equivalent**:
  - do not log it
  - do not include it in URLs
  - do not persist it casually (design storage explicitly)
- Prefer short polling intervals with backoff and clear cancellation.

