FROM node:18-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 7001
CMD ["npm", "start"]
