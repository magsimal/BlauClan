#!/bin/sh
set -e
# Substitute BACKEND_PORT env var into nginx config
envsubst '$BACKEND_PORT $RELATIVE_ATTRACTION $SHOW_DELETE_ALL_BUTTON' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
# Substitute relative attraction into client config
if [ -f /usr/share/nginx/html/src/config.js ]; then
  envsubst '$RELATIVE_ATTRACTION $SHOW_DELETE_ALL_BUTTON' < /usr/share/nginx/html/src/config.js > /usr/share/nginx/html/src/config.js.tmp \
    && mv /usr/share/nginx/html/src/config.js.tmp /usr/share/nginx/html/src/config.js
fi
exec nginx -g 'daemon off;'
