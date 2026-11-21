// Run: node tests/calc.test.js
// Extracts the pure Calc block from index.html (between CALC-START/CALC-END) and tests it.
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.split('// ==CALC-START==')[1].split('// ==CALC-END==')[0];
const Calc = new Function(src + '\nreturn Calc;')();
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
const eq = assert.deepStrictEqual;

console.log('LTV max');
t('120% of $25,000 minus $26,500 financed = $3,500 room', () => eq(Calc.maxFinancing(25000, 120, 26500), { maxTotal: 30000, room: 3500 }));
t('negative room when already over', () => eq(Calc.maxFinancing(20000, 100, 21000).room, -1000));
t('missing book => null', () => eq(Calc.maxFinancing(null, 120, 1000), null));
t('used + bank uses KBB bank value', () => eq(Calc.bookValueFor({ condition: 'used', lenderType: 'bank', book: { kbbBank: '25000', kbbCU: '24000', msrp: '30000' } }).value, 25000));
t('used + CU uses KBB credit-union value', () => eq(Calc.bookValueFor({ condition: 'used', lenderType: 'cu', book: { kbbBank: '25000', kbbCU: '24000' } }).value, 24000));
t('new uses MSRP', () => eq(Calc.bookValueFor({ condition: 'new', lenderType: 'bank', book: { kbbBank: '1', msrp: '$31,500' } }).value, 31500));
t('override wins', () => eq(Calc.bookValueFor({ condition: 'new', book: { msrp: '31500', override: '30000' } }).value, 30000));

console.log('Lower cap wins');
t('$8,500 vs 30% of $28,000 ($8,400) => 30% binds', () => { const c = Calc.lowerCap(Calc.capCandidates('Back', { dollar: 8500, pct: 30 }, { price: 28000 })); eq(c.value, 8400); eq(c.kind, 'pct'); });
t('$8,500 vs 30% of $40,000 ($12,000) => $ binds', () => { const c = Calc.lowerCap(Calc.capCandidates('Back', { dollar: 8500, pct: 30 }, { price: 40000 })); eq(c.value, 8500); eq(c.kind, 'dollar'); });
t('% of book value base', () => eq(Calc.lowerCap(Calc.capCandidates('B', { pct: 20, pctBase: 'book' }, { price: 30000, book: 25000 })).value, 5000));
t('pct with missing base is ignored, not zero', () => eq(Calc.lowerCap(Calc.capCandidates('B', { dollar: 5000, pct: 30 }, { price: null })).value, 5000));
t('no caps => null', () => eq(Calc.lowerCap([]), null));

console.log('Hold limits & credit-union rule');
t('8% + 2% hold = 10% signed', () => eq(Calc.rateBreakdown({ baseRate: 8, hold: 2 }).signed, 10));
t('bank: lower of approval (2) and sheet (2.5) => 2', () => eq(Calc.holdLimit('bank', { holdablePts: '2' }, { maxHold: '2.5' }).max, 2));
t('bank: sheet lower than approval => sheet', () => { const l = Calc.holdLimit('bank', { holdablePts: '3' }, { maxHold: '1.5' }); eq(l.max, 1.5); eq(l.reason, 'Rate sheet max hold'); });
t('request 3 with limit 2 => clamped to 2', () => eq(Calc.clampHold('3', { max: 2 }), { hold: 2, requested: 3, clamped: true }));
t('no limit entered => unclamped', () => eq(Calc.clampHold(1.75, Calc.holdLimit('bank', {}, {})).hold, 1.75));
t('negative hold => 0', () => eq(Calc.clampHold(-1, { max: 2 }).hold, 0));
t('credit union: hold forced to 0 even if approval says 2', () => { const l = Calc.holdLimit('cu', { holdablePts: 2 }, { maxHold: 2 }); eq(l.max, 0); eq(Calc.clampHold(2, l).hold, 0); });
t('CU deal: signed rate = approval rate', () => { const r = Calc.computeDeal({ lenderType: 'cu', condition: 'used', hold: '2', approval: { approvedRate: '6' }, book: {}, products: [] }, null, null, '2026-11-20'); eq(r.rate.signed, 6); });

