import { runScan } from '../scanner/scanner';

runScan()
  .then((result) => {
    console.log(`Scan complete: ${result.added} tracks indexed out of ${result.scanned} files found (${result.durationMs}ms)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Scan failed:', err);
    process.exit(1);
  });
