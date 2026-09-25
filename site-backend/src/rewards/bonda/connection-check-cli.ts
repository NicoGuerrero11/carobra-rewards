import { runBondaConnectionCheck } from './connection-check-command.js';

process.exitCode = await runBondaConnectionCheck(process.env, output => process.stdout.write(output));
