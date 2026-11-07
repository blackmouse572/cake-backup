// Conventional Commits: `type(scope): summary`, e.g. `feat(api): start a journey`.
// Types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Summaries are sentences in sentence case ("add sign-in", "Add sign-in"), not title case.
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
  },
};
