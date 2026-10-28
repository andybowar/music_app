---
id: OPS-01
title: "Provision cloud environments"
phase: 0
wave: 1
stream: ops
size: S
status: todo
human_required: true
depends_on: []
blocks: ["OPS-03"]
owns: ["docs/ops/environments.md"]
touches: []
requirements: []
---

# OPS-01 · Provision cloud environments

> **Human required.** Agents: skip this task; it needs credentials or a person’s judgment.

**Goal.** Staging + production Supabase projects and Vercel project.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`

## Deliverables
- [ ] Two Supabase projects; private `resources` bucket in each
- [ ] Vercel project linked to repo; env vars set per environment
- [ ] Google + Microsoft OAuth apps created; redirect URLs registered
- [ ] docs/ops/environments.md (no secrets) listing what exists and who owns it

## Acceptance criteria
- [ ] Preview deploys build and reach staging DB
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `docs/ops/environments.md`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes
Needs account credentials — human task. Agents develop against local `supabase start` meanwhile.
