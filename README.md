# STUDIO Portal — prototype (B.Des Product Design, School of Design, MIT-WPU)

Interactive prototype of a gamified, closed-loop academic work-management portal. React + TypeScript + Vite, mock data in `localStorage` (no backend, no auth).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

Start at **Feature Map**. Use **Viewing as** (top bar) to switch between Instructor, Co-instructor, TA, Dean/HOD (read-only) and six students. *Demo tools* → simulate a concurrent edit or reset the data. **Instructor → Integrity lab** runs 14 attempts to break the closed-loop / loophole rules.

Suggested 5-minute demo: Student *Aarav* (15 XP from a rank-up) → Instructor *Grading queue* → “Give feedback” on Aarav’s shadowing report (annotate text, post) → switch back to Aarav: quest-complete + rank-up moment, XP in ledger.

## Stack (as specified)
react-data-grid (every editable table) · frappe-gantt · @dnd-kit/core · recharts · react-hook-form + zod · zustand · @casl/ability + @casl/react · json-rules-engine · @tiptap/react · sonner · Uppy (core, dashboard, xhr-upload) · @tanstack/react-table v8 (read-only lists) · motion · immer (draft updates).

## Architecture
| Layer | File | Notes |
|---|---|---|
| Data model (Phase 0) | `src/types.ts` | Course, CA, Task, Group, Submission (versions), Feedback, MilestoneArtifact, PeerCycle/PeerEval, Effort/Contribution logs, XPRule/XPEvent/Rank, Project (IP), Competition/CompEntry, Notification, AuditEntry |
| Seed | `src/data/seed.ts` | 2 courses, 1 group task (4 members, rotating roles), 3 peer cycles, 3 IP projects (2 gated at different stages), 5 competitions |
| Data layer | `src/api.ts` | The only module that touches storage. Every command is `(draft, actor, …args)` and enforces permissions, gates, server timestamps and audit. Swap `loadDb/saveDb` for fetch calls to add a backend |
| Store | `src/store.ts` | zustand; `cmd.*` binds api commands to the current user; async XP evaluation via json-rules-engine |
| Permissions | `src/lib/permissions.ts` | CASL ability per role; adding a role is one `case` |
| XP economy | `src/lib/rules.ts` + `XPRule.conditions` | Each rule is JSON conditions + points; editable in the XP page |
| Grid | `src/components/EditableGrid.tsx` | Shared react-data-grid wrapper: inline edit, undo/redo, paste (incl. multi-cell TSV), fill handle, sort/filter, add/delete/duplicate, dnd-kit row reorder, concurrent-edit banner |

## Where the rules are enforced (not just UI copy)
- No completion without feedback on the latest version — `completeUnit` (api.ts); XP re-verifies it in `applyXp`.
- Peer scores immutable after submit; self-favouring/outlier scores flagged and excluded until an instructor resolves them with a justification — `submitPeerRound`, `resolveFlag`, `lib/peer.ts`.
- Server-authoritative submission time — `submitWork` ignores any client timestamp.
- Manual XP / grade change / extension / flag resolution require justification and are audit-logged; the audit log has no edit or delete path.
- IP gate — `setProjectFlag` refuses portfolio-ready / competition-eligible without a screening record.
- Concurrent edits — every grid row carries `rev`; stale writes are rejected with a visible “this was just updated” notice; rubric version bumps warn students mid-submission.

## Known limitations of this draft
- react-data-grid (v7 beta) has single-active-cell selection, so “multi-cell selection” is delivered as multi-cell **paste** (TSV from Excel/another grid), the drag **fill handle**, and multi-**row** selection for bulk actions — not a highlighted rectangular range.
- Uploads are simulated (Uppy UI + progress; files are not stored). `UppyUploader.tsx` has a `MOCK_UPLOAD` switch for `@uppy/xhr-upload`/tus once a server exists.
- Competitions, organisers and prizes are **sample data**, not real listings.
- Instructor-authored rich text is rendered as HTML; sanitise server-side before any real deployment.
- No Figma track was produced (no design file was available); the design tokens live in `src/index.css`. Phases 0–4.5, 6.5 and 7 of the process are design/governance work; Phase 0/1 artefacts are in `docs/`.
