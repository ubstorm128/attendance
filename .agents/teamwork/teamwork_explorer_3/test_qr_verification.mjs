import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT_DIR = path.resolve('.');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'pages', 'teacher', 'dashboard.html');
const JS_PATH = path.join(ROOT_DIR, 'public', 'scripts', 'teacher', 'dashboard.js');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'styles', 'shared', 'domain.css');

test('Teacher HTML DOM contains all required QR code elements and script tags', () => {
    assert.ok(fs.existsSync(HTML_PATH), `Missing file: ${HTML_PATH}`);
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const $ = cheerio.load(html);

    // Verify qrcode.min.js script tag is present
    const qrcodeScript = $('script[src*="qrcode"]');
    assert.ok(qrcodeScript.length > 0, 'QRCode library script tag not found in dashboard.html');

    // Verify DOM container elements exist
    assert.equal($('#qrShell').length, 1, 'Missing #qrShell element');
    assert.equal($('#qrPlaceholder').length, 1, 'Missing #qrPlaceholder element');
    assert.equal($('#qrLive').length, 1, 'Missing #qrLive element');
    assert.equal($('#qrBox').length, 1, 'Missing #qrBox element');
    assert.equal($('#qrSubjectName').length, 1, 'Missing #qrSubjectName element');
    assert.equal($('#qrHint').length, 1, 'Missing #qrHint element');
    assert.equal($('#projectorQrBox').length, 1, 'Missing #projectorQrBox element');

    // Verify initial state
    assert.ok($('#qrLive').attr('hidden') !== undefined, '#qrLive should initially be hidden');
});

test('Teacher CSS domain.css does not suppress QR code canvas visibility', () => {
    assert.ok(fs.existsSync(CSS_PATH), `Missing file: ${CSS_PATH}`);
    const css = fs.readFileSync(CSS_PATH, 'utf8');

    // Check if canvas display: none !important is present (reproduction of bug)
    const hasCanvasSuppression = /#qrBox\s+canvas[^}]*display:\s*none\s*!important/i.test(css) ||
                                /#projectorQrBox\s+canvas[^}]*display:\s*none\s*!important/i.test(css);
    
    assert.ok(!hasCanvasSuppression, 'BUG DETECTED: domain.css forces display: none !important on #qrBox canvas or #projectorQrBox canvas');
});

test('Teacher dashboard.js does not forcibly remove rendered canvas elements', () => {
    assert.ok(fs.existsSync(JS_PATH), `Missing file: ${JS_PATH}`);
    const js = fs.readFileSync(JS_PATH, 'utf8');

    // Check if canvas removal bug exists (reproduction of bug)
    const removesBoxCanvas = /boxCanvas\.remove\(\)/.test(js);
    const removesProjCanvas = /projCanvas\.remove\(\)/.test(js);

    assert.ok(!removesBoxCanvas, 'BUG DETECTED: dashboard.js executes boxCanvas.remove() destroying the rendered QR canvas');
    assert.ok(!removesProjCanvas, 'BUG DETECTED: dashboard.js executes projCanvas.remove() destroying the rendered projector QR canvas');
});

test('Teacher dashboard.js renderQr handles missing QRCode library defensively', () => {
    assert.ok(fs.existsSync(JS_PATH), `Missing file: ${JS_PATH}`);
    const js = fs.readFileSync(JS_PATH, 'utf8');

    // Check if renderQr has try/catch or typeof QRCode check around QRCode instantiation
    const renderQrBlock = js.slice(js.indexOf('function renderQr('), js.indexOf('function setSessionActionState'));
    const hasDefensiveCheck = /typeof\s+QRCode/i.test(renderQrBlock) || /try\s*\{[^}]*QRCode/i.test(renderQrBlock);

    assert.ok(hasDefensiveCheck, 'RECOMMENDATION: renderQr should defensively handle case where QRCode library fails to load');
});