console.log('Discounts & LTV rate bump');
t('10% signed − 0.5% auto-pay/e-statement = 9.5% effective', () => eq(Calc.rateBreakdown({ baseRate: 8, hold: 2, discounts: [{ pct: '0.5' }] }).effective, 9.5));
t('stacked discounts', () => eq(Calc.rateBreakdown({ baseRate: 7, hold: 1, discounts: [{ pct: 0.25 }, { pct: 0.25 }] }).effective, 7.5));
t('LTV 124% over 115% tier => +0.5', () => eq(Calc.ltvBump({ ltvTiers: [{ above: 115, bump: 0.5 }, { above: 125, bump: 1 }] }, 124).bump, 0.5));
t('LTV 126% => highest crossed tier +1', () => eq(Calc.ltvBump({ ltvTiers: [{ above: 115, bump: 0.5 }, { above: 125, bump: 1 }] }, 126).bump, 1));
t('next tier dollars until crossing', () => eq(Calc.nextLtvTier({ ltvTiers: [{ above: 115, bump: 0.5 }] }, 20000, 22000).dollarsUntil, 1000));
t('rate table lookup by year and tier', () => { const s = { rates: [{ yearMin: 2024, yearMax: '', A: 6.49, B: 8.99 }, { yearMin: 2020, yearMax: 2023, A: 6.99, B: 9.49 }] }; eq(Calc.rateLookup(s, 2022, 'B').rate, 9.49); eq(Calc.rateLookup(s, 2026, 'A').rate, 6.49); eq(Calc.rateLookup(s, 2015, 'A'), null); });

console.log('Front/back tally');
const sheet = { productMap: { tirewheel: 'front' } };
const prods = [{ type: 'warranty', price: '2995' }, { type: 'gap', price: '895' }, { type: 'resistall', price: '699' }, { type: 'tirewheel', price: '$1,200' }, { type: 'glass', price: '' }];
t('defaults + sheet override (T&W front)', () => eq(Calc.tally(prods, sheet), { front: 1899, back: 3890, total: 5789, count: 4, blocked: false }));
t('without sheet, T&W defaults to back', () => eq(Calc.tally(prods, null).back, 5090));
t('no-products approval zeroes tally', () => eq(Calc.tally(prods, sheet, true).total, 0));

console.log('Sheet currency');
const bank = { sheets: [{ id: 'a', effectiveDate: '2026-11-01' }, { id: 'b', effectiveDate: '2026-10-01' }] };
t('newest & fresh => no warning', () => eq(Calc.sheetCurrency(bank, bank.sheets[0], '2026-11-20').warn, false));
t('older sheet => warning', () => { const c = Calc.sheetCurrency(bank, bank.sheets[1], '2026-11-20'); eq(c.warn, true); eq(c.isNewest, false); });
t('newest but 40 days old => stale warning', () => eq(Calc.sheetCurrency(bank, bank.sheets[0], '2026-12-11').warn, true));

console.log('Full deal (sample deal numbers)');
const sheetFull = { ltvPct: '125', frontAllowance: { dollar: '2500', pct: '10' }, backAllowance: { dollar: '8500', pct: '30' }, productMap: { tirewheel: 'front', resistall: 'front' }, maxHold: '2', rates: [{ yearMin: '2020', yearMax: '2023', A: '6.99' }], discounts: [{ id: 'd', label: 'AP', pct: '0.5' }], ltvTiers: [{ above: '115', bump: '0.5' }] };
const deal = { condition: 'used', lenderType: 'bank', vehicleYear: '2022', tier: 'A', purchasePrice: '28000', amountFinanced: '26500', book: { kbbBank: '25000', kbbCU: '24000' }, approval: { approvedRate: '8', holdablePts: '2', frontCap: {}, backCap: {} }, hold: '2', discountsOn: ['d'], products: prods.slice(0, 3) };
const r = Calc.computeDeal(deal, { sheets: [Object.assign({ id: 's', effectiveDate: '2026-11-01' }, sheetFull)] }, Object.assign({ id: 's', effectiveDate: '2026-11-01' }, sheetFull), '2026-11-20');
t('back cap = min($8,500, 30%×28,000=$8,400) = $8,400; remaining $4,510', () => { eq(r.back.cap, 8400); eq(r.back.remaining, 4510); });
t('front cap = min($2,500, $2,800) = $2,500; remaining $1,801', () => { eq(r.front.cap, 2500); eq(r.front.remaining, 1801); });
t('LTV: 25,000×125% = 31,250 − 26,500 − 4,589 = $161 left', () => eq(r.ltv.remaining, 161));
t('rate: 8 + 2 hold + 0.5 LTV bump − 0.5 discount = 10', () => { eq(r.rate.signed, 10); eq(r.rate.effective, 10); eq(r.bump.bump, 0.5); });
t('approval back cap $3,000 overrides sheet when lower', () => { const d2 = JSON.parse(JSON.stringify(deal)); d2.approval.backCap = { dollar: '3000' }; const r2 = Calc.computeDeal(d2, null, sheetFull, '2026-11-20'); eq(r2.back.cap, 3000); eq(r2.back.remaining, -890); assert(r2.violations.some(v => v.startsWith('Back-end over cap'))); });
t('no-products approval => caps 0, stop listed', () => { const d2 = JSON.parse(JSON.stringify(deal)); d2.approval.noProducts = true; const r2 = Calc.computeDeal(d2, null, sheetFull, '2026-11-20'); eq(r2.back.cap, 0); eq(r2.tally.total, 0); assert(r2.stops.includes('No products allowed')); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
