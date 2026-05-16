# Client API linking flow (current)

This app links to a Second Pass server using a **PIN/code + polling** flow (not OAuth/OIDC).

## Flow

1. **Discover server**
   - `GET /.well-known/secondpass`
   - Use discovery response to learn base API URLs/metadata needed for linking.

2. **Create login request**
   - `POST` the server’s “login request” endpoint (as defined by discovery).
   - Response includes:
     - `code` (short authorization code/PIN to display to user)
     - `authorize_url` (URL the user visits to approve the request)
     - `poll_url` (URL the client polls for completion)

3. **Display and wait**
   - Show the `code` and provide the `authorize_url` to the user.

4. **Poll for completion**
   - Repeatedly `GET poll_url` until one of:
     - **Token received:** response contains a one-time bearer token
     - **Denied:** user denied the request
     - **Expired:** request timed out
     - **Consumed:** token already exchanged/used
   - Stop polling immediately on any terminal state.

5. **Verify**
   - Call `GET /api/v1/accounts/me/` with the bearer token.
   - Treat success as “linked”; store only what’s necessary to reconnect.

## Security notes

- The bearer token is **password-equivalent**:
  - do not log it
  - do not include it in URLs
  - do not persist it casually (design storage explicitly)
- Prefer short polling intervals with backoff and clear cancellation.

