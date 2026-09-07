---
name: new-feature
description: Turn a feature idea into a well-refined GitHub enhancement issue for Ronja.js. Asks clarifying questions about who benefits, what they want, and why, then drafts a simple user-story issue (As a / I want / So that) with acceptance criteria and opens it via `gh issue create` after the user confirms. Use when the user wants to file, draft, or write up a feature request, enhancement, or new capability idea for this repo — not for bug reports.
---

# new-feature

Helps the user turn a rough idea into a refined GitHub enhancement issue, following a simple
user-story pattern. Do not create the issue until the user has explicitly confirmed the draft.

## 1. Capture the idea

Take whatever the user already said (via `$ARGUMENTS` or the conversation) as the starting point.
If it's just a one-liner or vague, that's fine — refinement happens next.

## 2. Refine with questions

Ask questions one topic at a time (AskUserQuestion is a good fit for the multiple-choice ones)
until you have enough to write a solid story. Don't ask about things you can already infer from
the idea or from context — skip straight to what's actually unclear. At minimum, resolve:

- **Who** benefits — which persona is asking for this? For this bot that's usually one of: a
  guild member/player, a server admin/mod, or the guild as a whole. Pick from
  [CLAUDE.md](../../CLAUDE.md)'s feature list (dynamic channels, `/lfg`, `/top10`, ical feeds,
  server profiles) if it helps ground the persona, but don't force a fit if the idea is something
  new.
- **What** they want — the actual capability or behavior, concretely enough that someone could
  build it without guessing.
- **Why** — the benefit or problem this solves. If the user only gave you the "what," ask for the
  "why" explicitly; a story without motivation is hard to prioritize later.
- **Acceptance criteria** — 2-5 concrete, checkable conditions for "this is done." Propose a first
  draft yourself based on the story and let the user correct it, rather than asking them to write
  it from scratch.
- **Scope boundaries** — anything explicitly out of scope worth noting, if it's likely to come up
  (e.g. "web dashboard" ideas often need a note that this is a single-guild Discord bot, not a web
  app).

Keep this conversational — a couple of rounds of questions, not a form to fill out.

## 3. Draft the issue

Write the issue body in this shape:

```markdown
## User Story

As a **<role>**, I want **<capability>**, so that **<benefit>**.

## Description

<1-3 sentences of context — only if the story alone doesn't carry enough detail. Skip this
section entirely if it would just restate the user story.>

## Acceptance Criteria

- [ ] ...
- [ ] ...

## Out of Scope

<Only include this section if something is worth explicitly excluding.>
```

Keep the title short and action-oriented (not just a copy of the "I want" clause verbatim).

## 4. Confirm before publishing

Show the user the drafted title + body and ask them to confirm or request changes. Creating a
GitHub issue is visible to the rest of the repo's collaborators — never skip this confirmation
step, even if the refinement conversation felt conclusive.

## 5. Create the issue

Once confirmed, run:

```bash
gh issue create --title "<title>" --label enhancement --body "$(cat <<'EOF'
<body>
EOF
)"
```

`enhancement` already exists as a label in this repo — no need to create it. Report the returned
issue URL back to the user.
