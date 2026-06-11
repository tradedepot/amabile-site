# Amabile di Rosa — Website

Premium, playful consumer site for **Amabile di Rosa**, a sweet sparkling Italian wine.
*Friends. Wine. Good Times.*

## Structure
Static site — plain HTML/CSS/vanilla JS, no build step. Serve the folder directly.

| File | Page |
|------|------|
| `index.html` | Home — "Pop the Cork" interactive experience (wines, occasions, invite generator) |
| `where-to-buy.html` | Find a Bottle — eCommerce + live stockist map (BigQuery-sourced) + Google address search |
| `trade.html` | Become a Wholesaler — trade lead form |
| `responsible-drinking.html` | Responsible drinking / 18+ |
| `assets/css/party.css` | Shared styles |
| `assets/js/stockists.js` | Stockist data (exported from BigQuery) |

## Run locally
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Notes
- Find-a-Bottle stockists are exported from BigQuery (`tradedepot-retail-167113.tradedepot`). Regenerate `assets/js/stockists.js` to refresh.
- Address search uses a restricted Google Maps browser key in `where-to-buy.html`; ensure the key's HTTP-referrer restriction includes the production domain. Falls back to OpenStreetMap if absent.
