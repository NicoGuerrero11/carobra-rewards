## Why

The user wants a subtle horizontal roll of coupon brands, using each brand's official lettering instead of plain names or large cards. The current prospective gift-card list does not represent the integrated coupon collection.

## What Changes

- Replace the standalone catalog preview with an informative roll of selected brands already mapped to approved Bonda coupons.
- Source official wordmark assets and document provenance. Preserve artwork proportions and source files; white-only variants receive a documented neutral monochrome CSS presentation for legibility. Do not invent fonts or artwork.
- Add translucent side arrows, native touch scrolling and accessible keyboard navigation without large card containers or distracting automatic movement.
- Keep availability conditional on customer level and promotion terms; show no discounts, coupon issuance controls or gift-card availability claims.
- Preserve existing hero and product changes. Courses remain a separate future change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rewards-public-discovery`: an independently labeled, accessible coupon brand preview distinguishes approved coupon brands from prospective gift cards.

## Impact

Public frontend component, local brand assets/source notes and browser tests. No runtime Bonda requests, credentials, account mutations, database changes, new libraries or deployment.
