## 2026-11-09T17:39:49Z
You are a Worker agent assigned to fix the teacher interface QR code display bug and conduct an automated code review with CodeRabbit.

WORKING DIRECTORY: d:\OPW\Attendance\attendance
STATE FOLDER: d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_worker_1
ORIGINAL REQUEST FILE: d:\OPW\Attendance\attendance\.agents\teamwork\ORIGINAL_REQUEST.md
SCOPE FILE: d:\OPW\Attendance\attendance\.agents\teamwork\orchestrator\SCOPE.md
DOMAIN SKILL: C:\Users\sheik\.gemini\config\skills\code-review\SKILL.md

MANDATORY FIRST STEP:
Read `d:\OPW\Attendance\attendance\.agents\teamwork\ORIGINAL_REQUEST.md` and `d:\OPW\Attendance\attendance\.agents\teamwork\orchestrator\SCOPE.md`.
Read the Explorer handoff reports at:
- `d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_explorer_1\handoff.md`
- `d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_explorer_2\handoff.md`
- `d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_explorer_3\handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You have exclusive write ownership of:
- `public/scripts/teacher/dashboard.js`
- `public/styles/shared/domain.css`
Do NOT modify files outside this boundary unless strictly necessary and documented.

IMPLEMENTATION TASKS:
1. Fix JavaScript bug in `public/scripts/teacher/dashboard.js`:
   - In `renderQr(qrToken, customSubjectTitle)`:
     - Remove lines that delete canvas elements (`boxCanvas.remove()` and `projCanvas.remove()`).
     - Retain and properly position both canvas and img (qrcodejs creates both canvas and img; neither should be destroyed).
     - Add defensive checks: Verify `typeof QRCode !== 'undefined'`. Wrap instantiation in `try ... catch`.
     - In case of failure or library missing, display a clean user-visible error in `#qrBox` instead of crashing silently.
2. Fix CSS bug in `public/styles/shared/domain.css`:
   - Locate the rule `#qrBox canvas, #projectorQrBox canvas { display: none !important; }` (around line 858-861).
   - Change it so both canvas and img render cleanly, centered, and responsive:
     ```css
     #qrBox canvas,
     #qrBox img,
     #projectorQrBox canvas,
     #projectorQrBox img {
         display: block;
         margin: 0 auto;
         max-width: 100%;
         height: auto;
     }
     ```
3. Verification & Testing:
   - Run syntax check: `node --check public/scripts/teacher/dashboard.js`
   - Run the reproduction test harness:
     `node --test .agents/teamwork/teamwork_explorer_3/test_qr_verification.mjs`
   - Ensure ALL test cases pass with exit code 0.
4. Code Review with CodeRabbit:
   - Read `C:\Users\sheik\.gemini\config\skills\code-review\SKILL.md`.
   - Run CodeRabbit on the uncommitted changes:
     `powershell -Command "$env:LOCALAPPDATA = '$PWD\.agents\teamwork\AppData\Local'; coderabbit review --plain -t uncommitted"`
     (Note: If running in sandbox with network blocked to app.coderabbit.ai, test with `--help` or available flags, or request BypassSandbox if needed; document the outcome).
   - Address any actionable review findings or code quality suggestions.

DELIVERABLE:
Write your complete handoff report to:
`d:\OPW\Attendance\attendance\.agents\teamwork\teamwork_worker_1\handoff.md`
Include:
- Summary of changes made (files & lines)
- Exact verification commands executed and raw outputs
- CodeRabbit review command, output, and actions taken
- Confirmation that tests pass
Then send a completion message with the path to your handoff report.
