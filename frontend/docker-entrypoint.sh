#!/bin/sh
set -e
# Substitute BACKEND_PORT env var into nginx config
envsubst '$BACKEND_PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
