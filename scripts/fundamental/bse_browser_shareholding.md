# BSE shareholding via the browser pane (public, no login)

api.bseindia.com returns 403 to non-browser clients. From a page on www.bseindia.com the site's own
frontend calls these endpoints; same-origin-style `fetch()` from that page works (HTTP 200 observed
2026-10-18). No header spoofing, no proxies, no CAPTCHA. Keep >= 1.5 s between calls, small batches.
If a CAPTCHA/403 appears: stop and report.

Base: `https://api.bseindia.com/BseIndiaAPI/api/`

## Endpoints (observed in the pane's network traffic)
| Purpose | Request |
|---|---|
| Quarter list per scrip | `SHPQNewFormat/w?scripcode=C` -> `Table[]` {qtr:"June 2026", qtrid:130, filing_date_time, status, XbrlFile} (seen on `/stock-share-price/x/y/C/shp/`) |
| Promoter / public / total + pledge flag | `CorporatesSHPSecuritybeta/w?scripcode=C&qtrid=130.00` -> `Table[0].Fld_IsPledge`, `Table1[]` rows `STA1A2`, `STB1B2B3`, `STABC` (seen on the `.../qtrid/130.00/shareholding-pattern/Jun-2026/` page) |
| Institutions (MF/DII/FII) | `Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE=C&QtrCode=130.00` -> `Table1[]` (name found in site JS chunk, param names from the component code; verified 200) |

Pledge numbers: promoter row `Fld_PledgeEncumberedNoOfShares` is used only when `Fld_IsPledge` is true
(no pledged BSE-only example captured yet, so that branch is covered by a synthetic unit test only).

## Row mapping (see bse_shp_parse.py)
promoter/public/total from summary; MF = public row with `Fld_Level` "Mutual Funds/" and empty
holder name; DII = `Sub Total B1` under "Institutions (Domestic)"; FII = `Sub Total B2` under
"Institutions (Foreign)". Missing => null. Percent is cross-checked against filed share counts.

## In-page snippet (run via javascript_tool on a bseindia.com tab)
```js
const B='https://api.bseindia.com/BseIndiaAPI/api/', sl=ms=>new Promise(s=>setTimeout(s,ms));
async function shp(code){
  const q=(await (await fetch(B+'SHPQNewFormat/w?scripcode='+code)).json()).Table[0]; await sl(1600);
  const id=Number(q.qtrid).toFixed(2);
  const sum=await (await fetch(B+'CorporatesSHPSecuritybeta/w?scripcode='+code+'&qtrid='+id)).json(); await sl(1600);
  const pub=await (await fetch(B+'Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE='+code+'&QtrCode='+id)).json(); await sl(1600);
  return {code,qrow:q,summary:sum,public:pub};   // feed to bse_shp_parse.build_row(code,qrow,summary,public)
}
```

## Verification (dual-listed)
CG Power 500093 Jun-2026 (BSE) vs NSE stage row CGPOWER: promoter 56.36, FII 11.97, DII 18.3,
MF 9.93, public 43.64, shares 887,665,345 / 1,574,979,249, pledge 0 -- identical.

## Not done / caveat
A bulk run of the 429 BSE-only codes (list saved in scripts/qa/out/bse_only_codes.txt; =
`coverage_audit.universe()` symbols that are all digits) was NOT executed; moving captured JSON from the
page to disk needs a channel and the loopback POST to 127.0.0.1 was denied by the permission layer.
