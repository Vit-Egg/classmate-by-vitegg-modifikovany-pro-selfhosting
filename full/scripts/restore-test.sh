#!/usr/bin/env bash
# Zkouška obnovy: otevře zálohu v jednorázovém kontejneru (živá data se nedotknou), zkontroluje databázi a vypíše počty záznamů.
# Použití: ./scripts/restore-test.sh /root/backups/classmate-RRRRMMDD-HHMMSS.db   (bez parametru vezme nejnovější zálohu z /root/backups)
# Spouštěj aspoň jednou za čas, záloha, kterou jsi nikdy neotevřel, je jen naděje.
set -euo pipefail
FILE="${1:-$(ls -1t /root/backups/classmate-2*.db 2>/dev/null | head -n1)}"
[ -n "$FILE" ] && [ -s "$FILE" ] || { echo "Záloha nenalezena. Použití: $0 soubor.db" >&2; exit 1; }
IMAGE="${CLASSMATE_IMAGE:-ghcr.io/classmatecz/classmate:latest}"
echo "Zkouším: $FILE ($(du -h "$FILE" | cut -f1))"
docker run --rm --entrypoint node -v "$(readlink -f "$FILE")":/b/backup.db:ro "$IMAGE" -e "
const D=require('better-sqlite3');
const d=new D('/b/backup.db',{readonly:true});
const ic=d.pragma('integrity_check',{simple:true});
const n=t=>{try{return d.prepare('SELECT COUNT(*) c FROM '+t).get().c}catch{return '?'}};
console.log('integrity_check:',ic);
console.log('migrace:',d.prepare('SELECT MAX(id) m FROM _migrations').get().m);
console.log('uživatelé:',n('users'),'| školy:',n('schools'),'| úkoly:',n('tasks'),'| poznámky:',n('notes'));
process.exit(ic==='ok'?0:1)"
echo "Záloha je čitelná a v pořádku."
