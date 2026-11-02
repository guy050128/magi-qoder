#!/usr/bin/env bash
# 重新部署 maji 到 ECS：本地构建 standalone（basePath=/maji）→ 打包 → 上传 → 只换代码不动 /etc/maji.env
set -euo pipefail
HOST="${MAJI_HOST:?Set MAJI_HOST to your deployment user@host}"
APP=/opt/maji
cd "$(dirname "$0")/.."

echo "==> build (MAGI_BASE_PATH=/maji)"
MAGI_BASE_PATH=/maji npm run build

STAGE=$(mktemp -d)
mkdir -p "$STAGE/maji"
cp -a .next/standalone/. "$STAGE/maji/"
mkdir -p "$STAGE/maji/.next"
cp -a .next/static "$STAGE/maji/.next/static"
cp -a public "$STAGE/maji/public"
[ -f .magi-state.json ] && cp .magi-state.json "$STAGE/maji/"
tar -czf "$STAGE/maji.tgz" -C "$STAGE" maji

echo "==> upload + swap"
scp -C -q "$STAGE/maji.tgz" "$HOST:/root/maji.tgz"
ssh "$HOST" "set -e
  rm -rf /opt/maji-new && mkdir -p /opt/maji-new
  tar --warning=no-unknown-keyword -xzf /root/maji.tgz -C /opt/maji-new
  # 保留服务器上的用量账本，别把当日 credits 计数清零
  [ -f $APP/.magi-usage.json ] && cp $APP/.magi-usage.json /opt/maji-new/maji/ || true
  rm -rf $APP.old && (mv $APP $APP.old || true) && mv /opt/maji-new/maji $APP
  chown -R maji:maji $APP
  systemctl restart maji
  sleep 3
  systemctl is-active maji
  curl -s -o /dev/null -w 'local /maji -> %{http_code}\n' http://127.0.0.1:8083/maji"
rm -rf "$STAGE"
echo "==> deployed /maji to $HOST"
