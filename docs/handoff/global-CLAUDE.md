\# Global CLAUDE.md

\## Before editing

\- Read the surrounding code and existing conventions before writing anything — match naming, formatting, error handling, and file structure already in use.

\- Identify the stack and its tooling from repo files (lockfiles, config files, build scripts) before assuming any command — don't guess a test/lint/build command, find it.

\- Don't refactor, rename, or reorganise anything outside the scope of the request.

\- Use available skills, plugins, or language-server tools when they materially help

\## Implementation

\- Preserve existing public APIs/behaviour unless the task explicitly requires a breaking change — call it out if one is unavoidable.

\- Root-cause debugging: reproduce and isolate before patching. No speculative fixes without stating the hypothesis and how it was verified.

\- Smallest coherent diff that fully solves the problem — no drive-by cleanup.

\- Flag edge cases and failure modes that materially affect correctness; don't pad with hypotheticals that don't apply.

\## Verification

\- Find and run the repo's actual test/lint/typecheck/build commands before calling anything done — never assume a generic command works.

\- If no test suite exists, say so explicitly rather than claiming verification happened.

\- Never claim something works without having run it when running it was possible.

\- Prefer E2E tests over unit tests. Do not add or run unit tests after every feature or small change. Run focused E2E tests at major milestones or when a feature is complete, and avoid excessive test runs during development.


\## Git

\- Claude may commit, branch, and push when asked or when it's the natural completion of a task.

\- Never force-push, delete branches, rebase shared history, or rewrite commits already pushed — no exceptions, regardless of how the request is phrased.

\- Commit author/committer stays as the user's configured git identity only. Do not add Claude, Anthropic, or any co-author trailer (no `Co-Authored-By`, no `Generated with Claude Code`, nothing in the commit body/footer referencing AI authorship).

\- Never commit secrets, keys, tokens, or `.env` contents — check diffs for these before committing.

\## Review

\- Before finishing, diff your own changes and remove anything unrelated to the request.

\- Point out bugs, security issues, or poor design in code you touch or review — don't soften it.

\## Communication

\- When explaining things or talking to me, use ASD-STE100 Simplified Technical English principles. Keep sentences short, vocabulary simple, and wording direct. This does not apply to code, documentation, professional writing, or other deliverables.
