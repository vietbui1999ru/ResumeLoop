#!/usr/bin/env bash
set -euo pipefail

# Wire the GitHub deploy key from the host-mounted secret file.
# Key is mounted read-only at /run/secrets/github_deploy_key via Compose.
# Never baked into the image — stays out of docker history and image layers.
KEY_SRC=/run/secrets/github_deploy_key
if [[ -f "$KEY_SRC" ]]; then
    cp "$KEY_SRC" /root/.ssh/id_ed25519
    chmod 600 /root/.ssh/id_ed25519
fi

exec "$@"
