# Handoff Report: Teacher Interface QR Code Display Bug Investigation

## 1. Observation

### 1.1 Responsible Files and DOM Structure
- **HTML Template**: `public/pages/teacher/dashboard.html`
  - **Script Inclusion** (line 8):
    ```html
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    ```
  - **Dashboard QR Stage DOM Structure** (lines 234–270):
    ```html
    <div class="qr-shell" id="qrShell">
        <div class="qr-placeholder" id="qrPlaceholder">
            <svg viewBox="0 0 24 24" fill="none" width="48" height="48">...</svg>
            Choose a course subject from the dropdown and click Start Session to project the QR code for students.
        </div>

        <div class="qr-live" id="qrLive" hidden>
            <div id="qrBox"></div>
            <div class="qr-meta">
                <p class="subject-name" id="qrSubjectName"></p>
                <p class="expiry" id="qrHint" hidden>
                    <span class="dot-live"></span>
                    Students scan with camera to check in
                </p>
            </div>
            <div class="qr-controls-row">
                <button class="secondary btn btn-primary" id="expandQrBtn" onclick="openProjectorModal()">
                    ... Projector Mode
                </button>
            </div>
        </div>
    </div>
    ```
  - **Projector Modal Stage DOM Structure** (lines 391–407):
    ```html
    <div id="projectorModal" class="projector-modal" hidden>
        <button class="projector-close btn btn-primary" onclick="closeProjectorModal()" aria-label="Exit Projector Mode">
            ...
        </button>
        <h2 class="projector-title" id="projectorSubjectTitle">CS-204 Data Structures</h2>
        <div class="projector-qr-container">
            <div id="projectorQrBox"></div>
        </div>
        <p class="projector-subtitle">
            <span class="dot-live"></span>
            Scan with your smartphone camera to mark attendance · <span id="projectorCount">0</span> marked present
        </p>
    </div>
    ```
  - **Script Tag** (line 409):
    ```html
    <script src="/scripts/teacher/dashboard.js"></script>
    ```

### 1.2 JavaScript Implementation
- **Client Script**: `public/scripts/teacher/dashboard.js`
  - **Function `renderQr`** (lines 1298–1364):
    ```javascript
    function renderQr(qrToken, customSubjectTitle) {
        const box = document.getElementById('qrBox');
        const shell = document.getElementById('qrShell');
        const placeholder = document.getElementById('qrPlaceholder');
        const live = document.getElementById('qrLive');
        const statusPill = document.getElementById('qrStatusPill');
        const projBox = document.getElementById('projectorQrBox');

        box.innerHTML = '';
        if (projBox) projBox.innerHTML = '';
        document.getElementById('qrHint').hidden = true;

        if (!qrToken) {
            shell.classList.remove('live');
            placeholder.hidden = false;
            live.hidden = true;
            if (statusPill) {
                statusPill.textContent = 'Idle';
                statusPill.classList.remove('is-active');
                statusPill.classList.add('is-idle');
            }
            stopSessionTimer();
            return;
        }

        const url = `${location.origin}/student.html?token=${qrToken}`;
        new QRCode(box, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#1D1D1F',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        const boxCanvas = box.querySelector('canvas');
        if (boxCanvas) boxCanvas.remove();

        if (projBox) {
            new QRCode(projBox, {
                text: url,
                width: 320,
                height: 320,
                colorDark: '#1D1D1F',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            const projCanvas = projBox.querySelector('canvas');
            if (projCanvas) projCanvas.remove();
        }

        const subjectVal = (customSubjectTitle || document.getElementById('subject').value || (currentSelectedSubject ? currentSelectedSubject.name : '') || 'Class Session').trim();
        document.getElementById('subject').value = subjectVal;
        document.getElementById('qrSubjectName').textContent = subjectVal;
        const projTitle = document.getElementById('projectorSubjectTitle');
        if (projTitle) projTitle.textContent = subjectVal;

        document.getElementById('qrHint').hidden = false;
        shell.classList.add('live');
        placeholder.hidden = true;
        live.hidden = false;

        if (statusPill) {
            statusPill.textContent = 'Active';
            statusPill.classList.remove('is-idle');
            statusPill.classList.add('is-active');
        }
    }
    ```
  - **Calls to `renderQr`**:
    - Line 1396: in `generateSession()` upon receiving `data.qrToken` from `POST /api/start-session`.
    - Line 1417: in `closeSession()` passing `null`.
    - Line 1445: in `connectStream()` SSE `new-session` event (`data.session.qrToken, data.session.subject`).
    - Line 1453: in `connectStream()` SSE `closed` event (`null`).
    - Line 1468: in `connectStream()` SSE `init` event (`data.session.active ? data.session.qrToken : null, data.session.subject`).

