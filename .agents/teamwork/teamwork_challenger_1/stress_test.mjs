import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT_DIR = path.resolve('.');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'pages', 'teacher', 'dashboard.html');
const JS_PATH = path.join(ROOT_DIR, 'public', 'scripts', 'teacher', 'dashboard.js');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'styles', 'shared', 'domain.css');

// Helper to extract renderQr function code from dashboard.js
function getRenderQrFunctionCode() {
    const js = fs.readFileSync(JS_PATH, 'utf8');
    const startIdx = js.indexOf('function renderQr(');
    const endIdx = js.indexOf('function setSessionActionState');
    assert.ok(startIdx !== -1, 'renderQr function not found in dashboard.js');
    assert.ok(endIdx !== -1, 'setSessionActionState boundary not found in dashboard.js');
    return js.slice(startIdx, endIdx);
}

// Mock DOM factory
function createMockEnvironment(options = {}) {
    const missingIds = new Set(options.missingIds || []);
    const elementStore = {};

    const allIds = [
        'qrBox',
        'qrShell',
        'qrPlaceholder',
        'qrLive',
        'qrStatusPill',
        'projectorQrBox',
        'qrHint',
        'subject',
        'qrSubjectName',
        'projectorSubjectTitle'
    ];

    for (const id of allIds) {
        if (missingIds.has(id)) continue;
        let _html = '';
        let _text = '';
        const classes = new Set();
        const children = [];

        elementStore[id] = {
            id,
            get innerHTML() {
                return _html;
            },
            set innerHTML(val) {
                _html = String(val);
                children.length = 0;
            },
            get textContent() {
                return _text;
            },
            set textContent(val) {
                _text = String(val);
                // Real DOM escaping simulation for innerHTML:
                _html = String(val)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            },
            value: '',
            hidden: id === 'qrLive' || id === 'qrHint',
            classList: {
                add(c) { classes.add(c); },
                remove(c) { classes.delete(c); },
                contains(c) { return classes.has(c); },
                get size() { return classes.size; }
            },
            children,
            appendChild(child) {
                children.push(child);
            },
            querySelector(sel) {
                return children.find(c => c.tag === sel) || null;
            }
        };
    }

    const documentMock = {
        getElementById(id) {
            return elementStore[id] || null;
        }
    };

    let stoppedTimer = false;
    const stopSessionTimerSpy = () => {
        stoppedTimer = true;
    };

    const loggedErrors = [];
    const consoleMock = {
        error(...args) {
            loggedErrors.push(args.map(a => (a && a.stack ? a.stack : String(a))).join(' '));
        },
        log() {}
    };

    const capturedQrInstances = [];
    class DefaultMockQRCode {
        constructor(targetEl, opts) {
            if (options.qrCodeThrowOnInstantiation) {
                throw new Error('Canvas 2D context creation failure / OOM');
            }
            if (options.qrCodeThrowOnOverflow && opts && opts.text && opts.text.length > 2953) {
                throw new Error(`code length overflow. (${opts.text.length} > 2953)`);
            }
            this.targetEl = targetEl;
            this.opts = opts;
            capturedQrInstances.push({ targetEl, opts });
            // Simulate qrcodejs DOM injection
            const mockCanvas = { tag: 'canvas', width: opts.width, height: opts.height };
            const mockImg = { tag: 'img', style: { display: 'none' }, src: 'data:image/png;base64,mock' };
            targetEl.appendChild(mockCanvas);
            targetEl.appendChild(mockImg);
        }
    }
    DefaultMockQRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

    const sandbox = {
        document: documentMock,
        location: { origin: 'http://attendance.test:3000' },
        stopSessionTimer: stopSessionTimerSpy,
        currentSelectedSubject: options.currentSelectedSubject || null,
        console: consoleMock
    };

    if (options.qrCodeUndefined !== true) {
        sandbox.QRCode = options.customQRCode || DefaultMockQRCode;
    }

    const context = vm.createContext(sandbox);
    const fnCode = getRenderQrFunctionCode();
    vm.runInContext(fnCode, context);

    return {
        context,
        elements: elementStore,
        loggedErrors,
        capturedQrInstances,
        get stoppedTimer() { return stoppedTimer; }
    };
}

// ==========================================
// Suite 1: Token Inputs & Boundary Conditions
// ==========================================

test('Token: Valid 64-char hex token generates correct QR URLs and activates UI', () => {
    const env = createMockEnvironment();
    const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
    env.context.renderQr(token, 'Computer Science 101');

    assert.equal(env.capturedQrInstances.length, 2, 'Should instantiate QRCode for both box and projectorBox');
    assert.equal(env.capturedQrInstances[0].opts.text, `http://attendance.test:3000/student.html?token=${token}`);
    assert.equal(env.capturedQrInstances[1].opts.text, `http://attendance.test:3000/student.html?token=${token}`);
    assert.equal(env.elements.qrStatusPill.textContent, 'Active');
    assert.ok(env.elements.qrShell.classList.contains('live'));
    assert.equal(env.elements.qrPlaceholder.hidden, true);
    assert.equal(env.elements.qrLive.hidden, false);
    assert.equal(env.elements.qrHint.hidden, false);
});

