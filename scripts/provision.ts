import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { DbConnection } from '../src/module_bindings/index.js';
import { BOT_ID, DATABASE, HOST, loadToken, saveToken } from '../src/config.js';

if (loadToken()) {
  console.log('A bot credential already exists locally; leaving it in place.');
  process.exit(0);
}
const cli = process.env.SPACETIME_CLI ?? `${homedir()}/.local/bin/spacetime`;
const run = (args: string[]) => execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
run(['call', '--server', HOST, DATABASE, 'mint_credential_nonce']);
const query = JSON.parse(run(['sql', '--server', HOST, '--format', 'json', DATABASE, 'SELECT * FROM my_nonces']));
const result = query[0];
const fields = result.schema.elements.map((e: { name: { some: string } }) => e.name.some);
const records: Record<string, unknown>[] = result.rows.map((row: unknown[]) => Object.fromEntries(fields.map((name: string, i: number) => [name, row[i]])));
const nonce = records.filter(r => BigInt(String(r.bot_id)) === BOT_ID).at(-1);
if (!nonce || typeof nonce.code !== 'string') throw new Error('No provisioning nonce for the expected bot.');
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Credential provisioning timed out')), 20_000);
  DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
    .onConnect(async (conn, identity, token) => {
      try {
        await conn.reducers.claimCredential({ code: nonce.code as string });
        saveToken(token);
        console.log(`Provisioned a credential for bot ${BOT_ID}; saved with owner-only file permissions.`);
        clearTimeout(timeout); conn.disconnect(); resolve();
      } catch (error) { clearTimeout(timeout); conn.disconnect(); reject(error); }
    })
    .onConnectError((_ctx, error) => { clearTimeout(timeout); reject(error); })
    .build();
});
