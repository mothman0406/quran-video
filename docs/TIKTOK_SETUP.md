# TikTok Direct Post setup

Quran Video uses TikTok's current **Content Posting API — Direct Post** with browser-direct `FILE_UPLOAD`. It does not use the deprecated Share Video API or upload completed exports to Supabase.

## Required Developer Portal configuration

1. Create a Web app in the [TikTok for Developers portal](https://developers.tiktok.com/docs/en/getting-started-create-an-app).
2. Add **Login Kit** and **Content Posting API**, then enable **Direct Post** in the Content Posting API configuration.
3. Apply for and enable the `video.publish` scope. The OAuth connection requests this scope and each creator must grant it. Login Kit's baseline `user.info.basic` is added by TikTok to the app configuration; Quran Video does not request unnecessary Display or Upload scopes.
4. In Login Kit, register this exact production redirect URI:

   `https://quran-autocaption.netlify.app/api/tiktok/oauth/callback`

   It must exactly match `TIKTOK_REDIRECT_URI`: absolute HTTPS, static, with no query string or fragment. The server rejects a production callback that is not the `/api/tiktok/oauth/callback` path. A custom canonical production domain requires registering its corresponding fixed callback and updating the environment value together.
5. Add the app's client key and client secret from the portal to Netlify. Keep the secret server-only.
6. Verify the current portal's required website/URL properties, test the complete OAuth and Direct Post flow with an eligible TikTok account, then submit the Direct Post client for TikTok audit.

## Netlify environment variables

Set these values for the production site, then redeploy:

| Variable | Value |
| --- | --- |
| `TIKTOK_CLIENT_KEY` | TikTok Developer Portal client key |
| `TIKTOK_CLIENT_SECRET` | TikTok Developer Portal client secret; never `NEXT_PUBLIC_` |
| `TIKTOK_REDIRECT_URI` | `https://quran-autocaption.netlify.app/api/tiktok/oauth/callback` |
| `TIKTOK_TOKEN_ENCRYPTION_KEY` | Strong, deployment-stable secret used to encrypt the HttpOnly connection cookie |
| `TIKTOK_DIRECT_POST_AUDITED` | `false` until TikTok confirms audit approval; then set to `true` |

`TIKTOK_TOKEN_ENCRYPTION_KEY` is optional in development, where the server can derive a key from the client secret, but it should be independently set in production. Do not expose any of these variables in client code or build-time `NEXT_PUBLIC_` values.

## Current product and compliance behavior

- The OAuth callback exchanges the code and refreshes tokens server-side. Tokens are kept in an encrypted, HttpOnly, same-site connection cookie and are never returned to the browser application, URL, or logs. A failed or expired authorization clears the connection so the creator can reconnect cleanly.
- Opening the dialog or connecting TikTok transfers no video. Quran Video queries Creator Info when rendering the connected posting form and again immediately before initialization. The creator nickname, privacy choices, interaction availability, and maximum duration come from TikTok's response.
- Creators manually choose a returned privacy value and opt into each available interaction. The form also supports TikTok's required commercial-content disclosure and asks for explicit agreement to TikTok's Music Usage Confirmation before video transfer.
- An unaudited Direct Post client is limited by TikTok to `SELF_ONLY` and private creator accounts, with a five-user/24-hour cap. Quran Video communicates that restriction and enforces `SELF_ONLY`; it does not claim public posting is available. Keep `TIKTOK_DIRECT_POST_AUDITED=false` until TikTok audit approval, then verify Creator Info exposes the appropriate choices before enabling the audited flag.
- TikTok's Content Sharing Guidelines prohibit product logos, branding, links, and promotional watermarks in shared content. Quran Video therefore blocks Basic 720p exports that contain the Quran Video watermark. The source Basic blob stays downloadable and unchanged; a paid non-watermarked export is required for TikTok eligibility.
- Completed MP4 bytes go directly from the browser to TikTok's returned `upload_url` in sequential documented chunks. The server handles only OAuth, token refresh, Creator Info, Direct Post initialization, and status; it does not store or proxy video bytes, which keeps the flow compatible with Netlify function limits.
- A finished upload is not reported as published until TikTok status reaches `PUBLISH_COMPLETE`. The UI distinguishes uploading, processing, completion, and failure, while retaining the completed local export for download and retry.

## Production verification

1. Confirm the production callback shown above is registered verbatim in Login Kit and the three required credentials are present in Netlify.
2. Connect a TikTok account and confirm the posted form identifies that creator, has only Creator Info privacy options, starts interaction checkboxes unchecked, and asks for final consent.
3. With `TIKTOK_DIRECT_POST_AUDITED=false`, verify only `Only you` is offered and that the creator account is private.
4. Post a paid, non-watermarked MP4. Confirm `FILE_UPLOAD` proceeds browser-to-TikTok, then wait for TikTok's processing status rather than treating byte upload as completion.
5. Confirm Basic watermarked exports remain downloadable but cannot initialize a post. Test denied scope, expired connection, and upload failure; each must preserve the local export.

## Official references

- [Get Started — Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
- [Get Started — Upload](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content)
- [Media Transfer Guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [Query Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
- [Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
- [Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web)
- [User Access Token Management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
