# syntax=docker/dockerfile:1.5
FROM node:lts-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/secondpass-client/package.json packages/secondpass-client/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

ARG SECONDPASS_WEBCLIENT_VERSION=development
ARG SECONDPASS_WEBCLIENT_RELEASE_DATE=unknown
ENV SECONDPASS_WEBCLIENT_VERSION=${SECONDPASS_WEBCLIENT_VERSION} \
    SECONDPASS_WEBCLIENT_RELEASE_DATE=${SECONDPASS_WEBCLIENT_RELEASE_DATE}

RUN npm run build

FROM nginx:alpine AS runtime

RUN apk add --no-cache jq
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/entrypoint.sh /docker-entrypoint.d/40-secondpass-servers.sh
RUN chmod +x /docker-entrypoint.d/40-secondpass-servers.sh

EXPOSE 8000
CMD ["nginx", "-g", "daemon off;"]
