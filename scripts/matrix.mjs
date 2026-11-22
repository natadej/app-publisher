import fs from 'node:fs';
import { selectApps } from './lib.mjs';
const registry = JSON.parse(fs.readFileSync('apps.json'));
console.log(JSON.stringify(selectApps(registry, process.env.APP || 'all', process.env.PLATFORM || 'both')));
