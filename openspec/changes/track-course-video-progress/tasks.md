## 1. Storage and policy

- [x] 1.1 Add additive progress migration and transactional interval-union persistence with provenance.
- [x] 1.2 Add authorized validated progress reads/writes and course summaries without changing playback permissions.

## 2. Experience and reporting

- [x] 2.1 Connect Vimeo events, manual control, automatic 80% marking, retry feedback and durable course status.
- [x] 2.2 Add protected operator report/export and usage documentation.

## 3. Verification and activation

- [x] 3.1 Test seek/replay/multi-session coverage, authorization, concurrency, failure feedback and responsive UI.
- [x] 3.2 Apply only the owner-authorized new migration after preflight, restart local services and verify runtime.

## 4. Completion presentation refinement

- [x] 4.1 Replace technical playback UI with a compact neutral completion row; use identical completed states for manual and detected completion, preserve internal provenance, and verify desktop/mobile persistence and failures.
- [x] 4.2 Keep background saves visually quiet, drain final/threshold updates queued behind in-flight saves, move completion below the description, and add slow-save/end-of-playback regressions.
- [x] 4.3 Lower distinct playback completion to 80% in server and player; verify the boundary and retain manual marking and all other behavior.
