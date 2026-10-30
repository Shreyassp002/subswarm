import sqlite3
from datetime import datetime, timezone
from pathlib import Path

source = Path('/var/lib/subswarm/subswarm.sqlite')
backups = source.parent / 'backups'
backups.mkdir(mode=0o700, exist_ok=True)
destination = backups / ('subswarm-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite')
with sqlite3.connect(f'file:{source}?mode=ro', uri=True) as live:
    with sqlite3.connect(destination) as snapshot:
        live.backup(snapshot)
destination.chmod(0o600)
for old in sorted(backups.glob('subswarm-*.sqlite'))[:-7]:
    old.unlink()
print('SQLite backup completed.')
