FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY app.js /usr/share/nginx/html/app.js
COPY default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
