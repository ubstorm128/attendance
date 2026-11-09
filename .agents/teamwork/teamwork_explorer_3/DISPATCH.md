## 2026-11-09T17:27:40Z
You are an Explorer agent investigating the CodeRabbit setup and test verification harnesses for this project.

WORKING DIRECTORY: d:\OPW\Attendance\attendance
STATE FOLDER: d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_explorer_3
ORIGINAL REQUEST FILE: d:\OPW\Attendance\attendance\.agents\teamwork\ORIGINAL_REQUEST.md
SCOPE FILE: d:\OPW\Attendance\attendance\.agents\teamwork\orchestrator\SCOPE.md

MANDATORY FIRST STEP:
Read `d:\OPW\Attendance\attendance\.agents\teamwork\ORIGINAL_REQUEST.md` and `d:\OPW\Attendance\attendance\.agents\teamwork\orchestrator\SCOPE.md` before starting work.
Also check the CodeRabbit skill documentation at:
`C:\Users\sheik\.gemini\config\skills\code-review\SKILL.md`

YOUR SPECIFIC MISSION:
1. Check the local CodeRabbit CLI setup:
   - Run `coderabbit --version` or check if `cr` is installed.
   - Run `coderabbit auth status` or equivalent to see authentication state.
   - Document the exact commands to execute code reviews (e.g. `coderabbit review --agent` or `coderabbit review --plain`).
2. Check existing test and build infrastructure:
   - Inspect `package.json`, test scripts, dependencies, build scripts, linter/typecheck configs.
   - Run or inspect existing test commands (e.g. `npm test`, jest/mocha/playwright).
3. Determine how to verify the teacher QR code display fix programmatically:
   - Identify existing tests or propose a test / reproduction script to verify QR code generation and rendering without regressions.
4. Prepare a step-by-step verification and CodeRabbit review workflow for the Worker and Reviewers.

BOUNDARIES:
- Read-only investigation: DO NOT modify any code or files outside your state folder.
- DO NOT implement the fix yourself.

DELIVERABLE:
Write your structured findings and recommendations to:
`d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_explorer_3\handoff.md`
Then send a concise summary message with the path to your handoff report.