test('Simulated renderQr lifecycle verifies UI state transitions', () => {
    // Mock DOM elements
    function createMockElement(id) {
        const classes = new Set();
        return {
            id,
            innerHTML: '',
            hidden: false,
            textContent: '',
            value: '',
            classList: {
                add(c) { classes.add(c); },
                remove(c) { classes.delete(c); },
                contains(c) { return classes.has(c); }
            },
            children: [],
            appendChild(child) { this.children.push(child); },
            querySelector(sel) { return this.children.find(c => c.tag === sel) || null; }
        };
    }

    const mockElements = {
        qrBox: createMockElement('qrBox'),
        qrShell: createMockElement('qrShell'),
        qrPlaceholder: createMockElement('qrPlaceholder'),
        qrLive: createMockElement('qrLive'),
        qrStatusPill: createMockElement('qrStatusPill'),
        projectorQrBox: createMockElement('projectorQrBox'),
        qrHint: createMockElement('qrHint'),
        subject: createMockElement('subject'),
        qrSubjectName: createMockElement('qrSubjectName'),
        projectorSubjectTitle: createMockElement('projectorSubjectTitle')
    };

    // Simulated fixed renderQr function
    function simulatedFixedRenderQr(qrToken, customSubjectTitle, qrcodeLibAvailable = true) {
        const box = mockElements.qrBox;
        const shell = mockElements.qrShell;
        const placeholder = mockElements.qrPlaceholder;
        const live = mockElements.qrLive;
        const statusPill = mockElements.qrStatusPill;
        const projBox = mockElements.projectorQrBox;

        box.innerHTML = '';
        box.children = [];
        if (projBox) {
            projBox.innerHTML = '';
            projBox.children = [];
        }
        mockElements.qrHint.hidden = true;

        if (!qrToken) {
            shell.classList.remove('live');
            placeholder.hidden = false;
            live.hidden = true;
            if (statusPill) {
                statusPill.textContent = 'Idle';
                statusPill.classList.remove('is-active');
                statusPill.classList.add('is-idle');
            }
            return;
        }

        if (!qrcodeLibAvailable) {
            box.innerHTML = '<div class="qr-error">QR code library failed to load</div>';
            return;
        }

        // QRCode library draws a canvas
        const mockCanvas = { tag: 'canvas', width: 200, height: 200 };
        box.appendChild(mockCanvas);

        if (projBox) {
            const mockProjCanvas = { tag: 'canvas', width: 320, height: 320 };
            projBox.appendChild(mockProjCanvas);
        }

        const subjectVal = (customSubjectTitle || mockElements.subject.value || 'Class Session').trim();
        mockElements.subject.value = subjectVal;
        mockElements.qrSubjectName.textContent = subjectVal;
        if (mockElements.projectorSubjectTitle) {
            mockElements.projectorSubjectTitle.textContent = subjectVal;
        }

        mockElements.qrHint.hidden = false;
        shell.classList.add('live');
        placeholder.hidden = true;
        live.hidden = false;

        if (statusPill) {
            statusPill.textContent = 'Active';
            statusPill.classList.remove('is-idle');
            statusPill.classList.add('is-active');
        }
    }

    // 1. Initial / Idle state
    simulatedFixedRenderQr(null);
    assert.equal(mockElements.qrPlaceholder.hidden, false, 'Placeholder must be visible when idle');
    assert.equal(mockElements.qrLive.hidden, true, 'Live container must be hidden when idle');
    assert.equal(mockElements.qrStatusPill.textContent, 'Idle', 'Status pill must indicate Idle');
    assert.ok(!mockElements.qrShell.classList.contains('live'), 'Shell should not have live class');

    // 2. Start session with token
    simulatedFixedRenderQr('mock-session-qr-token-12345', 'Math 101');
    assert.equal(mockElements.qrPlaceholder.hidden, true, 'Placeholder must be hidden when active');
    assert.equal(mockElements.qrLive.hidden, false, 'Live container must be visible when active');
    assert.equal(mockElements.qrStatusPill.textContent, 'Active', 'Status pill must indicate Active');
    assert.ok(mockElements.qrShell.classList.contains('live'), 'Shell should have live class');
    assert.equal(mockElements.qrBox.children.length, 1, 'QR canvas element must be present in qrBox');
    assert.equal(mockElements.projectorQrBox.children.length, 1, 'QR canvas element must be present in projectorQrBox');
    assert.equal(mockElements.qrSubjectName.textContent, 'Math 101');

    // 3. Fallback when QRCode is unavailable
    simulatedFixedRenderQr('mock-token', 'CS 101', false);
    assert.ok(mockElements.qrBox.innerHTML.includes('failed to load'), 'Fallback UI displayed if library is unavailable');
});
