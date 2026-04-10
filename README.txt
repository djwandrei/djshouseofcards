DJ's House of Cards & Comics Website Rebuild

Files included:
- index.html
- shop.html
- sports-cards.html
- comics.html
- collectibles.html
- wishlist.html
- admin.html
- about.html
- contact.html
- styles.css
- scripts.js
- products.json
- assets/*

Legacy catalog import status:
- Baseball listings imported from the old live site
- Comics listings imported from the old live site
- Basketball listings imported from the old live site basketball page
- Football listings imported from the old live site football page
- Legacy item image labels preserved in products.json where recoverable
- Local placeholder art is still used when the original image binaries were not recoverable in-session

Catalog totals in this build:
- Total items: 467
- Baseball: 52
- Basketball: 99
- Football: 147
- Comics: 165
- Collectibles: 4

How to use:
1. Unzip the folder.
2. Open index.html in a browser, or upload everything to your host.
3. The site will use products.json when served from a host.
4. When opened locally, the embedded productData blocks let the catalog still render without a server.
5. The Admin page stores added items in browser localStorage.


Legacy import status in this build:
- Comics import included
- Basketball import included
- Football import included
- Baseball import expanded substantially from the original live-site decade pages
- Sports collectibles included

Note:
Some legacy pages exposed item text and image labels through indexed live-page text, but not the original image binaries. Where the original item image file could not be recovered, the site uses local branded placeholder art while preserving the legacy image label in products.json.


Additional legacy recovery pass:
- Added extra baseball listings that were still visible in indexed legacy search results from the old site's 2010s page.
- The dedicated 1970s baseball page is still not directly recoverable from the currently accessible index results.


Final recovery pass added additional baseball 2010s entries recovered from indexed live-site snippets.


Update in this build:
- Sports cards now branch into baseball, basketball, and football pages.
- Uploaded comic and collectibles photos are mapped onto the matching legacy listings.
- Listings with more than one uploaded photo now show an image gallery in the detail modal.
- The old DJ's Club House gif was replaced with the new clubhouse sign logo.
