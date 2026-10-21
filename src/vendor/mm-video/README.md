# MM video editor in Kanban

Copied from amc-mm d218631. The native Kanban host lives in
`src/components/video-editor/VideoEditor.tsx`.

Component and browser-library code is retained from MM. Import paths are namespaced
to avoid collisions, and video-job requests use `/api/video-editor/jobs` instead of
MM's `/api/content/video-jobs`. Direct uploads retain the existing Kanban presign and
confirmation endpoints. No provider credentials or server implementation are copied.

When synchronizing, update the complete transitive client dependency set and run:
- test-unified-video-entry.mjs
- test-native-video-proxy.mjs
- test-native-video-components.mjs
- test-native-video-host.mjs
- TypeScript check

Deployment and production acceptance are tracked separately from these mocked tests.
