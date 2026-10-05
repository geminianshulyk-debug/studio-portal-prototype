# Phase 0–1 artefacts (derived from the code)

## Entities & relationships
Course 1—* CA 1—* Task; Course 1—* CO (mapped *—* PO/PSO); Task *—1 CO; Group *—* Student; group Task → Milestones (role rotation per member) → unit = `taskId#milestoneId`.
Unit + Student → Progress (status) 1—* Submission (version n) 1—0..1 Feedback (tied to that version); group milestone → MilestoneArtifact (feedback + peer summary).
PeerCycle (per milestone) 1—* PeerEval (evaluator→evaluatee incl. self; locked). EffortLog / ContributionLog per student per milestone.
XPRule (JSON conditions) → XPEvent (auto/manual, with justification) → Rank. Project *—* Student with IPStatus + screening record + gate flags. Competition → CompEntry (marker, outcome). Notification, Celebration, AuditEntry (append-only).

## Sitemap
- **Shell**: top bar (wordmark · search / jump-to ⌘K · course chip · notifications bell · demo tools · role avatar chip) · sidebar (role pages, Prototype tour at the foot)
- **Instructor/Admin** — Home (hero + waiting-on-you strip, courses, queue, due this week). Teach: Course & outcomes (Basics | Matrix | Custom fields) · CA & tasks (task drawer: brief, rubric checklist, custom fields) · Gantt & plan · Resources · Group & peer (Roles | Cycles & weighting | Outlier review). Assess: Notification center · Grading queue (+ templates) · Analytics. Govern: IP screening · Competitions CMS · XP rule engine (Rules | Ranks | Ledger) · Audit log · Roles & access · Integrity lab
- **Student** — Home (hero + rank/status strip, modules, next up, latest feedback) · Quest map/Board (+ task drawer, upload) · Feedback · Peer review · Notifications (via the bell). Grow: XP & skills · Portfolio & IP · Competitions

## Key flows (all runnable)
1. **Task → completion**: assigned → submit (Uppy, checklist) → instructor feedback (rubric + annotations) → pass ⇒ complete ⇒ XP (json-rules-engine) ⇒ rank-up moment; revise ⇒ v2 with its own feedback.
2. **Group milestone**: rotate roles → members submit sub-tasks → feedback → peer cycle closes, outliers resolved → *publish merged artifact* → next milestone unlocks.
3. **IP gate**: project unscreened → blocked flags (explained) → instructor logs screening (note required) → flags allowed; filed/registered pays IP XP.
4. **Competition**: board filtered by enrolled courses → interested/applying → outcome log (forward only) → XP for entering.

## Phase 6 QA — how to verify
Instructor → **Integrity lab** → “Run all” (expects 14/14 blocked). Manual checks: drag a quest card to *Complete* (refused), edit a peer score (no UI path; locked), open a second tab and edit (rev conflict notice).

## Phase 6.5 / 7 prompts (to decide before real data)
Sign-off for a tool outside ERP · is this system’s mark authoritative or a working layer over ERP? · DPDP-Act storage/access for uploads, peer evaluations and IP details · consent-based volunteer pilot · pilot exit criteria fixed **before** the pilot (on-time rate, admin hours saved, satisfaction threshold).

## Visual QA (studio-wall redesign)
`docs/screenshots/` holds the four student hero states, the staff Home, and sample pages at 1440, 1280 and 390 px.
Checked on every page for both roles: no console errors, no horizontal page overflow, at most one vermilion primary action per screen, Integrity lab 14/14 blocked, closed-loop demo (grade → XP → rank-up) unchanged.
