import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as cheerio from 'cheerio';

const ROOT_DIR = path.resolve('.');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'pages', 'teacher', 'dashboard.html');
const JS_PATH = path.join(ROOT_DIR, 'public', 'scripts', 'teacher', 'dashboard.js');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'styles', 'shared', 'domain.css');

// --- Mock DOM Implementation for Node VM ---
class MockClassList {
    constructor() {
        this._classes = new Set();
    }
    add(...classes) {
        classes.forEach(c => {
            if (c) this._classes.add(c);
        });
    }
    remove(...classes) {
        classes.forEach(c => {
            if (c) this._classes.delete(c);
        });
    }
    contains(c) {
        return this._classes.has(c);
    }
    toggle(c, force) {
        if (force === true) { this._classes.add(c); return true; }
        if (force === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c);
        return true;
    }
    toString() {
        return Array.from(this._classes).join(' ');
    }
}

class MockElement {
    constructor(tagName, id = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.classList = new MockClassList();
        this.attributes = new Map();
        this.style = {};
        this.children = [];
        this.childNodes = this.children;
        this._textContent = '';
        this._value = '';
        this._hidden = false;
        this.parentElement = null;
    }

    get className() {
        return this.classList.toString();
    }
    set className(val) {
        this.classList._classes.clear();
        if (val) {
            val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
        }
    }

    get hidden() {
        return this.attributes.has('hidden') || this._hidden === true;
    }
    set hidden(val) {
        this._hidden = Boolean(val);
        if (val) {
            this.attributes.set('hidden', '');
        } else {
            this.attributes.delete('hidden');
        }
    }

    get textContent() {
        return this._textContent;
    }
    set textContent(val) {
        this._textContent = String(val);
        this.children = [];
        this.childNodes = this.children;
    }

    get value() {
        return this._value;
    }
    set value(val) {
        this._value = String(val);
    }

    get innerHTML() {
        if (this.children.length === 0) return this._innerHTML || '';
        return this.children.map(c => `<${c.tagName.toLowerCase()}${c.id ? ` id="${c.id}"` : ''}></${c.tagName.toLowerCase()}>`).join('');
    }
    set innerHTML(val) {
        this._innerHTML = String(val);
        this.children = [];
        this.childNodes = this.children;
        if (!val) return;
        if (val.includes('class="qr-error"')) {
            const div = new MockElement('div');
            div.classList.add('qr-error');
            div.textContent = val.replace(/<[^>]+>/g, '').trim();
            this.appendChild(div);
        }
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
        }
        return child;
    }

    remove() {
        if (this.parentElement) {
            this.parentElement.removeChild(this);
        }
    }

    querySelector(selector) {
        const sel = selector.toLowerCase();
        for (const child of this.children) {
            if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) return child;
            if (sel.startsWith('#') && child.id === sel.slice(1)) return child;
            if (child.tagName.toLowerCase() === sel) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const sel = selector.toLowerCase();
        for (const child of this.children) {
            if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) results.push(child);
            else if (sel.startsWith('#') && child.id === sel.slice(1)) results.push(child);
            else if (child.tagName.toLowerCase() === sel) results.push(child);
            results.push(...child.querySelectorAll(selector));
        }
        return results;
    }
}

// Mock QRCode library mimicking qrcodejs (creates 1 canvas + 1 img)
class MockQRCode {
    constructor(el, options = {}) {
        this.el = el;
        this.options = options;
        if (options.shouldThrow) {
            throw new Error('QRCode capacity overflow or generation error');
        }
        const canvas = new MockElement('canvas');
        canvas.width = options.width || 200;
        canvas.height = options.height || 200;
        canvas.style.display = 'block';

        const img = new MockElement('img');
        img.src = `data:image/png;base64,mock_${options.text || ''}`;
        img.style.display = 'none';

        el.appendChild(canvas);
        el.appendChild(img);
    }
}
MockQRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

