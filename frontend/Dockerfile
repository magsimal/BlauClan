FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY app.js /usr/share/nginx/html/app.js
COPY flow.js /usr/share/nginx/html/flow.js
COPY vue.global.js /usr/share/nginx/html/vue.global.js
COPY vue.global.prod.js /usr/share/nginx/html/vue.global.prod.js
COPY vue-flow-core.iife.js /usr/share/nginx/html/vue-flow-core.iife.js
COPY vue-flow-style.css /usr/share/nginx/html/vue-flow-style.css
COPY assets /usr/share/nginx/html/assets
COPY default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
