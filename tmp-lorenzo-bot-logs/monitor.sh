#!/bin/bash
W=0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c
B="https://monadier-production.up.railway.app"
OUT=tmp-lorenzo-bot-logs/live_monitor.log
for i in $(seq 1 120); do
  TS=$(date -u +%H:%M:%S)
  SNAP=$(curl -s --max-time 20 "$B/api/bot-status?wallet=$W")
  BLK=$(curl -s --max-time 20 "$B/api/hl-open-blocks?wallet=$W")
  echo "$SNAP" | python3 -c "
import json,sys
ts='$TS'
try:
    d=json.load(sys.stdin)
except: 
    print(ts,'ERR status'); sys.exit()
hl=d['hyperliquid']; gs=d.get('globalScan',{})
open_=hl['openCoins']
best=gs.get('best') or {}
loe=d.get('lastOpenError') or {}
print(f\"[{ts}] OPEN={open_} cand={gs.get('candidateCount')} best={best.get('coin','-')}/{best.get('direction','-')}/{best.get('confidence','-')} lastErr={loe.get('coin','-')}:{str(loe.get('error',''))[:60]}\")
"
  echo "$BLK" | python3 -c "
import json,sys
ts='$TS'
try:
    d=json.load(sys.stdin)
except:
    print('   blocks ERR'); sys.exit()
print('   byGate', d.get('byGate'), 'newest', (d['blocks'][0]['recorded_at'][11:19] if d.get('blocks') else '-'))
"
  sleep 90
done >> "$OUT" 2>&1
echo "monitor finished" >> "$OUT"