### 1.3 Stylesheet Rules
- **CSS File**: `public/styles/shared/domain.css`
  - Lines 858–867:
    ```css
    #qrBox canvas,
    #projectorQrBox canvas {
        display: none !important;
    }

    #qrBox img,
    #projectorQrBox img {
        display: block;
        margin: 0 auto;
    }
    ```

### 1.4 Git Commit History
- Git commit `b6c6bb7f41fdd7e7d49551240074e97285d3123f` ("minor fixes"):
  ```diff
  diff --git a/public/scripts/teacher/dashboard.js b/public/scripts/teacher/dashboard.js
  @@ -1292,6 +1292,8 @@
                   correctLevel: QRCode.CorrectLevel.M
               });
  +            const boxCanvas = box.querySelector('canvas');
  +            if (boxCanvas) boxCanvas.remove();
   
               if (projBox) {
                   new QRCode(projBox, {
  @@ -1302,6 +1304,8 @@
                       correctLevel: QRCode.CorrectLevel.H
                   });
  +                const projCanvas = projBox.querySelector('canvas');
  +                if (projCanvas) projCanvas.remove();
               }
  ```
- Git commit `c8c8a9a02757a16cc9a906cd959cb63efe4187fa` ("kuch toh galat tha wo thik kiya he"):
  ```diff
  +        #qrBox canvas,
  +        #projectorQrBox canvas {
  +            display: none !important;
  +        }
  +
           #qrBox img,
  -        #qrBox canvas {
  +        #projectorQrBox img {
               display: block !important;
               margin: 0 auto;
           }
  ```

---

## 2. Logic Chain

1. **`qrcodejs` Rendering Mechanism**:
   - When `new QRCode(container, options)` is invoked in a standard browser, David Shim's `qrcode.js` library instantiates a `Drawing` instance.
   - `Drawing` creates two DOM nodes inside the container element:
     1. An HTML5 `<canvas>` element (`this._elCanvas`).
     2. An `<img>` element (`this._elImage`), configured initially with inline style `style="display: none;"`.
   - `Drawing.prototype.draw` paints the QR code modules directly onto `this._elCanvas`.
   - After painting, `Drawing.prototype.makeImage` triggers `_safeSetDataURI.call(this, _onMakeImage)`.
   - In `_safeSetDataURI`, the library tests whether the browser supports Data URIs by creating an off-screen image element with a 1x1 GIF Data URI and waiting for its `onload` event.
   - Only after `onload` resolves does `_onMakeImage` execute:
     ```javascript
     function _onMakeImage() {
         this._elImage.src = this._elCanvas.toDataURL("image/png");
         this._elImage.style.display = "block";
         this._elCanvas.style.display = "none";
     }
     ```

2. **The JavaScript Destruction Step**:
   - As observed in `public/scripts/teacher/dashboard.js` lines 1332–1333 (`boxCanvas.remove()`) and lines 1344–1345 (`projCanvas.remove()`), immediately after `new QRCode(...)` is called synchronously, the script queries `box.querySelector('canvas')` and invokes `.remove()`.
   - This physically removes the rendered `<canvas>` element from the DOM tree before `toDataURL` or rendering pipeline paint occurs.

3. **The CSS Suppression Step**:
   - As observed in `public/styles/shared/domain.css` lines 858–861:
     ```css
     #qrBox canvas,
     #projectorQrBox canvas {
         display: none !important;
     }
     ```
   - Even if the canvas elements were left in the DOM, this CSS rule forcefully suppresses them with `display: none !important;`.

