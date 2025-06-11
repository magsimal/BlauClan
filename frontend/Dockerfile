FROM nginx:alpine
WORKDIR /usr/share/nginx/html
# Copy all root level JS, CSS and HTML files so new assets don't require Dockerfile changes.
COPY *.html *.js *.css ./
COPY assets ./assets
COPY src ./src
COPY default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