// Factory to build an isolated test environment with real dashboard.js
function createTestEnvironment(options = {}) {
    const customQRCode = options.customQRCode !== undefined ? options.customQRCode : MockQRCode;
    const omitElements = new Set(options.omitElements || []);

    const elements = new Map();
    function getOrCreate(id, tag = 'div') {
        if (omitElements.has(id)) return null;
        if (!elements.has(id)) {
            const el = new MockElement(tag, id);
            elements.set(id, el);
        }
        return elements.get(id);
    }

    // Initialize required DOM nodes matching dashboard.html
    const qrShell = getOrCreate('qrShell');
    const qrPlaceholder = getOrCreate('qrPlaceholder');
    const qrLive = getOrCreate('qrLive');
    if (qrLive) qrLive.hidden = true;
    const qrBox = getOrCreate('qrBox');
    const projectorQrBox = getOrCreate('projectorQrBox');
    const qrStatusPill = getOrCreate('qrStatusPill', 'span');
    if (qrStatusPill) {
        qrStatusPill.className = 'count-pill is-idle';
        qrStatusPill.textContent = 'Idle';
    }
    const qrHint = getOrCreate('qrHint', 'p');
    if (qrHint) qrHint.hidden = true;
    const subject = getOrCreate('subject', 'input');
    const qrSubjectName = getOrCreate('qrSubjectName', 'p');
    const projectorSubjectTitle = getOrCreate('projectorSubjectTitle', 'h2');
    const statSessionDot = getOrCreate('statSessionDot');
    const statSessions = getOrCreate('statSessions');
    if (statSessions) statSessions.textContent = '0';
    const statSessionStatusText = getOrCreate('statSessionStatusText');
    const projectorModal = getOrCreate('projectorModal');
    if (projectorModal) projectorModal.hidden = true;

    // Load actual dashboard.js code
    const jsSource = fs.readFileSync(JS_PATH, 'utf8');

    const sandbox = {
        document: {
            getElementById: (id) => elements.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            createElement: (tag) => new MockElement(tag)
        },
        window: {},
        location: { origin: 'https://attendance.school.edu' },
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        },
        fetch: () => Promise.resolve({ ok: false }),
        QRCode: customQRCode,
        console: {
            log: () => {},
            warn: () => {},
            error: () => {}
        },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(jsSource, sandbox);

    return {
        sandbox,
        elements: {
            qrShell,
            qrPlaceholder,
            qrLive,
            qrBox,
            projectorQrBox,
            qrStatusPill,
            qrHint,
            subject,
            qrSubjectName,
            projectorSubjectTitle,
            statSessionDot,
            statSessions,
            statSessionStatusText,
            projectorModal
        }
    };
}

// =============================================================================
// TEST SUITE: LIFECYCLE, CONCURRENCY & CSS ADVERSARIAL STRESS TESTS
// =============================================================================

