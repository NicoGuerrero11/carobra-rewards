import { randomInt, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { asCustomerId, type RewardsAccountId } from '../shared/identifiers.js';
import { PostgresProductFactRepository } from '../v2/product-facts.js';
import { PostgresJourneyLevelStore } from '../v2/level-decisions.js';
import { PostgresRewardsV2RuleLookup } from '../v2/configuration.js';
import { evaluateRewardsLevel } from '../v2/level-engine.js';
import type {RewardsJourneyId} from '../shared/identifiers.js';

export const affiliationFixture = {
  email: 'revision.bonda.bronce.20261008@carobra.test',
  firstName: 'Prueba', lastName: 'Bonda Automatica',
  // Intentionally invalid birth date: synthetic marker, never a person's CURP.
  curp: 'BOND000000HDFXXX00', phone: '0000000000',
  postalCode: '00000', state: 'PRUEBA', city: 'PRUEBA',
  source: 'BONDA_AFFILIATION_QA', productType: 'SYNTHETIC_AFFILIATION_TEST',
} as const;

/** Operator-only fixture. Never imported by the HTTP server or a scheduler. */
export async function prepareAffiliationFixture(database: Pool) {
  const client = await database.connect();
  let created = false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(202610089)');
    const control = (await client.query('SELECT capture_enabled FROM bonda_affiliation_event_controls WHERE singleton')).rows[0];
    if (!control?.capture_enabled) throw Error('FIXTURE_REQUIRES_EVENT_CAPTURE');
    const existing = await client.query('SELECT id FROM customers WHERE email=$1 OR curp=$2', [affiliationFixture.email, affiliationFixture.curp]);
    if (existing.rows.length) {
      await client.query('ROLLBACK');
    } else {
    const customerId = randomUUID(); const accountId = randomUUID();
    // Same opaque numeric range and cryptographic randomness as NumericRewardsIdGenerator.
    const rewardsId = String(randomInt(100_000_000, 1_000_000_000));
    await client.query(`INSERT INTO customers (id,rewards_id,curp,first_name,last_name,email,phone,postal_code,state,city,
      customer_status,onboarding_status,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE','COMPLETED',now(),now())`,
    [customerId,rewardsId,affiliationFixture.curp,affiliationFixture.firstName,affiliationFixture.lastName,
      affiliationFixture.email,affiliationFixture.phone,affiliationFixture.postalCode,affiliationFixture.state,affiliationFixture.city]);
    await client.query(`INSERT INTO rewards_accounts(id,customer_id,status,activated_at,created_at,updated_at)
      VALUES ($1,$2,'ACTIVE',now(),now(),now())`, [accountId,customerId]);
    await client.query(`INSERT INTO rewards_v2_journeys(id,account_id,customer_id,state,registered_at,created_at,updated_at)
      VALUES ($1,$2,$3,'INVITED',now(),now(),now())`, [randomUUID(),accountId,customerId]);
    await client.query('COMMIT');
    created = true;
    }
  } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); throw error; }
  finally { client.release(); }
  return { created, ...await inspectAffiliationFixture(database) };
}

