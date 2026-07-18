FROM node:lts-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/secondpass-client/package.json packages/secondpass-client/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

RUN apk add --no-cache jq
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-secondpass-servers.sh
RUN chmod +x /docker-entrypoint.d/40-secondpass-servers.sh

CMD ["nginx", "-g", "daemon off;"]
