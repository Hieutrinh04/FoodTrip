# Community verification

Feature routes: `/community` and `/community/:postId`.

## Automated checks

- `npm test`: text/coordinate/photo validation and safe keyset cursors, plus existing suites.
- `npx supabase db query --linked --file test/communityRls.sql`: runs two synthetic users in a single **rolled-back transaction**. Checks public reads, post and comment CRUD, cross-owner denial, immutable owner/timestamps, coordinate/text/photo validation, upload-folder ownership, comment cascade and posting rate limit. No permanent users or posts are created.
- `npm run build`
- `npx oxlint src/components/community src/pages/Community.jsx src/lib/community.js src/lib/communityValidation.js`

## Manual acceptance

1. As a guest, open the feed, search by place name, open a post link, read comments. Writing requires sign-in and preserves the current draft when the login dialog opens.
2. As member A, compose a post with a public nickname, text, 1–4 JPG/PNG/WebP photos and a location. Search suggestions must be explicitly selected; manual coordinates or clicking a map pin are also supported. Public-sharing consent is required. Photos are resized to 1600px maximum edge and re-encoded as JPEG to discard EXIF metadata.
3. Submit, reload the detail URL, inspect images, coordinates, map, directions and share link. Check the My posts filter. Text/location edits preserve the published photos.
4. As member B, discuss the post; edit/delete B's own comments. A cannot edit B's comments; B cannot edit/delete A's post. Removing a whole post also removes its comments.
5. With a discussion open in two browsers, a new comment shows an update banner in the other browser. The refresh button works even when the Realtime socket is unavailable. Older comments and posts use keyset pagination.
6. Check mobile (390px), desktop (1280px), keyboard controls, invalid coordinates, over-limit photos, broken photo URLs, offline errors and retry. Retrying a timed-out create uses the same draft ID to avoid duplicate publication.

## Operational notes

- Migration: `20260921100000_community.sql`. Apply this targeted migration, not unrelated pending migrations.
- Photos in `community-photos` and all posts/comments are **public**. No GPS tracking permission is requested. Only the selected place coordinates are published; never use private home addresses without permission.
- The public nickname is self-selected, not a verified identity or an administrator badge. Existing auth/account roles are unchanged.
- Maps reuse TrackAsia and place search reuses `verify-place`. Both fail gracefully; valid manual coordinates and external directions remain available.
- This release supports flat discussions, not nested replies, likes or a moderator dashboard. Reports can be sent through the existing contact page.
- Deleting a post also attempts to delete its Storage photos and reports failure. Explicitly discarding a failed draft checks for an already-committed post before cleaning up unpublished photos. Closing the browser during upload can leave orphaned files; a scheduled, server-side unreferenced-file cleanup is a future operational improvement. Do not delete `storage.objects` rows directly; use the Storage API.
