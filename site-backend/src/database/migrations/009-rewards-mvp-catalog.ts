import type { Migration } from "../migration.js";

const catalogEffectiveFrom = "2026-07-14 12:00:00+00";

export const rewardsMvpCatalog: Migration = {
  id: "009_rewards_mvp_catalog",
  up: `
    ALTER TABLE catalog_items DROP CONSTRAINT ck_catalog_items_points_price;
    ALTER TABLE catalog_items ADD CONSTRAINT ck_catalog_items_points_price CHECK (
      (mode = 'POINTS' AND (NOT enabled OR point_price IS NOT NULL)) OR
      (mode <> 'POINTS' AND point_price IS NULL)
    );

    INSERT INTO catalog_items (
      id, code, version, name, description, mode, enabled, point_price,
      eligibility_rule, inventory_mode, fulfillment_mode, partner_dependency,
      effective_from, effective_to, disabled_reason, created_at, updated_at
    ) VALUES
      (
        '00000000-0000-4000-8000-000000000301', 'WELCOME_AUTOMATED', 1,
        'Bienvenida automatizada', 'Correo y video de bienvenida al activar Rewards.',
        'FREE_ENTITLEMENT', false, NULL,
        '{"grantTrigger":"REWARDS_ACCOUNT_ACTIVATION"}', 'UNLIMITED', 'AUTOMATED_EMAIL', NULL,
        '${catalogEffectiveFrom}', NULL,
        'The free-entitlement grant and email fulfillment flow is not enabled.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000302', 'CINEPOLIS_ONBOARDING_2_TICKETS', 1,
        '2 boletos Cinepolis', 'Dos boletos al completar la evidencia de onboarding.',
        'FREE_ENTITLEMENT', false, NULL,
        '{"grantTrigger":"ONBOARDING_COMPLETION","requiredEvidence":["confirmation","video","survey"]}',
        'CONTROLLED', 'MANUAL_EMAIL_TICKETS', 'CINEPOLIS',
        '${catalogEffectiveFrom}', NULL,
        'The Cinepolis agreement and fulfillment process are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000303', 'AMAZON_GIFT_CARD_200_REACTIVATION', 1,
        'Tarjeta Amazon de 200 MXN', 'Tarjeta digital para una futura campana de reactivacion.',
        'POINTS', false, NULL,
        '{"campaign":"REACTIVATION","policyStatus":"PENDING"}', 'CAMPAIGN', 'DIGITAL_GIFT_CARD', 'AMAZON',
        '${catalogEffectiveFrom}', NULL,
        'The point price, campaign capacity, availability, and fulfillment agreement are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000304', 'AMAZON_GIFT_CARD_500_PERMANENCE', 1,
        'Tarjeta Amazon de 500 MXN', 'Tarjeta digital ligada a permanencia de 12 meses.',
        'POINTS', false, NULL,
        '{"activeAforeMonths":12}', 'UNLIMITED', 'DIGITAL_GIFT_CARD', 'AMAZON',
        '${catalogEffectiveFrom}', NULL,
        'The point price, availability, and fulfillment agreement are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000305', 'BIRTHDAY_RECOGNITION', 1,
        'Cumpleanos Carobra', 'Correo personalizado ligado al comportamiento de cumpleanos.',
        'FREE_ENTITLEMENT', false, NULL,
        '{"grantTrigger":"BIRTHDAY","requiresVerifiedBirthDate":true}',
        'UNLIMITED', 'AUTOMATED_EMAIL', NULL,
        '${catalogEffectiveFrom}', NULL,
        'A verified birth-date source and notification fulfillment are not enabled.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000306', 'AFORE_ANNIVERSARY_6_MONTH_RECOGNITION', 1,
        'Aniversario de 6 meses', 'Reconocimiento automatico ligado al aniversario AFORE de 6 meses.',
        'FREE_ENTITLEMENT', false, NULL,
        '{"grantTrigger":"AFORE_ANNIVERSARY_6_MONTHS","activeAforeMonths":6}',
        'UNLIMITED', 'AUTOMATED_EMAIL', NULL,
        '${catalogEffectiveFrom}', NULL,
        'The anniversary benefit content and notification fulfillment are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000307', 'PENSION_DIAGNOSTIC_ACCESS', 1,
        'Diagnostico Inteligente de Pension', 'Acceso digital al completar el registro requerido.',
        'FREE_ENTITLEMENT', false, NULL,
        '{"grantTrigger":"ONBOARDING_COMPLETION","requiresCompleteRegistration":true}',
        'UNLIMITED', 'INTERNAL_DIGITAL_ACCESS', NULL,
        '${catalogEffectiveFrom}', NULL,
        'The diagnostic access grant and fulfillment flow is not enabled.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000308', 'QUALITAS_POLICY_DISCOUNT', 1,
        'Descuento en poliza Qualitas', 'Beneficio corporativo aplicado a una poliza de auto.',
        'PRODUCT_BENEFIT', false, NULL,
        '{"provider":"QUALITAS","strategyStatus":"PENDING","candidateStrategies":["AFORE_PLUS_PLATFORM_ACTIVITY","MULTI_PRODUCT_WALLET"]}',
        'CAMPAIGN', 'PARTNER_POLICY_DISCOUNT', 'QUALITAS',
        '${catalogEffectiveFrom}', NULL,
        'The Qualitas strategy, value, campaign capacity, and partner agreement are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000309', 'SKANDIA_PPR_WALLET', 1,
        'Monedero PPR Skandia', 'Valor restringido aplicado al PPR despues de 12 meses activo.',
        'PRODUCT_BENEFIT', false, NULL,
        '{"provider":"SKANDIA","requiresContracting":true,"activeProductMonths":12}',
        'UNLIMITED', 'PARTNER_PRODUCT_WALLET', 'SKANDIA',
        '${catalogEffectiveFrom}', NULL,
        'The Skandia lifecycle adapter, wallet release, and fulfillment agreement are not enabled.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000310', 'CAROBRA_ANNIVERSARY_PARTY', 1,
        'Fiesta Aniversario Carobra', 'Acceso a la fiesta anual de aniversario de Carobra.',
        'POINTS', false, 100000,
        '{"requiresActiveRewardsAccount":true}', 'WAITLIST', 'MANUAL_EVENT_OPERATIONS', NULL,
        '${catalogEffectiveFrom}', NULL,
        'The event date, exact capacity, fulfillment owner, and cancellation policy are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000311', 'CAROBRA_YEAR_END_GALA', 1,
        'Fiesta Fin de Ano Carobra', 'Acceso a la gala anual de fin de ano de Carobra.',
        'POINTS', false, 100000,
        '{"requiresActiveRewardsAccount":true}', 'WAITLIST', 'MANUAL_EVENT_OPERATIONS', NULL,
        '${catalogEffectiveFrom}', NULL,
        'The event date, exact capacity, fulfillment owner, and cancellation policy are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      ),
      (
        '00000000-0000-4000-8000-000000000312', 'PUERTO_VALLARTA_4D3N_COUPLE', 1,
        'Puerto Vallarta 4D/3N para pareja', 'Experiencia de viaje piloto para dos personas.',
        'POINTS', false, 350000,
        '{"requiresActiveRewardsAccount":true}', 'WAITLIST', 'MANUAL_TRAVEL_OPERATIONS', NULL,
        '${catalogEffectiveFrom}', NULL,
        'The exact pilot capacity, travel dates, provider, fulfillment, and cancellation policy are not approved.',
        '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
      );

    INSERT INTO catalog_inventory (
      id, catalog_item_id, total_capacity, reserved_quantity, fulfilled_quantity,
      released_quantity, created_at, updated_at
    ) VALUES
      ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301', NULL, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000302', 500, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000303', 0, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000304', NULL, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000305', NULL, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000306', NULL, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000307', NULL, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-000000000308', 0, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000409', '00000000-0000-4000-8000-000000000309', NULL, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000410', '00000000-0000-4000-8000-000000000310', 0, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-000000000311', 0, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000312', 0, 0, 0, 0, '${catalogEffectiveFrom}', '${catalogEffectiveFrom}');

    UPDATE behavior_rule_versions
    SET effective_to = '${catalogEffectiveFrom}', updated_at = '${catalogEffectiveFrom}'
    WHERE code = 'CATALOG_REDEMPTION' AND version = 1 AND effective_to IS NULL;

    INSERT INTO behavior_rule_versions (
      id, code, version, enabled, point_value, validity_policy,
      evidence_requirements, configuration, effective_from, effective_to,
      disabled_reason, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000116', 'CATALOG_REDEMPTION', 2, false, NULL,
      'NORMAL_18_MONTHS', '{}',
      '{"catalogVersion":"MVP_JUNE_2026","sourceDocument":"Carobra Rewards - Comportamientos, Productos y Compensaciones - Entregable MVP - Junio 2026","pendingDecisions":["MONTHLY_REDEMPTION_LIMIT","FINAL_AVAILABILITY","FULFILLMENT_AGREEMENTS"]}',
      '${catalogEffectiveFrom}', NULL,
      'The MVP catalog is loaded, but the monthly redemption limit, final availability, and fulfillment agreements are not approved.',
      '${catalogEffectiveFrom}', '${catalogEffectiveFrom}'
    );
  `,
  down: `
    DELETE FROM catalog_inventory
    WHERE catalog_item_id IN (
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000304',
      '00000000-0000-4000-8000-000000000305',
      '00000000-0000-4000-8000-000000000306',
      '00000000-0000-4000-8000-000000000307',
      '00000000-0000-4000-8000-000000000308',
      '00000000-0000-4000-8000-000000000309',
      '00000000-0000-4000-8000-000000000310',
      '00000000-0000-4000-8000-000000000311',
      '00000000-0000-4000-8000-000000000312'
    );
    DELETE FROM catalog_items
    WHERE id IN (
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000304',
      '00000000-0000-4000-8000-000000000305',
      '00000000-0000-4000-8000-000000000306',
      '00000000-0000-4000-8000-000000000307',
      '00000000-0000-4000-8000-000000000308',
      '00000000-0000-4000-8000-000000000309',
      '00000000-0000-4000-8000-000000000310',
      '00000000-0000-4000-8000-000000000311',
      '00000000-0000-4000-8000-000000000312'
    );
    DELETE FROM behavior_rule_versions
    WHERE id = '00000000-0000-4000-8000-000000000116';
    UPDATE behavior_rule_versions
    SET effective_to = NULL, updated_at = '${catalogEffectiveFrom}'
    WHERE code = 'CATALOG_REDEMPTION' AND version = 1
      AND effective_to = '${catalogEffectiveFrom}';

    ALTER TABLE catalog_items DROP CONSTRAINT ck_catalog_items_points_price;
    ALTER TABLE catalog_items ADD CONSTRAINT ck_catalog_items_points_price CHECK (
      (mode = 'POINTS' AND point_price IS NOT NULL) OR
      (mode <> 'POINTS' AND point_price IS NULL)
    );
  `,
};
