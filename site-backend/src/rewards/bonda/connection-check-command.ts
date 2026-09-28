import { loadConfig } from '../../config.js';
import { checkBondaConnection, configurationFailure, type BondaConnectionReport } from './connection-check.js';

export async function runBondaConnectionCheck(
  environment: NodeJS.ProcessEnv,
  write: (output: string) => void,
  request: typeof fetch = fetch,
): Promise<number> {
  let report: BondaConnectionReport;
  try {
    report = await checkBondaConnection(loadConfig(environment).bonda, request);
  } catch {
    // loadConfig errors can contain untrusted environment values. Never print them.
    report = configurationFailure();
  }
  write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ready ? 0 : 1;
}
