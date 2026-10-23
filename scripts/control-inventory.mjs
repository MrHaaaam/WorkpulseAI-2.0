import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const controls = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(filename);
    else if (filename.endsWith('.tsx')) {
      const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          const attrs = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(source), attribute.initializer?.getText(source) || 'true']));
          if (['button', 'Button', 'a', 'select', 'form'].includes(tag) || (['input', 'Input'].includes(tag) && /checkbox|radio|date|month/.test(attrs.type || ''))) {
            const parent = ts.isJsxOpeningElement(node) ? node.parent : node;
            const text = ts.isJsxElement(parent) ? parent.children.filter(ts.isJsxText).map(child => child.text.trim()).join(' ').trim() : '';
            controls.push({ file: filename.replaceAll('\\', '/'), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, tag, label: attrs['aria-label'] || text || attrs.title || '(dynamic or icon control)', handler: attrs.onClick || attrs.onChange || attrs.onSubmit || attrs.href || '', disabled: attrs.disabled || '' });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
await scan('src');
await writeFile('docs/button-audit-inventory.json', JSON.stringify({ scope: 'Current JSX control declarations, including conditional and repeated controls. This inventory is not evidence that every control was clicked.', count: controls.length, controls }, null, 2) + '\n');
console.log(`${controls.length} control declarations inventoried.`);
