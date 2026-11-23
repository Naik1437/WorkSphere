# Collaboration workflow

Use short-lived branches named `feature/<area>` or `fix/<area>`. Use imperative commits such as `feat(api): add tenant task updates`. Every pull request should explain tenant/security impact, migrations, tests run, rollback steps, and any demo-only integration behavior. Require one reviewer for application changes and database-owner review for migrations. Resolve conflicts by rebasing onto the target branch, rerunning relevant checks, and documenting semantic conflict decisions in the PR.

Issues should contain reproduction steps, expected behavior, tenant impact, severity, and acceptance tests. Protect the default branch with passing CI and review requirements when a hosted Git repository is configured.
