# Carly's Deal Calc (v1 scaffold)

A phone-friendly calculator for an F&I manager. It shows how much front-end and back-end product fits on a deal, given the approval hard stops, the rate sheet allowances, and the LTV.

- **Open it:** `index.html` is one self-contained file, with no build step and no CDN. Open it in any browser, or host it on any static host.
- **Data:** saved in the browser's localStorage, on this device only. Banks → Backup exports or imports JSON.
- **Screens:**
  - Deals: list, new, duplicate, delete.
  - Deal: sticky red hard-stop banner → basics, with the rate sheet "is this current?" check → book value → approval → rate → caps & remaining → products.
  - Banks: banks and credit unions, monthly rate sheets, and the sheet editor.
- **Sample data:** one demo bank (two monthly sheets), one demo credit union, and one demo deal, all labeled SAMPLE. Reset under Banks → Backup.
- **Placeholders:** PDF upload works, but extraction is stubbed (see DATA_MODEL.md). Values are entered by hand until sample PDFs arrive.
- **Tests:** `node tests/calc.test.js` (pure math pulled straight out of index.html).
- **Docs:** DATA_MODEL.md covers the schema and every formula.
