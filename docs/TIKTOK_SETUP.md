# TikTok Content Posting setup

This integration uses TikTok's current **Content Posting API**. It does not use the deprecated Share Video API.

1. Register a Web app in the [TikTok for Developers portal](https://developers.tiktok.com/docs/en/getting-started-create-an-app). Add both Login Kit and the Content Posting API product.
2. In Login Kit, register the exact HTTPS callback URL used as `TIKTOK_REDIRECT_URI`, for example `https://your-domain.example/api/tiktok/oauth/callback`. TikTok's Web redirect URIs are absolute, static HTTPS URLs; do not append query parameters or fragments.
3. Request the Content Posting scopes needed by this application: `video.publish` for Direct Post and `video.upload` for Send to TikTok drafts. The creator must also grant the relevant scope during OAuth.
4. Add the server-only environment values from `.env.example`: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REDIRECT_URI`. Optionally supply `TIKTOK_TOKEN_ENCRYPTION_KEY` to encrypt the HttpOnly connection cookie independently of the client secret. Do not use `NEXT_PUBLIC_` names for any of these values.
5. Test in TikTok Sandbox as appropriate. TikTok documents that Content Posting API URL properties must be verified even for Sandbox use; follow the current portal's URL-property verification instructions for the website/redirect setup.
6. Submit the app and requested scopes for TikTok review/audit before production release. TikTok requires an audit to lift the Direct Post visibility restriction. Leave `TIKTOK_DIRECT_POST_AUDITED=false` until that approval is complete.

## Current product and compliance behavior

- TikTok's Content Sharing Guidelines prohibit branding, logos, watermarks, links, and promotional material superimposed on content shared through integrations. Quran Video therefore blocks the Basic 720p watermarked export from posting. Users can select Standard 1080p or Ultra 4K and render a new non-watermarked file; the existing Basic blob is never altered.
- The creator explicitly starts the final Direct Post or draft transfer. Opening the dialog, connecting TikTok, and editing the caption never transfers media.
- The dialog shows the connected TikTok account and asks TikTok for fresh creator info before presenting posting controls. Privacy and interaction controls are created only from the capabilities TikTok returns.
- Until the Direct Post client is audited, Quran Video labels Direct Post as private/Only you and the server enforces `SELF_ONLY`; it does not imply that a public post occurred. Draft uploads are labelled separately: they notify the creator in TikTok so they can edit and publish there.
- Completed video bytes transfer directly from the browser to TikTok's returned `FILE_UPLOAD` URL in documented sequential chunks. The Quran Video server only handles OAuth, token refresh, creator-info, initialization, status, and cancellation requests; it does not store or proxy rendered media.

## Official references

- [Get Started — Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
- [Get Started — Upload](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content)
- [Media Transfer Guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [Query Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
- [Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
- [Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web)
- [User Access Token Management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
