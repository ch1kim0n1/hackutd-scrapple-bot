import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { buildProfiles } from '../src/opponents.js';
const history = JSON.parse(readFileSync('data/learning/history.json', 'utf8'));
const profiles = buildProfiles(history.leaders, history.matches);
const result = { asOf: history.fetchedAt, profiles, limitations: [
  'Only winning bids are archived; losing bids are unobserved.',
  'Private starting letters are unknown. Rack sizes are observable; letter composition is only partially known.',
  'Opening-state features exclude events later in the auction window. Actual bid submission times are unknown.',
  'Top-ranked bots can have different opponent pools, table sizes, versions and activity dates.',
  'These are behavioral approximations, not the opponents\' source code.',
] };
writeFileSync('data/learning/profiles.json.tmp', JSON.stringify(result)); renameSync('data/learning/profiles.json.tmp', 'data/learning/profiles.json');
console.log(JSON.stringify(profiles.map(({ bidObservations, letterBids, ...p }) => p), null, 2));
