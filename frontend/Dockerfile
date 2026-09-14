FROM node:22-alpine AS build
WORKDIR /app
ENV NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_LOGLEVEL=error
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /etc/nginx/ssl \
    && openssl req -x509 -nodes -newkey rsa:2048 \
       -keyout /etc/nginx/ssl/mips.local-key.pem \
       -out /etc/nginx/ssl/mips.local.pem \
       -days 3650 -subj "/CN=mips.local" 2>/dev/null
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]