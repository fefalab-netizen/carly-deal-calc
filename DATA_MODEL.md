# Carly's Deal Calc: data model and math

All data lives in the browser under `localStorage["carlyDealCalc.v1"]`. Values typed by the user are stored as **strings**, exactly as typed. The calc layer parses them with `Calc.num()`, which strips `$ , %` and spaces, and treats blank as "not set" (`null`), not 0.

## Root
```js
{ version: 1, banks: Bank[], deals: Deal[] }
```

## Bank (also used for credit unions)
```js
{ id, name, type: 'bank' | 'cu', sample?: true, sheets: RateSheet[] }
```

## RateSheet (several per bank, one per month)
```js
{
  id, effectiveDate: 'YYYY-MM-DD', label, sourceFile,      // sourceFile = uploaded PDF name (file itself is not stored)
  ltvPct: '120',                                           // max LTV %
  frontAllowance: { dollar, pct, pctBase: 'price'|'book' },// front-end allowance (lower of $ and % wins)
  backAllowance:  { dollar, pct, pctBase: 'price'|'book' },// back-end allowance
  productMap: { warranty, gap, maintenance, tirewheel, glass, resistall: 'front'|'back' },
  rates: [{ yearMin, yearMax, A, B, C }],                  // blank year = open-ended; first matching row wins
  maxHold: '2',                                            // max points holdable (ignored for credit unions)
  discounts: [{ id, label, pct }],                         // e.g. auto-pay + e-statements, 0.5
  ltvTiers: [{ above, bump }],                             // optional: above X% LTV, rate +Y%
  specialConditions: ''                                    // free text
}
```
The "newest" sheet is the one with the latest `effectiveDate`.

## Deal
```js
{
  id, name, sample?, createdAt, updatedAt,
  condition: 'used'|'new', vehicleYear, tier: 'A'|'B'|'C',
  lenderType: 'bank'|'cu', bankId, sheetId,
  sheetConfirmed: bool,   // answered "yes, it's current"
  sheetOverride: bool,    // dismissed the old/not-newest warning
  purchasePrice,
  amountFinanced,         // what the customer is already financing BEFORE products
  book: { kbbBank, kbbCU, msrp, override, sourceFile },
  approval: {             // per-approval document = HARD STOPS
    approvedRate, holdablePts,
    frontCap: { dollar, pct }, backCap: { dollar, pct },   // % caps are % of purchase price
    maxLtvPct, noProducts, noFront, noBack, restrictions, sourceFile
  },
  hold,                   // points requested above approval
  discountsOn: [discountId],
  products: [{ id, type, price }]
}
```

## Products
| key | label | default bucket |
|---|---|---|
| warranty | Warranty / service contract | back (cancelable) |
| gap | GAP insurance | back (cancelable) |
| maintenance | Prepaid maintenance | back (cancelable) |
| tirewheel | Tire & wheel | back. Varies by bank, so set it on the rate sheet |
| glass | Glass coverage | back. Varies by bank, so set it on the rate sheet |
| resistall | Resistall sealant | front (non-cancelable) |

The rate sheet's `productMap` always overrides the default (`Calc.bucketFor`). The UI labels front-end as non-cancelable and back-end as cancelable.

## Math (all in the `Calc` block of index.html, between `// ==CALC-START==` and `// ==CALC-END==`)

**Book value** (`bookValueFor`)
- If `override` is set, it wins.
- New car: MSRP.
- Used car + Bank: KBB bank value.
- Used car + Credit union: KBB credit-union value.

**LTV** (`maxFinancing`, `computeDeal`)
- LTV % used = the lower of the approval's max LTV (if stated) and the sheet's LTV %.
- Max financed = book × LTV%.
- Room before products = max financed − amount financed.
- LTV room remaining = room before products − all products (front and back are both assumed financed).
- LTV actual % = (amount financed + products) / book × 100.

**Caps** (`capCandidates`, `lowerCap`)
- Each bucket gets candidates from four sources: the sheet allowance $, the sheet allowance % × base (price or book), the approval cap $, and the approval cap % × purchase price.
- The **lowest candidate binds**, and the UI shows which one.
- A `%` cap with no base entered is ignored. It is never treated as 0.
- `noProducts` adds a $0 candidate to both buckets and zeroes the tally. `noFront` / `noBack` add a $0 candidate to that bucket.
- Remaining = cap − bucket total. A negative remaining is a violation.
- "Most product she can still add" = max(0, min(bucket remaining, LTV room)).

**Rate** (`rateLookup`, `holdLimit`, `clampHold`, `ltvBump`, `rateBreakdown`)
- Base rate = the approval rate. If no approval rate is entered, it falls back to the sheet buy rate for the vehicle year × tier.
- Hold limit:
  - Credit union: 0, always.
  - Bank: the lower of the approval's holdable points and the sheet's max hold. If neither is entered, there is no limit.
- Hold = requested hold clamped to [0, limit]. If it was clamped, a violation appears in the banner.
- **Signed rate = base + hold** (8 + 2 = 10).
- LTV bump = the bump of the highest `ltvTiers.above` that LTV actual exceeds.
- **Effective rate = signed + LTV bump − sum of enabled discounts.**
- `nextLtvTier` shows how many more dollars of product would cross the next tier.

**Rate sheet check** (`sheetCurrency`)
- A warning shows if the selected sheet isn't the bank's newest, is more than 35 days past its effective date, has no date, or is future-dated.
- With a warning, she can "Switch to newest" or "Use this sheet anyway" (override).
- With no warning, she's still asked "Is this the current rate sheet?", answered with Yes or No.

## PDF extraction (placeholder)
`extractBookValues(file)`, `extractRateSheet(file)`, and `extractApproval(file)` are in the `// ==EXTRACT-START==` block. Right now they return null or empty fields with `placeholder: true`. `readPdfText(file)` uses `window.pdfjsLib` when it's present and returns '' otherwise, so the app runs without any library. To add real parsing:
1. Inline or load pdf.js.
2. Parse the text in these three functions and return the same field names.
The UI already copies any non-null value into the form, and every field stays editable.