test('Token: Extremely long token (10,000 chars) handles library overflow gracefully', () => {
    const env = createMockEnvironment({ qrCodeThrowOnOverflow: true });
    const longToken = 'x'.repeat(10000);

    // renderQr should catch the overflow error without unhandled exception
    assert.doesNotThrow(() => {
        env.context.renderQr(longToken, 'Scalability Testing');
    });

    assert.ok(env.elements.qrBox.innerHTML.includes('Failed to render QR code.'));
    assert.ok(env.elements.projectorQrBox.innerHTML.includes('Failed to render QR code.'));
    assert.equal(env.elements.qrStatusPill.textContent, 'Error');
    assert.equal(env.elements.qrPlaceholder.hidden, true);
    assert.equal(env.elements.qrLive.hidden, false);
    assert.ok(env.loggedErrors.some(e => e.includes('code length overflow')));
});

test('Token: Falsy inputs ("", null, undefined, false, 0) transition to Idle state', () => {
    const falsyValues = ['', null, undefined, false, 0];

    for (const val of falsyValues) {
        const env = createMockEnvironment();
        // First set to active
        env.elements.qrShell.classList.add('live');
        env.elements.qrPlaceholder.hidden = true;
        env.elements.qrLive.hidden = false;
        env.elements.qrStatusPill.textContent = 'Active';

        env.context.renderQr(val);

        assert.equal(env.elements.qrStatusPill.textContent, 'Idle', `Pill should be Idle for token: ${val}`);
        assert.ok(!env.elements.qrShell.classList.contains('live'), `Shell should not have live class for token: ${val}`);
        assert.equal(env.elements.qrPlaceholder.hidden, false, `Placeholder should be visible for token: ${val}`);
        assert.equal(env.elements.qrLive.hidden, true, `Live should be hidden for token: ${val}`);
        assert.equal(env.stoppedTimer, true, `Timer should be stopped for token: ${val}`);
        assert.equal(env.capturedQrInstances.length, 0, `No QRCode instances created for token: ${val}`);
    }
});

test('Token: Non-string truthy inputs (number 12345, boolean true) stringify cleanly', () => {
    const env = createMockEnvironment();
    assert.doesNotThrow(() => {
        env.context.renderQr(12345, 'Numeric Token Test');
    });
    assert.equal(env.capturedQrInstances[0].opts.text, 'http://attendance.test:3000/student.html?token=12345');
    assert.equal(env.elements.qrStatusPill.textContent, 'Active');

    const env2 = createMockEnvironment();
    assert.doesNotThrow(() => {
        env2.context.renderQr(true, 'Boolean Token Test');
    });
    assert.equal(env2.capturedQrInstances[0].opts.text, 'http://attendance.test:3000/student.html?token=true');
    assert.equal(env2.elements.qrStatusPill.textContent, 'Active');
});

// ==========================================
// Suite 2: XSS Resistance & Character Handling
// ==========================================

test('XSS Resistance: Script tags and HTML entities in token are NOT injected into DOM innerHTML', () => {
    const env = createMockEnvironment();
    const xssToken = '"><script>alert("token-xss")</script><img src=x onerror=alert(1)>';
    env.context.renderQr(xssToken, 'XSS Token Safety');

    assert.ok(!env.elements.qrBox.innerHTML.includes('<script>'), 'qrBox innerHTML must not contain raw script tag');
    assert.ok(!env.elements.projectorQrBox.innerHTML.includes('<script>'), 'projectorQrBox innerHTML must not contain raw script tag');
    // Ensure token is passed safely to QRCode URL parameter
    assert.equal(env.capturedQrInstances[0].opts.text, `http://attendance.test:3000/student.html?token=${xssToken}`);
});

test('XSS Resistance: Script tags and HTML in subject title are safely encoded via textContent and value', () => {
    const env = createMockEnvironment();
    const xssSubject = '<script>alert("subject-xss")</script><svg onload=alert(2)>';
    env.context.renderQr('valid-token-123', xssSubject);

    // textContent should retain the raw text
    assert.equal(env.elements.qrSubjectName.textContent, xssSubject.trim());
    assert.equal(env.elements.projectorSubjectTitle.textContent, xssSubject.trim());
    // innerHTML in simulated DOM escapes tags so executable markup is neutral
    assert.ok(!env.elements.qrSubjectName.innerHTML.includes('<script>'), 'HTML must be escaped in qrSubjectName');
    assert.ok(env.elements.qrSubjectName.innerHTML.includes('&lt;script&gt;'));
    assert.equal(env.elements.subject.value, xssSubject.trim());
});

test('Character Handling: Unicode, quotes, and punctuation in subject title', () => {
    const env = createMockEnvironment();
    const unicodeTitle = '  Calculus Ⅱ (الأستاذ / Prof. O\'Connor & Dr. Müller) — 2026 🎓  ';
    env.context.renderQr('tok-unicode-123', unicodeTitle);

    assert.equal(env.elements.qrSubjectName.textContent, unicodeTitle.trim());
    assert.equal(env.elements.projectorSubjectTitle.textContent, unicodeTitle.trim());
});

