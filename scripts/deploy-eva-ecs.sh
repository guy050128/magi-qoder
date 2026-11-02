#!/usr/bin/env bash
# Build and publish an isolated candidate; preserve server-only configuration and runtime state.
set -euo pipefail
HOST="${MAJI_HOST:?Set MAJI_HOST to your deployment user@host}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
RELEASE="eva-$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cd "$ROOT"
MAGI_BASE_PATH=/maji npm run build
mkdir -p "$STAGE/app/.next"
cp -a .next/standalone/. "$STAGE/app/"
cp -a .next/static "$STAGE/app/.next/static"
cp -a public "$STAGE/app/public"
# Runtime secrets, account state and counters come only from the current server.
find "$STAGE/app" -type f -name '.env*' -delete
find "$STAGE/app" -maxdepth 1 -name '.magi*' -exec rm -rf {} +
tar -czf "$STAGE/release.tgz" -C "$STAGE/app" .
DIGEST=$(shasum -a 256 "$STAGE/release.tgz" | awk '{print $1}')
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$HOST" 'mkdir -p /opt/maji-releases/incoming'
scp -q -o BatchMode=yes -o StrictHostKeyChecking=yes "$STAGE/release.tgz" "$HOST:/opt/maji-releases/incoming/$RELEASE.tgz"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$HOST" bash -s -- "$RELEASE" "$DIGEST" <<'REMOTE'
set -euo pipefail
release="$1"
digest="$2"
base=/opt/maji-releases
archive="$base/incoming/$release.tgz"
candidate="$base/$release-candidate"
previous="$base/$release-previous"
failed="$base/$release-failed"
unit="maji-candidate-$release"
port=18083
[ -d /opt/maji ] && [ ! -e "$candidate" ] && [ ! -e "$previous" ] && [ ! -e "$failed" ]
printf '%s  %s\n' "$digest" "$archive" | sha256sum -c -
if [ -n "$(ss -ltnH '( sport = :18083 )')" ]; then
  echo 'Candidate port is in use; current production remains unchanged.' >&2
  exit 1
