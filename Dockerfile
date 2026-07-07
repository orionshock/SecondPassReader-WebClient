FROM node:lts-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/secondpass-client/package.json packages/secondpass-client/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
