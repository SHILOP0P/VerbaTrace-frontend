// Verify the class-based CSS bridge in a real browser, including library styles.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ts = require('typescript'), fs = require('node:fs');
(async () => { const browser = await chromium.launch({ channel: 'chrome', headless: true }); try {
    const page = await browser.newPage();
    await page.setContent('<style>.sample{width:9px!important;background:var(--tone)}</style><main id="root"></main>');
    const code = ts.transpileModule(fs.readFileSync('src/shared/lib/css-styles.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    await page.evaluate(code => { const module = { exports: {} }; new Function('module', 'exports', code)(module, module.exports); window.classes = module.exports; window.cssStylesSource = code; window.classes.startStyleClassBridge(); }, code);
    const normalizedWrites = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(CSSStyleRule.prototype, 'style');
        const native = new WeakMap(); let assignments = 0, methodWrites = 0;
        Object.defineProperty(CSSStyleRule.prototype, 'style', { ...descriptor, get() {
            const declaration = descriptor.get.call(this);
            if (!native.has(declaration)) native.set(declaration, new Proxy(declaration, {
                get(target, property) {
                    const value = Reflect.get(target, property, target);
                    if (property === 'setProperty') return (...args) => { methodWrites++; return value.apply(target, args); };
                    return typeof value === 'function' ? value.bind(target) : value;
                },
                set(target, property, value) { if (property === 'transform' || property === 'height') assignments++; return Reflect.set(target, property, value, target); }
            }));
            return native.get(declaration);
        }});
        try {
            const el = document.createElement('div'); document.getElementById('root').append(el);
            const style = window.classes.cssStyle(el);
            for (let n = 0; n < 100; n++) { style.transform = 'translate3d(0,0,0)'; style.height = '31.1234567px'; }
            if (assignments !== 2) throw Error('Normalized values repeatedly mutate stylesheet: ' + assignments);
            const entry = document[Symbol.for('verbatrace.css.class-registry')].live.get(el);
            descriptor.get.call(entry.rule).height = '52px';
            style.height = '31.1234567px';
            if (assignments !== 3 || Math.abs(parseFloat(getComputedStyle(el).height) - 31.1234567) > .05) throw Error('Cached input masks an external change');
            for (let n = 0; n < 100; n++) style.setProperty('background-color', 'rgb(1,2,3)');
            if (methodWrites !== 1 || getComputedStyle(el).backgroundColor !== 'rgb(1, 2, 3)') throw Error('Normalized setProperty repeatedly mutates stylesheet: ' + methodWrites);
            el.remove();
            return { assignments, methodWrites, checks: 3 };
        } finally { Object.defineProperty(CSSStyleRule.prototype, 'style', descriptor); }
    });
    const result = await page.evaluate(async () => { const { cssClass, cssStyle } = window.classes, root = document.getElementById('root'); const assert = (v, m) => { if (!v)
        throw Error(m); }, tick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); let checks = 0; const el = document.createElement('div'); el.className = 'sample ' + cssClass({ width: 40, height: 31, lineHeight: 1.5, flexGrow: 2, '--tone': 'rgb(10, 20, 30)' }); root.append(el); await tick(); assert(getComputedStyle(el).width === '9px' && getComputedStyle(el).height === '31px', 'units/important'); assert(getComputedStyle(el).lineHeight === '24px' && getComputedStyle(el).flexGrow === '2', 'unitless'); assert(getComputedStyle(el).backgroundColor === 'rgb(10, 20, 30)', 'variables'); checks += 3; const same = cssClass({ height: 31, width: 40, flexGrow: 2, lineHeight: 1.5, '--tone': 'rgb(10, 20, 30)' }); assert(el.classList.contains(same), 'cache'); cssStyle(el).height = '52px'; await tick(); assert(getComputedStyle(el).height === '52px', 'live priority'); el.className = 'sample ' + same; await tick(); assert(getComputedStyle(el).height === '52px', 'class replacement loses live rule'); checks += 3; el.style.opacity = '.4'; await tick(); assert(!el.hasAttribute('style') && getComputedStyle(el).height === '52px' && getComputedStyle(el).opacity === '0.4', 'first library adoption loses existing declarations'); el.style.opacity = '.8'; el.style.removeProperty('height'); await tick(); assert(!el.hasAttribute('style') && getComputedStyle(el).height === '31px' && getComputedStyle(el).opacity === '0.8', 'library updates/removals'); checks += 2; const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add(cssClass({ strokeWidth: 4, strokeDashoffset: 20 })); root.append(svg); assert(getComputedStyle(svg).strokeWidth === '4px' && getComputedStyle(svg).strokeDashoffset === '20px', 'svg units'); checks++; const frame = document.createElement('iframe'); frame.srcdoc = '<main id="root"><div></div></main>'; root.append(frame); await new Promise(r => frame.onload = r); const child = frame.contentDocument.querySelector('div'); cssStyle(child).width = '71px'; assert(frame.contentWindow.getComputedStyle(child).width === '71px' && !child.hasAttribute('style'), 'iframe document'); checks++; const childModule={exports:{}};new frame.contentWindow.Function('module','exports',window.cssStylesSource)(childModule,childModule.exports);childModule.exports.startStyleClassBridge(frame.contentDocument);childModule.exports.cssStyle(child).height='35px';cssStyle(child).height='40px';await tick();assert(frame.contentWindow.getComputedStyle(child).height==='40px','parent and iframe module compete over a live rule');assert(child.classList.length===1,'multiple mutable classes for one element');checks++; const nativeNow = Date.now; let clock = 0; Date.now = () => nativeNow() + clock; const nativeTimeout = window.setTimeout; window.setTimeout = (fn, ms, ...args) => nativeTimeout(fn, ms === 30000 ? 50 : ms, ...args); for (let batch = 0; batch < 3; batch++) {
        for (let n = 0; n < 2200; n++)
            el.className = 'sample ' + cssClass({ height: batch * 2200 + n });
        clock += 31000;
        await new Promise(r => setTimeout(r, 70));
    } Date.now = nativeNow; window.setTimeout = nativeTimeout; await tick(); const rules = [...document.querySelectorAll('style[data-vt-styles]')].reduce((n, s) => n + s.sheet.cssRules.length, 0); assert(rules < 2500, 'unbounded class rules ' + rules); assert(document.querySelectorAll('[style]').length === 0, 'style attributes remain'); checks += 2; return { checks, rules }; });
    console.log(JSON.stringify({ passed: true, ...result, checks: result.checks + normalizedWrites.checks, normalizedWrites }));
}
finally {
    await browser.close();
} })().catch(e => { console.error(e); process.exitCode = 1; });