4. **The Consequence on Image Display**:
   - At the time `renderQr` executes synchronously:
     - The `<canvas>` is removed or hidden.
     - The `<img>` element in the container still has `src=""` (empty) because the asynchronous `_safeSetDataURI` probe has not yet resolved.
     - Because `boxCanvas` is removed from the DOM before `_onMakeImage` can extract `this._elCanvas.toDataURL("image/png")`, the fallback `<img>` either never receives a data URL or fails to convert.
     - Even if `_onMakeImage` attempts conversion, in many browser security and sandbox contexts, detached canvas elements fail or return blank image data.
   - The result: **No QR code appears** in either `#qrBox` (the live dashboard card) or `#projectorQrBox` (the projector modal).

5. **Historical Cause for the Code Pattern**:
   - Prior to commit `c8c8a9a0`, the developer had written `#qrBox img, #qrBox canvas { display: block !important; }`. Because `!important` overrode `qrcodejs`'s internal inline style `style="display: none;"` on the `<img>` tag, both the canvas and image were displayed simultaneously (duplicate QR code).
   - Attempting to fix the duplicate without understanding `qrcodejs`, the developer first added `display: none !important;` to the canvas in CSS (`c8c8a9a0`), and then added `boxCanvas.remove()` in JavaScript (`b6c6bb7f`).
   - This destroyed the canvas entirely and prevented any visual rendering.

6. **Defensive Error Handling Gap**:
   - In `public/scripts/teacher/dashboard.js` lines 1324–1346:
     - `new QRCode(...)` is called directly without checking if `typeof QRCode !== 'undefined'`.
     - If the CDN script (`https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`) fails to load (offline development, corporate firewalls, CDN outage), an unhandled `ReferenceError: QRCode is not defined` is thrown.
     - This unhandled exception crashes `renderQr()` before lines 1354–1357:
       ```javascript
       document.getElementById('qrHint').hidden = false;
       shell.classList.add('live');
       placeholder.hidden = true;
       live.hidden = false;
       ```
     - The UI remains permanently frozen on `#qrPlaceholder` ("Choose a course subject from the dropdown and click Start Session to project the QR code for students."), with the status pill stuck at "Idle".

---

## 3. Caveats

1. **CDN Script Availability**:
   - The HTML template relies on `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`. In air-gapped or offline test environments where external CDNs are inaccessible, the script tag will fail unless either a local copy is served or the environment provides internet access. Adding defensive error handling in `renderQr` ensures graceful error presentation if the CDN is unreachable.
2. **Backend QR Token Generation**:
   - This investigation is scoped to the frontend teacher interface files (`public/scripts/teacher` and `public/pages/teacher`). Backend token emission (`/api/start-session` and `/api/stream`) was examined to confirm that `data.qrToken` is supplied and correctly routed into `renderQr(data.qrToken)`. Explorer 2 is conducting the full backend audit.
3. **No Code Modification Boundary**:
   - Per investigator instructions, no production source code has been altered during this analysis.

---

## 4. Conclusion

The bug preventing the QR code from appearing in the teacher interface has two direct and interdependent root causes:

1. **Destructive Canvas Removal in JavaScript**:
   - File: `public/scripts/teacher/dashboard.js` (lines 1332–1333 and 1344–1345).
   - `boxCanvas.remove()` and `projCanvas.remove()` explicitly delete the `<canvas>` element rendered by `qrcodejs` from the DOM immediately after initialization.
2. **Hard CSS Visibility Suppression**:
   - File: `public/styles/shared/domain.css` (lines 858–861).
   - `#qrBox canvas, #projectorQrBox canvas { display: none !important; }` forcibly hides the canvas even if retained.
3. **Missing Defensive Guard**:
   - File: `public/scripts/teacher/dashboard.js` (lines 1324–1346).
   - Lack of `typeof QRCode === 'undefined'` guard and `try...catch` wrapper causes `renderQr` to fail fatally if the library is not loaded.

### Proposed Fix Strategy