test('ADVERSARIAL SUITE 1: Rapid Consecutive Re-Renders (Sync and Async)', async (t) => {
    await t.test('1.1 - 100 Synchronous Consecutive Re-renders: Zero DOM bloat or runaway canvases', () => {
        const { sandbox, elements } = createTestEnvironment();
        const { qrBox, projectorQrBox, qrStatusPill, qrSubjectName, qrShell, qrPlaceholder, qrLive, qrHint } = elements;

        // Perform 100 rapid synchronous re-renders
        for (let i = 1; i <= 100; i++) {
            sandbox.renderQr(`session-token-${i}`, `Course 10${i}`);

            // Invariant check at EVERY iteration:
            // 1. #qrBox must contain exactly 2 children (1 canvas, 1 img) - never accumulating!
            assert.equal(qrBox.children.length, 2, `Iteration ${i}: #qrBox leaked elements! Count: ${qrBox.children.length}`);
            assert.equal(qrBox.children[0].tagName, 'CANVAS', `Iteration ${i}: first child must be canvas`);
            assert.equal(qrBox.children[1].tagName, 'IMG', `Iteration ${i}: second child must be img`);

            // 2. #projectorQrBox must contain exactly 2 children
            assert.equal(projectorQrBox.children.length, 2, `Iteration ${i}: #projectorQrBox leaked elements!`);
            assert.equal(projectorQrBox.children[0].tagName, 'CANVAS');
            assert.equal(projectorQrBox.children[1].tagName, 'IMG');

            // 3. UI state flags must reflect active live state
            assert.equal(qrShell.classList.contains('live'), true, `Iteration ${i}: shell must have live class`);
            assert.equal(qrPlaceholder.hidden, true, `Iteration ${i}: placeholder must be hidden`);
            assert.equal(qrLive.hidden, false, `Iteration ${i}: live container must be visible`);
            assert.equal(qrHint.hidden, false, `Iteration ${i}: hint must be visible`);
            assert.equal(qrStatusPill.textContent, 'Active');
            assert.equal(qrStatusPill.classList.contains('is-active'), true);
            assert.equal(qrStatusPill.classList.contains('is-idle'), false);
        }

        // Final assertion after 100 renders
        assert.equal(qrSubjectName.textContent, 'Course 10100', 'Subject name must match final render');
        assert.equal(qrBox.children.length, 2, 'Final #qrBox element count must remain strictly bounded at 2');
        assert.equal(projectorQrBox.children.length, 2, 'Final #projectorQrBox count must remain strictly bounded at 2');
    });

    await t.test('1.2 - 100 Asynchronous Succession Re-renders: Interleaved microtasks & event loops', async () => {
        const { sandbox, elements } = createTestEnvironment();
        const { qrBox, projectorQrBox, qrStatusPill, qrSubjectName } = elements;

        // Simulate rapid async dispatch (e.g. Server-Sent Events arrival barrage)
        const promises = [];
        for (let i = 1; i <= 100; i++) {
            promises.push((async (index) => {
                // Introduce microtask and macrotask jitter
                if (index % 2 === 0) await Promise.resolve();
                if (index % 5 === 0) await new Promise(res => setTimeout(res, 0));
                sandbox.renderQr(`async-token-${index}`, `Async Course ${index}`);
            })(i));
        }

        await Promise.all(promises);

        // After all 100 asynchronous updates resolve:
        assert.equal(qrBox.children.length, 2, `Async succession caused DOM bloat in #qrBox! Count: ${qrBox.children.length}`);
        assert.equal(projectorQrBox.children.length, 2, `Async succession caused DOM bloat in #projectorQrBox!`);
        assert.equal(qrStatusPill.textContent, 'Active');
        assert.equal(qrStatusPill.classList.contains('is-active'), true);
        assert.ok(qrSubjectName.textContent.startsWith('Async Course'));
    });

    await t.test('1.3 - 100 Rapid Asynchronous Stream Lifecycle Events (SSE Chaos Barrage)', async () => {
        const { sandbox, elements } = createTestEnvironment();
        const { qrBox, projectorQrBox, qrStatusPill, qrShell, qrPlaceholder, qrLive } = elements;

        // Simulate rapid incoming EventSource stream messages (new-session, closed)
        const events = [];
        for (let i = 1; i <= 100; i++) {
            if (i % 7 === 0) {
                events.push({ type: 'closed', token: null });
            } else {
                events.push({ type: 'new-session', token: `stream-token-${i}`, subject: `Stream Course ${i}` });
            }
        }

        // Dispatch all 100 events in rapid asynchronous succession with microtask delays
        for (const evt of events) {
            await Promise.resolve();
            if (evt.type === 'closed') {
                sandbox.renderQr(null);
            } else {
                sandbox.renderQr(evt.token, evt.subject);
            }
        }

        // Verify final state matches the 100th event
        const lastEvt = events[events.length - 1];
        if (lastEvt.type === 'closed') {
            assert.equal(qrBox.children.length, 0, 'qrBox should be empty on closed');
            assert.equal(qrStatusPill.textContent, 'Idle');
            assert.equal(qrPlaceholder.hidden, false);
            assert.equal(qrLive.hidden, true);
        } else {
            assert.equal(qrBox.children.length, 2, 'qrBox must contain exactly 2 children (canvas + img)');
            assert.equal(projectorQrBox.children.length, 2, 'projectorQrBox must contain exactly 2 children');
            assert.equal(qrStatusPill.textContent, 'Active');
            assert.equal(qrPlaceholder.hidden, true);
            assert.equal(qrLive.hidden, false);
            assert.equal(qrShell.classList.contains('live'), true);
        }
    });

    await t.test('1.4 - Adversarial Payloads & Error Handling during QRCode Generation', () => {
        // QRCode that throws on oversized or invalid tokens
        class FragileQRCode {
            constructor(el, opts) {
                if (opts.text.includes('FAIL_TRIGGER')) {
                    throw new Error('Code length overflow: Payload exceeds QR capacity');
                }
                const canvas = new MockElement('canvas');
                el.appendChild(canvas);
            }
        }
        FragileQRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

        const { sandbox, elements } = createTestEnvironment({ customQRCode: FragileQRCode });
        const { qrBox, projectorQrBox, qrStatusPill, qrLive, qrPlaceholder } = elements;

        // Trigger error
        sandbox.renderQr('FAIL_TRIGGER_VERY_LARGE_DATA_1234567890');

        assert.equal(qrStatusPill.textContent, 'Error', 'Status pill must indicate Error');
        assert.equal(qrStatusPill.classList.contains('is-active'), true);
        assert.equal(qrStatusPill.classList.contains('is-idle'), false);
        assert.equal(qrPlaceholder.hidden, true);
        assert.equal(qrLive.hidden, false);
        assert.ok(qrBox.children.some(c => c.classList.contains('qr-error')), 'Error fallback must be rendered in #qrBox');
        assert.ok(projectorQrBox.children.some(c => c.classList.contains('qr-error')), 'Error fallback must be rendered in #projectorQrBox');

        // Immediately recover with valid token
        sandbox.renderQr('valid-token-after-error', 'Biology 101');
        assert.equal(qrStatusPill.textContent, 'Active', 'Status pill must recover to Active');
        assert.equal(qrBox.children.some(c => c.classList.contains('qr-error')), false, 'Error fallback must be cleared');
        assert.equal(qrBox.children[0].tagName, 'CANVAS', 'Canvas must be re-established');
    });

    await t.test('1.5 - Graceful Degradation when Optional DOM Elements are Missing', () => {
        // Omit optional projectorQrBox, projectorSubjectTitle, qrStatusPill
        const { sandbox, elements } = createTestEnvironment({
            omitElements: ['projectorQrBox', 'projectorSubjectTitle', 'qrStatusPill']
        });
        const { qrBox, qrLive, qrPlaceholder } = elements;

        // Must execute cleanly without uncaught TypeError: Cannot read properties of null
        assert.doesNotThrow(() => {
            sandbox.renderQr('standalone-token', 'Standalone Math');
        });

        assert.equal(qrBox.children.length, 2, 'Main qrBox must render even if projectorQrBox is omitted');
        assert.equal(qrLive.hidden, false);
        assert.equal(qrPlaceholder.hidden, true);

        // Idle call must also not throw
        assert.doesNotThrow(() => {
            sandbox.renderQr(null);
        });
        assert.equal(qrBox.children.length, 0);
        assert.equal(qrPlaceholder.hidden, false);
        assert.equal(qrLive.hidden, true);
    });
});

