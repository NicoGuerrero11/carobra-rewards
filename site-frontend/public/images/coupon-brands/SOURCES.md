# Coupon brand lettering — local landing review

Retrieved 2026-09-25 from the brands' official websites or their referenced asset CDNs at the user's request. These are original artwork files, not approximated fonts or generated marks. Artwork was inspected for readability, proportions and active/external SVG content.

| Local file | Coupon reference(s) | Official source page | Asset URL |
| --- | --- | --- | --- |
| cinepolis.svg | 9510 | https://cinepolis.com/ | https://tickets-static-content.cinepolis.com/Tickets_Assets/Host/img/logoCinepolisFullWhite.svg |
| benavides.svg | 12490 | https://www.benavides.com.mx/ | https://www.benavides.com.mx/static/version1787719322/frontend/Never8/base/es_MX/images/logo-anterior.svg |
| chopo.svg | 11208, 9471 | https://www.chopo.com.mx/ | https://www.chopo.com.mx/static/version1790298380/frontend/AgileThought/Chopo/es_MX/images/logo.svg |
| devlyn.svg | 5850, 5849, 4749 | https://www.devlyn.com.mx/ | https://devlyn.vtexassets.com/assets/vtex/assets-builder/devlyn.store-theme/12.0.106/logo/logo-devlyn___6868638d82e3b97fdbe2cfcd93e6305f.svg |
| harmon-hall.svg | 8344 | https://www.harmonhall.talisis.com/ | https://cdn.prod.website-files.com/672ba49916d01a3945cd99ee/672bb815ae57ee5909ce3299_harmon-hall-logo.svg |
| marti.svg | 11919 | https://www.marti.mx/ | https://martimx.vtexassets.com/assets/vtex/assets-builder/martimx.resilienttheme-marti/20.1.7/layout/images_brand-marti___deb61eba409ac3faf51cde2f96de1f4f.svg |
| sonora-prime.webp | 14220 | https://sonoraprime.com.mx/ | https://sonoragrill.com.mx/wp-content/uploads/2024/06/Logo-sonoraprime-n.webp |
| porfirios.png | 14806 | https://porfirios.com.mx/ | https://porfirios.com.mx/wp-content/uploads/2022/02/logo-porfirios-2022-1.png |
| harrys.svg | 14799 (Polanco) | https://grupoandersons.com/wp-content/uploads/2019/04/ | https://grupoandersons.com/wp-content/uploads/2019/04/harrys-logo.svg |

Cinépolis' official public application bundle references `BASE_URL_IMAGES = https://tickets-static-content.cinepolis.com` and `Tickets_Assets/Host/img/logoCinepolisFullWhite.svg`. The asset is the full name, not the standalone C symbol.

## Presentation and publication

- Files preserve original artwork geometry, details, spacing and source bytes. No fonts are redistributed and no letterforms are recreated. Benavides' CSS viewport shows its lettering (x=38..150 of the source SVG) and excludes the separate red emblem, matching the user's request for names rather than icon lockups; letterforms themselves are not cropped or distorted.
- White-lettered Cinépolis, Benavides, Harmon Hall and Sonora Prime are displayed as neutral dark monochrome via CSS `brightness(0)` on the light background. This is a presentation adaptation, **not** a claim that the source provides an official dark-color variant. Other files retain source colors. Brand presentation approval should cover this treatment before public deployment.
- The preview is a curated, static representation of brands mapped in migrations 024/025, not a live catalog, guarantee of redemption, or proof that every location participates. Harry's mapping is specifically Polanco. Actual availability remains conditional on level and each promotion.
- Public hosting establishes provenance, not a license or proof of permission. Confirm Carobra/Bonda partner usage rights and brand guidelines before publishing these third-party marks. This task only prepares the local design and does not deploy it.
- Assets load from the local frontend: no request to the brand sites or Bonda is required to render the roll. Keep source URLs and coupon references here for maintenance; do not add API keys or customer identifiers.
