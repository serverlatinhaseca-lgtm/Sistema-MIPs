FROM node:22-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_LOGLEVEL=error
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
EXPOSE 7001
CMD ["npm", "start"]
