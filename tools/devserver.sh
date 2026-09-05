#!/bin/sh
# Supervisor for the Vite dev server.
#
# The dev server must stay up: every builder and critic screenshots against it, and a mid-shot death
# costs each of them a retry (it died four times during wave 2). Vite occasionally exits here — most
# often when several agents save files at once — so this restarts it whenever the port stops answering.
#
#   sh tools/devserver.sh start    # start the supervisor (idempotent; safe to call if already running)
#   sh tools/devserver.sh stop     # stop the supervisor and the server
#   sh tools/devserver.sh status   # report whether the port answers
#
# The supervisor writes tools/.devserver.pid and logs to .dev.log.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PIDFILE="$ROOT/tools/.devserver.pid"
LOG="$ROOT/.dev.log"
URL=http://127.0.0.1:5173/

# --max-time is generous on purpose: under concurrent SwiftShader (software GL) renders the host CPU
# saturates and Vite's event loop can take several seconds just to answer a plain HTTP request while
# still being perfectly alive. A tight timeout here was mistaking "busy" for "dead": logged 6 spurious
# restarts, each one killing an in-flight Playwright capture (page.evaluate: "Execution context was
# destroyed, most likely because of a navigation").
up() { curl -sf -o /dev/null --max-time 15 "$URL" 2>/dev/null; }

case "${1:-start}" in
  status)
    if up; then echo "dev server: UP"; else echo "dev server: DOWN"; fi
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "supervisor: running (pid $(cat "$PIDFILE"))"
    else
      echo "supervisor: not running"
    fi
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; fi
    # Match the actual vite binary, never the bare word "vite" — the supervisor's own command line
    # contains that word, so a loose pattern makes it kill itself.
    pkill -f "node.*vite/bin/vite.js" 2>/dev/null || true
    rm -f "$ROOT/tools/.vite.pid"
    echo "stopped"
    ;;
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "supervisor already running (pid $(cat "$PIDFILE"))"; exit 0
    fi
    cd "$ROOT"
    # Supervisor loop: check every 5 s, restart on a dead port. Detached so it outlives this shell.
    # Kill only the child we started, tracked by PID. A pattern-based kill is unsafe here: the
    # supervisor's own command line contains "vite", so pkill -f vite makes it kill itself.
    # Debounced: restart only after 3 CONSECUTIVE failed checks (~45 s of genuine unresponsiveness),
    # not on the first slow tick — see the comment on up() above for why a single miss is not enough
    # evidence under a CPU-saturated SwiftShader workload.
    setsid sh -c '
      cd "'"$ROOT"'"
      CHILD=""
      MISSES=0
      while true; do
        if curl -sf -o /dev/null --max-time 15 '"$URL"' 2>/dev/null; then
          MISSES=0
        else
          MISSES=$((MISSES + 1))
          echo "[devserver] $(date -u +%H:%M:%S) port check failed ($MISSES/3)" >> "'"$LOG"'"
          if [ "$MISSES" -ge 3 ]; then
            echo "[devserver] $(date -u +%H:%M:%S) 3 consecutive misses, (re)starting vite" >> "'"$LOG"'"
            if [ -n "$CHILD" ]; then kill "$CHILD" 2>/dev/null || true; fi
            npx vite >> "'"$LOG"'" 2>&1 &
            CHILD=$!
            echo "$CHILD" > "'"$ROOT"'/tools/.vite.pid"
            MISSES=0
            sleep 8
          fi
        fi
        sleep 10
      done
    ' >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    echo "supervisor started (pid $(cat "$PIDFILE")); waiting for the port"
    i=0
    while [ $i -lt 30 ]; do
      if up; then echo "dev server: UP"; exit 0; fi
      i=$((i + 1)); sleep 1
    done
    echo "dev server: still DOWN after 30 s — check $LOG"; exit 1
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2; exit 2
    ;;
esac
