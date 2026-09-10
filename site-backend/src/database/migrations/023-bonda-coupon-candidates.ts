import type { Migration } from "../migration.js";

const effectiveFrom = "2026-09-10 00:00:00+00";
const disabledReason = "Proposed from the approved presentation; exact Bonda coupon identifier requires catalog-owner approval.";

const candidates = [
  ["2301", "CINEPOLIS", "Cinépolis", "BRONZE", 1],
  ["2302", "TOKS", "Toks", "BRONZE", 2],
  ["2303", "FARMACIAS_BENAVIDES", "Farmacias Benavides", "BRONZE", 3],
  ["2304", "SMART_FIT", "Smart Fit", "BRONZE", 4],
  ["2305", "LABORATORIO_CHOPO", "Laboratorio Chopo", "BRONZE", 5],
  ["2306", "OPTICAS_DEVLYN", "Ópticas Devlyn", "SILVER", 6],
  ["2307", "HARMON_HALL", "Harmon Hall", "SILVER", 7],
  ["2308", "MARTI", "Martí", "SILVER", 8],
  ["2309", "CHILIS", "Chili's", "SILVER", 9],
  ["2310", "GREEN_YOGA", "Green Yoga", "SILVER", 10],
  ["2311", "SONORA_PRIME", "Sonora Prime", "GOLD", 11],
  ["2312", "LA_DOCENA", "La Docena", "GOLD", 12],
  ["2313", "SALOMON", "Salomon", "GOLD", 13],
  ["2314", "LACOSTE", "Lacoste", "GOLD", 14],
  ["2315", "SEPHORA", "Sephora", "GOLD", 15],
  ["2316", "MOCHOMOS", "Mochomos", "PLATINUM", 16],
  ["2317", "PORFIRIOS", "Porfirio's", "PLATINUM", 17],
  ["2318", "MICHAEL_KORS", "Michael Kors", "PLATINUM", 18],
  ["2319", "COACH", "Coach", "PLATINUM", 19],
  ["2320", "MARRIOTT", "Marriott", "PLATINUM", 20],
  ["2321", "HARRYS", "Harry's", "TITANIUM", 21],
  ["2322", "HUGO_BOSS", "Hugo Boss", "TITANIUM", 22],
  ["2323", "PALACIO_DE_HIERRO", "El Palacio de Hierro", "TITANIUM", 23],
  ["2324", "AEROMEXICO_PREMIER", "Aeroméxico Premier", "TITANIUM", 24],
  ["2325", "LIVE_AQUA", "Live Aqua", "TITANIUM", 25],
] as const;

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const catalogRows = candidates.map(([suffix, code, name, level, order]) => `
      ('00000000-0000-4000-8000-00000000${suffix}',
       'BONDA_CANDIDATE_${code}', 1, ${quote(name)},
       'Proposed free Bonda coupon pending exact catalog reconciliation.',
       'FREE_ENTITLEMENT', false, NULL,
       '{"minimumLevel":"${level}","cumulative":true,"displayOrder":${order}}',
       'UNLIMITED', 'BONDA_COUPON_CODE', 'BONDA', NULL,
       '${effectiveFrom}', NULL, ${quote(disabledReason)}, '${effectiveFrom}', '${effectiveFrom}')`).join(",");

const inventoryRows = candidates.map(([suffix]) => `
      ('00000000-0000-4000-8001-00000000${suffix}',
       '00000000-0000-4000-8000-00000000${suffix}', NULL, 0, 0, 0,
       '${effectiveFrom}', '${effectiveFrom}')`).join(",");

const ids = candidates.map(([suffix]) => quote(`00000000-0000-4000-8000-00000000${suffix}`)).join(", ");

export const bondaCouponCandidates: Migration = {
  id: "023_bonda_coupon_candidates",
  up: `
    INSERT INTO catalog_items (
      id, code, version, name, description, mode, enabled, point_price,
      eligibility_rule, inventory_mode, fulfillment_mode, partner_dependency,
      partner_item_reference, effective_from, effective_to, disabled_reason,
      created_at, updated_at
    ) VALUES ${catalogRows}
    ON CONFLICT (code, version) DO NOTHING;

    INSERT INTO catalog_inventory (
      id, catalog_item_id, total_capacity, reserved_quantity, fulfilled_quantity,
      released_quantity, created_at, updated_at
    ) VALUES ${inventoryRows}
    ON CONFLICT (catalog_item_id) DO NOTHING;
  `,
  down: `
    DELETE FROM catalog_inventory WHERE catalog_item_id IN (${ids});
    DELETE FROM catalog_items WHERE id IN (${ids});
  `,
};
