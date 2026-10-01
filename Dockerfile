FROM node:24-alpine
WORKDIR /app
COPY package.json index.html app.js api-config.json ./
COPY css ./css
COPY vendor ./vendor
COPY data ./data
COPY tools/server.mjs tools/place-service.mjs tools/route-service.mjs ./tools/
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
ENV PUBLIC_ORIGIN=https://psinserver-jpg.github.io
EXPOSE 8080
CMD ["node", "tools/server.mjs"]
