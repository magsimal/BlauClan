FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production || true
COPY src ./src
EXPOSE 3009
CMD ["npm", "start"]
