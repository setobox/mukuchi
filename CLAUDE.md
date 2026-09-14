<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project uses Vite+ for runtime and package management, builds, tests, task execution, and Git hook dispatch. ESLint is the only linting and formatting tool; its rules are defined in `eslint.config.js`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

Use `vp run check` for ESLint and TypeScript checks, and `vp run lint:fix` for automatic fixes. Do not use `vp check`, `vp lint`, or `vp fmt`; those built-ins do not run ESLint. The pre-commit hook runs `vp staged`, whose configured command is ESLint. Keep `prepare` set to `vp config --no-agent` so dependency installation preserves these project instructions.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp run check` and `vp run -r test` to lint, type check, and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
