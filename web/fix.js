const fs = require('fs');
const files = ['src/app/browse/page.tsx', 'src/app/escrow/[id]/page.tsx', 'src/app/me/page.tsx'];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
  
  // Also fixing PyPI url for escrow/[id]/page.tsx
  if (file === 'src/app/escrow/[id]/page.tsx') {
    content = content.replace(
      'https://pypi.org/pypi/${escrow.package_name}/json',
      'https://pypi.org/pypi/${escrow.package_name}/${escrow.version}/json'
    );
  }
  
  fs.writeFileSync(file, content);
}
console.log("Fixed!");
