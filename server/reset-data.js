import { writeJson } from './lib/jsonStore.js';
await Promise.all(['users.json','likes.json','matches.json','messages.json','reports.json','blocks.json','purchases.json'].map((file) => writeJson(file, [])));
console.log('Pairly demo data reset.');