test('ADVERSARIAL SUITE 2: Rapid State Toggling & Lifecycle Transitions', async (t) => {
    await t.test('2.1 - 100 Alternations Between Active and Idle (A -> I -> A -> I ...)', () => {
        const { sandbox, elements } = createTestEnvironment();
        const { qrBox, projectorQrBox, qrStatusPill, qrShell, qrPlaceholder, qrLive, qrHint } = elements;

        for (let cycle = 1; cycle <= 100; cycle++) {
            // STEP A: Activate
            sandbox.renderQr(`toggle-token-${cycle}`, `Subject ${cycle}`);

            assert.equal(qrShell.classList.contains('live'), true, `Cycle ${cycle} [Active]: shell should have 'live' class`);
            assert.equal(qrPlaceholder.hidden, true, `Cycle ${cycle} [Active]: placeholder must be hidden`);
            assert.equal(qrLive.hidden, false, `Cycle ${cycle} [Active]: live container must be visible`);
            assert.equal(qrHint.hidden, false, `Cycle ${cycle} [Active]: hint must be visible`);
            assert.equal(qrStatusPill.textContent, 'Active', `Cycle ${cycle} [Active]: pill must say 'Active'`);
            assert.equal(qrStatusPill.classList.contains('is-active'), true, `Cycle ${cycle} [Active]: pill missing 'is-active'`);
            assert.equal(qrStatusPill.classList.contains('is-idle'), false, `Cycle ${cycle} [Active]: pill has residual 'is-idle'`);
            assert.equal(qrBox.children.length, 2, `Cycle ${cycle} [Active]: qrBox must hold canvas + img`);
            assert.equal(projectorQrBox.children.length, 2, `Cycle ${cycle} [Active]: projectorQrBox must hold canvas + img`);

            // STEP B: Deactivate (Idle)
            sandbox.renderQr(null);

            assert.equal(qrShell.classList.contains('live'), false, `Cycle ${cycle} [Idle]: residual 'live' class on shell!`);
            assert.equal(qrPlaceholder.hidden, false, `Cycle ${cycle} [Idle]: placeholder must be revealed`);
            assert.equal(qrLive.hidden, true, `Cycle ${cycle} [Idle]: live container must be hidden`);
            assert.equal(qrHint.hidden, true, `Cycle ${cycle} [Idle]: hint must be hidden`);
            assert.equal(qrStatusPill.textContent, 'Idle', `Cycle ${cycle} [Idle]: pill must say 'Idle'`);
            assert.equal(qrStatusPill.classList.contains('is-idle'), true, `Cycle ${cycle} [Idle]: pill missing 'is-idle'`);
            assert.equal(qrStatusPill.classList.contains('is-active'), false, `Cycle ${cycle} [Idle]: pill has residual 'is-active'`);
            assert.equal(qrBox.children.length, 0, `Cycle ${cycle} [Idle]: qrBox must be emptied completely`);
            assert.equal(projectorQrBox.children.length, 0, `Cycle ${cycle} [Idle]: projectorQrBox must be emptied completely`);
        }
    });

    await t.test('2.2 - Chaos Fuzz Toggling with Falsy / Boundary Inputs', () => {
        const { sandbox, elements } = createTestEnvironment();
        const { qrBox, qrStatusPill, qrShell, qrPlaceholder, qrLive } = elements;

        // Sequence of boundary values: empty string, undefined, false, 0, null, valid tokens
        const sequence = [
            null,
            '',
            undefined,
            'token-alpha',
            null,
            'token-beta',
            'token-gamma',
            '',
            null,
            'token-delta',
            undefined,
            null
        ];

        sequence.forEach((input, idx) => {
            sandbox.renderQr(input, `Title ${idx}`);
            const isFalsy = !input;
            if (isFalsy) {
                assert.equal(qrBox.children.length, 0, `Step ${idx} [${input}]: qrBox not emptied`);
                assert.equal(qrPlaceholder.hidden, false, `Step ${idx} [${input}]: placeholder not visible`);
                assert.equal(qrLive.hidden, true, `Step ${idx} [${input}]: live not hidden`);
                assert.equal(qrShell.classList.contains('live'), false, `Step ${idx} [${input}]: residual 'live' class`);
                assert.equal(qrStatusPill.textContent, 'Idle');
                assert.equal(qrStatusPill.classList.contains('is-idle'), true);
                assert.equal(qrStatusPill.classList.contains('is-active'), false);
            } else {
                assert.equal(qrBox.children.length, 2, `Step ${idx} [${input}]: qrBox missing elements`);
                assert.equal(qrPlaceholder.hidden, true);
                assert.equal(qrLive.hidden, false);
                assert.equal(qrShell.classList.contains('live'), true);
                assert.equal(qrStatusPill.textContent, 'Active');
                assert.equal(qrStatusPill.classList.contains('is-active'), true);
                assert.equal(qrStatusPill.classList.contains('is-idle'), false);
            }
        });
    });

    await t.test('2.3 - Defensive Fallback when QRCode Library is Undefined', () => {
        // Instantiate environment where QRCode is undefined
        const { sandbox, elements } = createTestEnvironment({ customQRCode: undefined });
        delete sandbox.QRCode;
        const { qrBox, projectorQrBox, qrStatusPill, qrLive, qrPlaceholder } = elements;

        // Calling renderQr with token must not throw uncaught TypeError
        assert.doesNotThrow(() => {
            sandbox.renderQr('some-token', 'Calculus III');
        });

        assert.equal(qrStatusPill.textContent, 'Error', 'Pill must indicate Error');
        assert.ok(qrBox.children.some(c => c.classList.contains('qr-error')), 'Error message rendered in #qrBox');
        assert.ok(projectorQrBox.children.some(c => c.classList.contains('qr-error')), 'Error message rendered in #projectorQrBox');
        assert.equal(qrPlaceholder.hidden, true);
        assert.equal(qrLive.hidden, false);

        // Calling renderQr(null) afterwards must cleanly reset to Idle
        sandbox.renderQr(null);
        assert.equal(qrStatusPill.textContent, 'Idle');
        assert.equal(qrBox.children.length, 0, 'Error markup must be cleaned on reset');
        assert.equal(qrPlaceholder.hidden, false);
        assert.equal(qrLive.hidden, true);
    });

    await t.test('2.4 - Repeated Consecutive Idle Invocations are Idempotent', () => {
        const { sandbox, elements } = createTestEnvironment();
        const { qrBox, projectorQrBox, qrStatusPill, qrShell, qrPlaceholder, qrLive } = elements;

        // Call renderQr(null) 50 times in a row
        for (let i = 0; i < 50; i++) {
            sandbox.renderQr(null);
            assert.equal(qrBox.children.length, 0);
            assert.equal(projectorQrBox.children.length, 0);
            assert.equal(qrPlaceholder.hidden, false);
            assert.equal(qrLive.hidden, true);
            assert.equal(qrShell.classList.contains('live'), false);
            assert.equal(qrStatusPill.textContent, 'Idle');
            assert.equal(qrStatusPill.classList.contains('is-idle'), true);
            assert.equal(qrStatusPill.classList.contains('is-active'), false);
        }
    });
});