// ==========================================
// Suite 3: DOM Edge Cases & Defect Probing
// ==========================================

test('DOM Edge Case: Missing #projectorQrBox degrades cleanly without error', () => {
    const env = createMockEnvironment({ missingIds: ['projectorQrBox'] });
    assert.doesNotThrow(() => {
        env.context.renderQr('tok-no-projector', 'Single Screen Mode');
    });

    assert.equal(env.capturedQrInstances.length, 1, 'Only box QRCode should be created');
    assert.equal(env.elements.qrStatusPill.textContent, 'Active');
    assert.equal(env.elements.qrBox.children.length, 2, 'Box should receive canvas and img');
});

test('DOM Edge Case: Missing #qrStatusPill degrades cleanly without error', () => {
    const env = createMockEnvironment({ missingIds: ['qrStatusPill'] });
    assert.doesNotThrow(() => {
        env.context.renderQr('tok-no-status', 'No Status Pill Mode');
    });

    assert.equal(env.capturedQrInstances.length, 2);
    assert.equal(env.elements.qrLive.hidden, false);
});

test('DOM Edge Case: Missing #qrHint throws TypeError due to unguarded property access (DEFECT PROBE)', () => {
    const env = createMockEnvironment({ missingIds: ['qrHint'] });

    // When #qrHint is missing, document.getElementById('qrHint').hidden = true throws
    assert.throws(
        () => {
            env.context.renderQr('tok-no-hint', 'Missing Hint Element');
        },
        {
            name: 'TypeError',
            message: /Cannot set propert(ies|y) of null/
        },
        'Calling renderQr when #qrHint is absent from DOM throws TypeError'
    );
});

test('DOM Verification: Teacher dashboard.html contains all required elements including #qrHint', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const requiredIds = [
        'qrBox',
        'qrShell',
        'qrPlaceholder',
        'qrLive',
        'qrStatusPill',
        'projectorQrBox',
        'qrHint',
        'subject',
        'qrSubjectName',
        'projectorSubjectTitle'
    ];

    for (const id of requiredIds) {
        assert.ok(
            html.includes(`id="${id}"`),
            `dashboard.html must contain element with id="${id}" to prevent null pointer exceptions`
        );
    }
});

// ==========================================
// Suite 4: Library Failure Simulation
// ==========================================

test('Library Simulation: QRCode missing (typeof QRCode === "undefined") displays clean error message', () => {
    const env = createMockEnvironment({ qrCodeUndefined: true });

    assert.doesNotThrow(() => {
        env.context.renderQr('tok-no-lib', 'Network Disconnected');
    });

    assert.ok(
        env.elements.qrBox.innerHTML.includes('QR code library failed to load. Please check your connection and refresh.'),
        'Should display clean connection error in qrBox'
    );
    assert.ok(
        env.elements.projectorQrBox.innerHTML.includes('QR code library failed to load.'),
        'Should display error in projectorQrBox'
    );
    assert.equal(env.elements.qrStatusPill.textContent, 'Error');
    assert.equal(env.elements.qrPlaceholder.hidden, true);
    assert.equal(env.elements.qrLive.hidden, false);
    assert.ok(env.loggedErrors.some(e => e.includes('QRCode library is not loaded')));
});

test('Library Simulation: new QRCode(...) throwing unexpected error is caught with clean error UI', () => {
    const env = createMockEnvironment({ qrCodeThrowOnInstantiation: true });

    assert.doesNotThrow(() => {
        env.context.renderQr('tok-instantiation-failure', 'Canvas Context Crash');
    });

    assert.ok(
        env.elements.qrBox.innerHTML.includes('Failed to render QR code.'),
        'Should display fallback error in qrBox'
    );
    assert.ok(
        env.elements.projectorQrBox.innerHTML.includes('Failed to render QR code.'),
        'Should display fallback error in projectorQrBox'
    );
    assert.equal(env.elements.qrStatusPill.textContent, 'Error');
    assert.equal(env.elements.qrPlaceholder.hidden, true);
    assert.equal(env.elements.qrLive.hidden, false);
    assert.ok(env.loggedErrors.some(e => e.includes('Canvas 2D context creation failure')));
});

// ==========================================
// Suite 5: CSS Rules & Rendering Verification
// ==========================================

test('CSS Verification: domain.css does not suppress canvas visibility with !important', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');

    // Ensure display: none !important is absent on canvas
    const hasCanvasSuppression = /#qrBox\s+canvas[^}]*display:\s*none\s*!important/i.test(css) ||
                                /#projectorQrBox\s+canvas[^}]*display:\s*none\s*!important/i.test(css);
    assert.equal(hasCanvasSuppression, false, 'domain.css must not force display: none !important on canvas');

    // Ensure display: block rule exists
    const hasBlockRule = /#qrBox\s+canvas[^}]*display:\s*block/i.test(css) ||
                         /#qrBox\s+canvas\s*,\s*#qrBox\s+img/i.test(css);
    assert.ok(hasBlockRule, 'domain.css must declare display: block for QR display elements');
});