export async function activateAffiliationFixture(database: Pool) {
  const before = await inspectAffiliationFixture(database);
  if (!['INVITED','ACTIVE'].includes(before.journeyState) || ![null,'BRONZE'].includes(before.level)) throw Error('FIXTURE_STATE_MISMATCH');
  if (before.journeyState === 'INVITED' && before.affiliationState === 'ACTIVE') throw Error('FIXTURE_ALREADY_AFFILIATED_BEFORE_BRONZE');
  const customerId = asCustomerId(before.customerId);
  const facts = new PostgresProductFactRepository(database);
  const existingFacts = await facts.listForCustomer(customerId);
  if (existingFacts.some(fact => fact.source !== affiliationFixture.source)) throw Error('FIXTURE_HAS_OTHER_PRODUCTS');
  const now = new Date();
  const rule = await new PostgresRewardsV2RuleLookup(database).findEffective('V2_FIRST_ACTIVE_PRODUCT_LEVEL',now);
  if (!rule?.enabled || !rule.approvedForProduction || rule.settings.resultingLevel !== 'BRONZE'
      || rule.settings.minimumActiveProducts !== 1) throw Error('FIXTURE_FIRST_PRODUCT_RULE_UNAVAILABLE');
  await facts.record({ accountId:before.accountId as RewardsAccountId, customerId,
    provider:'SYNTHETIC_QA', productType:affiliationFixture.productType,
    status:'ACTIVE', source:affiliationFixture.source, sourceId:before.customerId,
    safeEvidence:{synthetic:true,purpose:'automatic_affiliation_verification',notFinancialProduct:true},
    occurredAt:existingFacts[0]?.activatedAt ?? now, receivedAt:now, acceptedAt:existingFacts[0]?.acceptedAt ?? now, activatedAt:existingFacts[0]?.activatedAt ?? now });
  // Use the effective production first-product rule, the canonical evaluator and
  // decision store. General V2_LEVEL_PRECEDENCE is deliberately not enabled here.
  const activeProductCount=(await facts.listForCustomer(customerId)).filter(fact=>fact.status==='ACTIVE'
    && fact.activatedAt!==null && fact.activatedAt<=now).length;
  const evaluation=evaluateRewardsLevel({currentLevel:before.level==='BRONZE'?'BRONZE':null,
    activeProductCount,registrationMonths:0,qualifyingActivityCount:0,
    matrix:{productThresholds:[{level:'BRONZE',minimumActiveProducts:rule.settings.minimumActiveProducts}],silver:null}});
  if(evaluation.resultingLevel!=='BRONZE')throw Error('FIXTURE_DID_NOT_REACH_BRONZE');
  const result=await new PostgresJourneyLevelStore(database).applyDecision({
    journeyId:before.journeyId as RewardsJourneyId,ruleVersionId:rule.id,
    resultingLevel:evaluation.resultingLevel,resultingState:'ACTIVE',redemptionEligible:false,
    triggerType:affiliationFixture.source,triggerId:before.customerId,
    decisionInputs:{...evaluation.decisionInputs,synthetic:true,notFinancialProduct:true},
    reasonCode:'FIRST_ACTIVE_PRODUCT',idempotencyKey:`qa-first-product:${before.customerId}:${rule.id}`,decidedAt:now});
  return {replayed:result.replayed,...await inspectAffiliationFixture(database)};
}

export async function inspectAffiliationFixture(database: Pool) {
  const rows = (await database.query(`SELECT c.id::text AS customer_id,c.rewards_id,c.curp,c.first_name,c.last_name,
    j.id::text AS journey_id,a.id::text AS account_id,a.available_points::text,a.reserved_points::text,j.state,j.current_level,
    p.state AS affiliation_state,p.attempt_count,
    q.generation::text,q.processed_generation::text,
    (SELECT count(*)::int FROM ledger_entries l WHERE l.account_id=a.id) AS ledger_entries,
    (SELECT count(*)::int FROM reward_events r WHERE r.account_id=a.id) AS reward_events
    FROM customers c JOIN rewards_accounts a ON a.customer_id=c.id
    JOIN rewards_v2_journeys j ON j.customer_id=c.id
    LEFT JOIN bonda_affiliate_provisioning p ON p.customer_id=c.id
    LEFT JOIN bonda_affiliation_events q ON q.customer_id=c.id WHERE c.email=$1`,[affiliationFixture.email])).rows;
  const row=rows[0];
  if(rows.length!==1 || row.curp!==affiliationFixture.curp || row.first_name!==affiliationFixture.firstName
    || row.last_name!==affiliationFixture.lastName || !/^[1-9][0-9]{8}$/.test(row.rewards_id)) throw Error('FIXTURE_IDENTITY_MISMATCH');
  if(row.available_points!=='0' || row.reserved_points!=='0' || row.ledger_entries!==0 || row.reward_events!==0) throw Error('FIXTURE_HAS_POINTS');
  return {customerId:row.customer_id as string,rewardsId:row.rewards_id as string,accountId:row.account_id as string,
    journeyId:row.journey_id as string,journeyState:row.state as string,level:row.current_level as string|null,affiliationState:row.affiliation_state as string|null,
    attempts:row.attempt_count as number|null,eventGeneration:row.generation as string|null,
    processedGeneration:row.processed_generation as string|null,ledgerEntries:0,rewardEvents:0};
}
