#!/bin/sh
# Starts ComfyUI on port 8188; arguments go to ComfyUI (--cpu without a GPU).
# Uploaded pictures and results are only needed for the request that made them:
# anything older than an hour is deleted (ComfyUI has no API to delete files).
set -e
mkdir -p /tmp/comfy/input /tmp/comfy/output
(while sleep 3600; do find /tmp/comfy -type f -mmin +60 -delete; done) &
exec python /comfy/main.py --listen 0.0.0.0 --port 8188 --disable-auto-launch \
    --preview-method none --input-directory /tmp/comfy/input --output-directory /tmp/comfy/output "$@"
