import type { Migration } from "../migration.js";

const effectiveFrom = "2026-09-10 00:00:00+00";

const newlyApprovedCoupons = [
  ["2501", "BONDA_CHOPO_30_11208", "Laboratorio Médico del Chopo · 30%", "11208", "BRONZE", 3],
  ["2502", "BONDA_CHOPO_20_9471", "Laboratorio Médico del Chopo · 20%", "9471", "BRONZE", 4],
  ["2503", "BONDA_HARRYS_POLANCO_14799", "Harry's Polanco", "14799", "TITANIUM", 12],
] as const;

const reorderedCoupons = [
  ["BONDA_DEVLYN_CLINICAS_5850", 5, 3],
  ["BONDA_DEVLYN_AUDITIVOS_5849", 6, 4],
  ["BONDA_DEVLYN_OPTICOS_4749", 7, 5],
  ["BONDA_HARMON_HALL_8344", 8, 6],
  ["BONDA_MARTI_11919", 9, 7],
  ["BONDA_SONORA_PRIME_14220", 10, 8],
  ["BONDA_PORFIRIOS_14806", 11, 9],
] as const;

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const catalogRows = newlyApprovedCoupons.map(([suffix, code, name, couponId, level, order]) => `
      ('00000000-0000-4000-8000-00000000${suffix}',
       ${quote(code)}, 1, ${quote(name)},
       'Beneficio gratuito confirmado contra el catálogo vigente de Bonda.',
       'FREE_ENTITLEMENT', true, NULL,
       '{"minimumLevel":"${level}","cumulative":true,"displayOrder":${order}}',
       'UNLIMITED', 'BONDA_COUPON_CODE', 'BONDA', ${quote(couponId)},
       '${effectiveFrom}', NULL, NULL, '${effectiveFrom}', '${effectiveFrom}')`).join(",");

const inventoryRows = newlyApprovedCoupons.map(([suffix]) => `
      ('00000000-0000-4000-8001-00000000${suffix}',
       '00000000-0000-4000-8000-00000000${suffix}', NULL, 0, 0, 0,
       '${effectiveFrom}', '${effectiveFrom}')`).join(",");

const ids = newlyApprovedCoupons
  .map(([suffix]) => quote(`00000000-0000-4000-8000-00000000${suffix}`))
  .join(", ");

function displayOrderUpdate(index: 1 | 2): string {
  const cases = reorderedCoupons
    .map(([code, nextOrder, previousOrder]) => `WHEN ${quote(code)} THEN ${index === 1 ? nextOrder : previousOrder}`)
    .join(" ");
  const codes = reorderedCoupons.map(([code]) => quote(code)).join(", ");
  return `
    UPDATE catalog_items
    SET eligibility_rule = jsonb_set(
      eligibility_rule,
      '{displayOrder}',
      to_jsonb(CASE code ${cases} END),
      false
    ), updated_at = now()
    WHERE code IN (${codes}) AND version = 1;
  `;
}

export const bondaPresentationCatalogReconciliation: Migration = {
  id: "025_bonda_presentation_catalog_reconciliation",
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

    ${displayOrderUpdate(1)}
  `,
  down: `
    ${displayOrderUpdate(2)}
    DELETE FROM catalog_inventory WHERE catalog_item_id IN (${ids});
    DELETE FROM catalog_items WHERE id IN (${ids});
  `,
};