#### 1. In `public/scripts/teacher/dashboard.js`:
Modify `renderQr(qrToken, customSubjectTitle)` (around line 1320):
- **Remove** lines 1332–1333:
  ```javascript
  const boxCanvas = box.querySelector('canvas');
  if (boxCanvas) boxCanvas.remove();
  ```
- **Remove** lines 1344–1345:
  ```javascript
  const projCanvas = projBox.querySelector('canvas');
  if (projCanvas) projCanvas.remove();
  ```
- **Add** defensive check and `try...catch` wrapper:
  ```javascript
  if (typeof QRCode === 'undefined') {
      console.error('QRCode library is not loaded');
      box.innerHTML = '<div class="qr-error" style="color: var(--danger, #dc2626); padding: 16px; font-size: 13px;">QR code library failed to load. Please check your connection and refresh.</div>';
      if (projBox) {
          projBox.innerHTML = '<div class="qr-error" style="color: var(--danger, #dc2626); padding: 16px; font-size: 16px;">QR code library failed to load.</div>';
      }
      shell.classList.add('live');
      placeholder.hidden = true;
      live.hidden = false;
      if (statusPill) {
          statusPill.textContent = 'Error';
          statusPill.classList.remove('is-idle');
          statusPill.classList.add('is-active');
      }
      return;
  }

  try {
      new QRCode(box, {
          text: url,
          width: 200,
          height: 200,
          colorDark: '#1D1D1F',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
      });

      if (projBox) {
          new QRCode(projBox, {
              text: url,
              width: 320,
              height: 320,
              colorDark: '#1D1D1F',
              colorLight: '#ffffff',
              correctLevel: QRCode.CorrectLevel.H
          });
      }
  } catch (err) {
      console.error('Failed to generate QR code:', err);
      box.innerHTML = '<div class="qr-error" style="color: var(--danger, #dc2626); padding: 16px; font-size: 13px;">Failed to render QR code.</div>';
  }
  ```

#### 2. In `public/styles/shared/domain.css`:
Replace lines 858–867:
```css
/* Before */
#qrBox canvas,
#projectorQrBox canvas {
    display: none !important;
}

#qrBox img,
#projectorQrBox img {
    display: block;
    margin: 0 auto;
}
```
With:
```css
/* After */
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
*(By omitting `!important`, `qrcodejs`'s built-in inline `style="display: none;"` is respected, ensuring only the active rendering format is displayed without duplicate rendering, and both `<canvas>` and `<img>` scale cleanly.)*

---

## 5. Verification Method

### 5.1 Verification Commands
Run the automated verification suite using Node's built-in test runner:
```powershell
node --test .agents/teamwork/teamwork_explorer_3/test_qr_verification.mjs
```

### 5.2 Verification Criteria
1. **DOM Elements Test**: Passes when `#qrShell`, `#qrPlaceholder`, `#qrLive`, `#qrBox`, `#qrSubjectName`, `#qrHint`, `#projectorQrBox`, and `#projectorModal` exist in `public/pages/teacher/dashboard.html`.
2. **CSS Test**: Passes when `domain.css` does NOT contain `display: none !important` targeting `#qrBox canvas` or `#projectorQrBox canvas`.
3. **JS Canvas Removal Test**: Passes when `dashboard.js` does NOT execute `boxCanvas.remove()` or `projCanvas.remove()`.
4. **Defensive Error Handling Test**: Passes when `renderQr()` in `dashboard.js` checks `typeof QRCode` and wraps generation in `try...catch`.
5. **UI State Transitions**: When `renderQr('test-token')` runs:
   - `#qrPlaceholder.hidden === true`
   - `#qrLive.hidden === false`
   - `#qrStatusPill.textContent === 'Active'`
   - `#qrBox` contains the visible rendered `<canvas>`
   - `#projectorQrBox` contains the visible rendered `<canvas>`

### 5.3 Invalidation Conditions
- If `boxCanvas.remove()` remains in `dashboard.js`, canvas will be deleted and the test fails.
- If `#qrBox canvas { display: none !important; }` remains in `domain.css`, canvas is hidden and the test fails.
- If `QRCode` library fails to load and no defensive check exists, `ReferenceError` crashes execution and the test fails.
