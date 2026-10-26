#!/bin/sh
# Start the API as `node`, not root. The only reason we begin as root is the
# ./data bind mount: the Docker daemon creates it root-owned on first up.
set -e
if [ -d /data ]; then
  chown -R node:node /data 2>/dev/null || true
fi
exec setpriv --reuid=node --regid=node --init-groups node "$@"