test('ADVERSARIAL SUITE 3: CSS Display Rules & Suppression Verification', (t) => {
    assert.ok(fs.existsSync(CSS_PATH), `Missing CSS file: ${CSS_PATH}`);
    const css = fs.readFileSync(CSS_PATH, 'utf8');

    t.test('3.1 - Assert No display: none !important or visibility suppression on QR elements', () => {
        // Test any occurrence of display: none !important on qrBox or projectorQrBox
        const suppressions = [
            /#qrBox\s+canvas[^}]*display:\s*none\s*!important/i,
            /#projectorQrBox\s+canvas[^}]*display:\s*none\s*!important/i,
            /#qrBox\s+img[^}]*display:\s*none\s*!important/i,
            /#projectorQrBox\s+img[^}]*display:\s*none\s*!important/i,
            /#qrBox[^}]*display:\s*none\s*!important/i,
            /#projectorQrBox[^}]*display:\s*none\s*!important/i,
            /\.qr-live[^}]*display:\s*none\s*!important/i,
            /\.projector-qr-container[^}]*display:\s*none\s*!important/i
        ];

        suppressions.forEach(regex => {
            assert.ok(!regex.test(css), `CSS Suppression Defect Found: Matches ${regex}`);
        });
    });

    t.test('3.2 - Verify Display Rules for QR Canvas and Img Elements', () => {
        // Assert that the rule for #qrBox canvas, #qrBox img, #projectorQrBox canvas, #projectorQrBox img exists
        const qrRuleMatch = css.match(/#qrBox\s+canvas[\s\S]*?\{([\s\S]*?)\}/);
        assert.ok(qrRuleMatch, 'Missing CSS rule definition for #qrBox canvas in domain.css');

        const ruleBody = qrRuleMatch[1];
        assert.match(ruleBody, /display:\s*block;/i, 'QR canvas/img must be display: block');
        assert.match(ruleBody, /margin:\s*0\s+auto;/i, 'QR canvas/img must be centered with margin: 0 auto');
        assert.match(ruleBody, /max-width:\s*100%;/i, 'QR canvas/img must be responsive with max-width: 100%');
        assert.match(ruleBody, /height:\s*auto;/i, 'QR canvas/img must have height: auto');
    });

    t.test('3.3 - Verify HTML Template Does Not Impose Suppressive Utility Classes', () => {
        assert.ok(fs.existsSync(HTML_PATH), `Missing HTML file: ${HTML_PATH}`);
        const html = fs.readFileSync(HTML_PATH, 'utf8');
        const $ = cheerio.load(html);

        const qrBox = $('#qrBox');
        assert.equal(qrBox.length, 1, '#qrBox element missing');
        assert.ok(!qrBox.hasClass('is-hidden'), '#qrBox must not have .is-hidden class');
        assert.ok(!qrBox.hasClass('hide-on-mobile'), '#qrBox must not have .hide-on-mobile class');
        assert.ok(!qrBox.attr('style') || !qrBox.attr('style').includes('display: none'), '#qrBox has inline display:none');

        const projectorQrBox = $('#projectorQrBox');
        assert.equal(projectorQrBox.length, 1, '#projectorQrBox element missing');
        assert.ok(!projectorQrBox.hasClass('is-hidden'), '#projectorQrBox must not have .is-hidden class');
        assert.ok(!projectorQrBox.hasClass('hide-on-mobile'), '#projectorQrBox must not have .hide-on-mobile class');
        assert.ok(!projectorQrBox.attr('style') || !projectorQrBox.attr('style').includes('display: none'), '#projectorQrBox has inline display:none');

        const qrLive = $('#qrLive');
        assert.equal(qrLive.length, 1, '#qrLive element missing');
        assert.ok(!qrLive.hasClass('is-hidden'), '#qrLive must not have .is-hidden class');
        assert.ok(!qrLive.hasClass('hide-on-mobile'), '#qrLive must not have .hide-on-mobile class');
    });

    t.test('3.4 - Verify Media Queries Do Not Hide QR Box on Mobile/Tablet Breakpoints', () => {
        // Parse media queries in domain.css
        const mediaQueryRegex = /@media[^{]+\{([\s\S]+?\})\s*\}/g;
        let match;
        while ((match = mediaQueryRegex.exec(css)) !== null) {
            const mediaBlock = match[0];
            if (mediaBlock.includes('#qrBox') || mediaBlock.includes('#projectorQrBox')) {
                assert.ok(!/#qrBox[^}]*display:\s*none/i.test(mediaBlock), `Media query hides #qrBox: ${mediaBlock}`);
                assert.ok(!/#projectorQrBox[^}]*display:\s*none/i.test(mediaBlock), `Media query hides #projectorQrBox: ${mediaBlock}`);
            }
        }
    });

    t.test('3.5 - Verify Global Stylesheet Cascade for Canvas or QR Suppressions', () => {
        // Scan all stylesheets in public/styles to ensure no rogue rule hides canvas
        const stylesDir = path.join(ROOT_DIR, 'public', 'styles');
        function getFiles(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const files = [];
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) files.push(...getFiles(full));
                else if (entry.name.endsWith('.css')) files.push(full);
            }
            return files;
        }

        const cssFiles = getFiles(stylesDir);
        for (const file of cssFiles) {
            const content = fs.readFileSync(file, 'utf8');
            // Check if any rule targets qrBox or projectorQrBox
            if (content.includes('qrBox') || content.includes('projectorQrBox')) {
                const hasSuppression = /#qrBox\s+canvas[^}]*display:\s*none/i.test(content) ||
                                       /#projectorQrBox\s+canvas[^}]*display:\s*none/i.test(content);
                assert.ok(!hasSuppression, `Suppression found in ${file}`);
            }
        }
    });
});
