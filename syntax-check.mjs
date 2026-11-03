import fs from 'fs';
import path from 'path';
const dir = 'public/dashboard/assets/js';
const files = process.argv.slice(2);
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    new (Object.getPrototypeOf(async function(){}).constructor)(src);
    console.log('FAIL ' + f + ' : contains non-async-safe top-level? skip');
  } catch (e) { /* constructor can't parse import/export, ignore */ }
  try {
    await import(path.resolve(f));
    console.log('OK   ' + f);
  } catch (e) {
    if (e instanceof SyntaxError) console.log('SYNTAX ' + f + ' -> ' + e.message + ' @' + (e.stack.split('\n')[1] || '').trim());
    else console.log('OK   ' + f + ' (parsed; load error: ' + e.code + ')');
  }
}