fi
config_before=$(sha256sum /etc/maji.env | cut -d ' ' -f1)
mkdir "$candidate"
tar --no-same-owner -xzf "$archive" -C "$candidate"
copy_runtime() {
  local from="$1" to="$2" name staging
  staging=$(mktemp -d "$to/.runtime-copy.XXXXXX") || return 1
  # Verify the complete snapshot before changing the destination. On failure,
  # retain staging and both releases so the authoritative source stays recoverable.
  for name in .magi-state.json .magi-usage.json .magi-debug; do
    if [ -e "$from/$name" ] || [ -L "$from/$name" ]; then
      cp -a -- "$from/$name" "$staging/$name" || return 1
      diff -qr -- "$from/$name" "$staging/$name" >/dev/null || return 1
    fi
  done
  for name in .magi-state.json .magi-usage.json .magi-debug; do
    if [ -e "$to/$name" ] || [ -L "$to/$name" ]; then
      mv -T -- "$to/$name" "$staging/old-$name" || return 1
    fi
    if [ -e "$staging/$name" ] || [ -L "$staging/$name" ]; then
      mv -T -- "$staging/$name" "$to/$name" || return 1
    fi
  done
  rm -rf -- "$staging" || return 1
}
http_status() {
  curl --connect-timeout 1 --max-time 3 -s -o /dev/null -w '%{http_code}' "$1"
}
wait_for_service() {
  local port="$1" service="$2" attempt status
  # Twenty probes take at most 70 seconds, including pauses.
  for attempt in $(seq 1 20); do
    if status=$(http_status "http://127.0.0.1:$port/maji") &&
      [ "$status" = 200 ] && systemctl is-active --quiet "$service"; then
      return 0
    fi
    if [ "$attempt" != 20 ]; then sleep .5; fi
  done
  return 1
}
switch_to_previous() (
  # A subshell gives automatic and manual rollback the same recovery handler.
  local previous="$1" replaced="$2" stopped=0 current_saved=0 target_installed=0
  recover_current() {
    local code="$1"
    trap - EXIT
    if [ "$code" = 0 ] || [ "$stopped" != 1 ]; then exit "$code"; fi
    if ! systemctl stop maji; then
      echo 'Rollback recovery blocked: cannot stop the service; all release directories retained.' >&2
      exit "$code"
    fi
    if [ "$current_saved" = 1 ]; then
      if [ "$target_installed" = 1 ]; then
        # The rollback target may already have written newer counters.
        if ! copy_runtime /opt/maji "$replaced" || ! chown -R maji:maji "$replaced"; then
          echo 'Rollback recovery blocked: latest runtime state could not be preserved; service stopped and all directories retained.' >&2
          exit "$code"
        fi
        if ! mv -T -- /opt/maji "$previous"; then
          echo 'Rollback recovery blocked: cannot retain the rollback target; service stopped and all directories retained.' >&2
          exit "$code"
        fi
      fi
      if ! mv -T -- "$replaced" /opt/maji; then
        echo 'Rollback recovery blocked: cannot restore the pre-rollback directory; service stopped and all directories retained.' >&2
        exit "$code"
      fi
    fi
    if chown -R maji:maji /opt/maji && systemctl start maji && wait_for_service 8083 maji; then
      echo 'Rollback failed; the pre-rollback release was recovered and passed its health check.' >&2
    else
      echo 'Rollback failed; recovery did not pass its health check. Release directories retained.' >&2
    fi
    exit "$code"
  }
  trap 'recover_current "$?"' EXIT
  [ -d "$previous" ] && [ -d /opt/maji ] && [ ! -e "$replaced" ] || exit 1
  stopped=1
  systemctl stop maji || exit 1
  copy_runtime /opt/maji "$previous" || exit 1
  chown -R maji:maji "$previous" || exit 1
  mv -T -- /opt/maji "$replaced" || exit 1
  current_saved=1
  mv -T -- "$previous" /opt/maji || exit 1
  target_installed=1
  systemctl start maji || exit 1
  wait_for_service 8083 maji || exit 1
)
copy_runtime /opt/maji "$candidate"
chown -R maji:maji "$candidate"
cleanup_candidate() { systemctl stop "$unit" >/dev/null 2>&1 || true; }
production_stopped=0
finish() {
  local code="$1"
  trap - EXIT
  cleanup_candidate
  if [ "$code" != 0 ] && [ "$production_stopped" = 1 ]; then
    if [ -d "$previous" ] && [ -d /opt/maji ]; then
      if switch_to_previous "$previous" "$failed"; then
        echo 'Promotion failed; original version restored and passed its health check.' >&2
      else
        echo 'Promotion failed; rollback did not complete. Release directories retained for recovery.' >&2
      fi
    else
      # Promotion may have failed between its two renames, or before either one.
      if ! systemctl stop maji; then
        echo 'Promotion recovery blocked: cannot stop the service; release directories retained.' >&2
        exit "$code"
      fi
      if [ -d "$previous" ] && ! mv -T -- "$previous" /opt/maji; then
        echo 'Promotion recovery blocked: cannot restore the original directory; release directories retained.' >&2
        exit "$code"
      fi
      if chown -R maji:maji /opt/maji && systemctl start maji && wait_for_service 8083 maji; then
        echo 'Promotion failed; original version restored and passed its health check.' >&2
      else
        echo 'Promotion recovery failed its health check; release directories retained.' >&2
      fi
    fi
  fi
  exit "$code"
}
trap 'finish "$?"' EXIT
systemd-run --quiet --unit="$unit" --property=User=maji --property=Group=maji \
  --property=WorkingDirectory="$candidate" --property=EnvironmentFile=/etc/maji.env \
  --property=MemoryMax=512M --property=TasksMax=128 --property=NoNewPrivileges=true \
  --setenv=PORT="$port" --setenv=HOSTNAME=127.0.0.1 /opt/node/bin/node server.js
if ! wait_for_service "$port" "$unit"; then
  echo 'Candidate failed to start; current production remains unchanged.' >&2
  exit 1
fi
for path in /maji/eva/index.html /maji/eva/live.js /maji/eva/fonts.css /maji/eva/frame-data.js /maji/fonts/TsukuhouShogoMin.woff2 '/maji?view=classic'; do
  status=$(http_status "http://127.0.0.1:$port$path") || { echo "Candidate resource probe failed: $path" >&2; exit 1; }
  [ "$status" = 200 ] || { echo "Candidate resource failed: $path ($status)" >&2; exit 1; }
done
cleanup_candidate
# Stop before the final copy, so the retained ledger includes every completed write.
production_stopped=1
systemctl stop maji
copy_runtime /opt/maji "$candidate"
chown -R maji:maji "$candidate"
mv -T -- /opt/maji "$previous"
mv -T -- "$candidate" /opt/maji
systemctl start maji || true
if ! wait_for_service 8083 maji; then
  echo 'New version unhealthy; restoring original version.' >&2
  exit 1
fi
[ "$config_before" = "$(sha256sum /etc/maji.env | cut -d ' ' -f1)" ]
{
cat <<'ROLLBACK'
#!/usr/bin/env bash
set -euo pipefail
ROLLBACK
declare -f copy_runtime http_status wait_for_service switch_to_previous
printf 'switch_to_previous %q %q\n' "$previous" "$base/$release-replaced"
printf '%s\n' "echo 'Rollback completed and passed its health check.'"
} > "$base/$release-rollback.sh"
chmod 750 "$base/$release-rollback.sh"
printf '%s\n' "$release" > "$base/current-eva-release"
systemctl is-active maji
status=$(http_status http://127.0.0.1:8083/maji)
[ "$status" = 200 ]
production_stopped=0
printf 'RELEASE=%s\nPREVIOUS=%s\nROLLBACK=%s\n' "$release" "$previous" "$base/$release-rollback.sh"
printf 'Production /maji: '
printf '%s\n' "$status"
REMOTE
