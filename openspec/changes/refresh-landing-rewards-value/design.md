## Context

The user approved replacing the landing capabilities grid after the learning preview. Existing public components already use Montserrat, Carobra navy/blue/cyan, compact headings and restrained borders. The old section is embedded in `index.astro` and depends on broad legacy global classes.

## Goals / Non-Goals

**Goals:** A centered compact heading; two balanced desktop columns; a recognizable, non-personalized illustration of Bronce, Plata, Oro, Platino and Titanio; three concise icon-led value messages; one registration action; a naturally stacked mobile layout.

**Non-Goals:** Catalog changes, level thresholds or entitlement changes, user balances or active-level indicators, login changes, backend requests, production writes, new dependencies, autoplay or animation, changes to neighboring landing sections.

## Decisions

1. Extract `PublicRewardsValue.astro` with scoped CSS and static markup. Replace only the old capabilities section while keeping `#beneficios` and its position. Avoid extending legacy card classes, which would retain unwanted size and presentation rules.
2. Use a white, subtly elevated level illustration on a light blue-neutral section background; pair it with three border-separated messages, not another four-card grid. Desktop levels form an ascending decorative path, with names always visible and no selected/completed states. Narrow mobile uses a vertical ordered list without horizontal overflow.
3. Keep the level colors consistent with the learning preview's bronze, silver, gold, platinum and titanium labels. Decorative medals and connectors are CSS/inline SVG, hidden from assistive technology. The level names remain a semantic ordered list; no informational meaning depends only on color.
4. Preserve the approved concise copy and single “Quiero ser parte” registration link. Adapt the existing hero CTA test to scope its now-shared label to the hero. Do not change the how-it-works content or navigation destinations.
5. No JavaScript or remote asset is needed. Focus styles, readable contrast, a 44px action target, responsive reflow and no animation support keyboard, no-JS and reduced-motion users.

## Risks / Trade-offs

- A level path could be mistaken for personal progress → label it as the program's levels; no numbers, balance, completion checks or active customer level.
- A compact five-level path could become cramped → switch to a vertical list on narrow screens and test 320/390/768/1440px, plus zoom-like enlarged text.
- Duplicate action labels could break tests → scope assertions to their section without changing the approved wording.
- Legacy global CSS could leak in → use unique component selectors and visually inspect the running page.
