import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, 'fixtures');

export const fixture = (name: string) => readFileSync(join(dir, name), 'utf8');
