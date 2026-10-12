import { Pool } from 'pg';
import { loadConfig } from '../../config.js';
import { affiliationFixture,prepareAffiliationFixture,activateAffiliationFixture,inspectAffiliationFixture } from './affiliate-fixture.js';
import { BondaHttpGateway } from './http-gateway.js';

const operation=process.argv[2]??'--plan';
if(operation==='--plan') console.log(JSON.stringify({fixture:affiliationFixture,operations:['--prepare','--activate','--verify'],
  createsAuthCredentials:false,sendsProfile:false,awardsPoints:false,manualAffiliatePost:false}));
else if(!['--prepare','--activate','--verify'].includes(operation)) {console.error('FIXTURE_INVALID_OPERATION');process.exitCode=1;}
else {
  const config=loadConfig();
  if(!config.databaseUrl || !config.bonda?.affiliateProvisioningEnabled || config.bonda.localPreviewEnabled
      || config.bonda.points?.sendEnabled || config.bonda.profileSync?.enabled) throw Error('FIXTURE_CONFIGURATION_NOT_READY');
  const database=new Pool({connectionString:config.databaseUrl});
  try {
    const result=operation==='--prepare'?await prepareAffiliationFixture(database)
      :operation==='--activate'?await activateAffiliationFixture(database):await inspectAffiliationFixture(database);
    const externalConfirmed=operation==='--verify'?await new BondaHttpGateway(config.bonda).affiliateExists(result.rewardsId):undefined;
    console.log(JSON.stringify({...result,...(externalConfirmed===undefined?{}:{externalConfirmed})}));
  }catch {console.error('AFFILIATION_FIXTURE_FAILED_REVIEW_REQUIRED');process.exitCode=1;}
  finally {await database.end();}
}
