import type { Migration } from "../migration.js";

const effectiveFrom = "2026-09-10 00:00:00+00";

const approvedCoupons = [
  ["2401", "BONDA_CINEPOLIS_9510", "Cinépolis", "9510", "BRONZE", 1],
  ["2402", "BONDA_FARMACIAS_BENAVIDES_12490", "Farmacias Benavides", "12490", "BRONZE", 2],
  ["2403", "BONDA_DEVLYN_CLINICAS_5850", "Clínicas Devlyn", "5850", "SILVER", 3],
  ["2404", "BONDA_DEVLYN_AUDITIVOS_5849", "Ópticas Devlyn · Aparatos auditivos", "5849", "SILVER", 4],
  ["2405", "BONDA_DEVLYN_OPTICOS_4749", "Ópticas Devlyn · Productos ópticos", "4749", "SILVER", 5],
  ["2406", "BONDA_HARMON_HALL_8344", "Harmon Hall", "8344", "SILVER", 6],
  ["2407", "BONDA_MARTI_11919", "Martí", "11919", "SILVER", 7],
  ["2408", "BONDA_SONORA_PRIME_14220", "Sonora Prime", "14220", "GOLD", 8],
  ["2409", "BONDA_PORFIRIOS_14806", "Porfirio's", "14806", "PLATINUM", 9],
] as const;

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const catalogRows = approvedCoupons.map(([suffix, code, name, couponId, level, order]) => `
      ('00000000-0000-4000-8000-00000000${suffix}',
       ${quote(code)}, 1, ${quote(name)},
       'Beneficio gratuito confirmado contra el catálogo vigente de Bonda.',
       'FREE_ENTITLEMENT', true, NULL,
       '{"minimumLevel":"${level}","cumulative":true,"displayOrder":${order}}',
       'UNLIMITED', 'BONDA_COUPON_CODE', 'BONDA', ${quote(couponId)},
       '${effectiveFrom}', NULL, NULL, '${effectiveFrom}', '${effectiveFrom}')`).join(",");

const inventoryRows = approvedCoupons.map(([suffix]) => `
      ('00000000-0000-4000-8001-00000000${suffix}',
       '00000000-0000-4000-8000-00000000${suffix}', NULL, 0, 0, 0,
       '${effectiveFrom}', '${effectiveFrom}')`).join(",");

const ids = approvedCoupons
  .map(([suffix]) => quote(`00000000-0000-4000-8000-00000000${suffix}`))
  .join(", ");

export const bondaApprovedCoupons: Migration = {
  id: "024_bonda_approved_coupons",
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
