FROM node:18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

# Declare build args for important env vars (Railway will inject these automatically)
ARG SHOPIFY_APP_URL
ARG SHOPIFY_API_KEY
ARG SHOPIFY_API_SECRET
ARG SCOPES
ARG HOST

# Make sure they're available at runtime as well
ENV NODE_ENV=production \
    SHOPIFY_APP_URL=${SHOPIFY_APP_URL} \
    SHOPIFY_API_KEY=${SHOPIFY_API_KEY} \
    SHOPIFY_API_SECRET=${SHOPIFY_API_SECRET} \
    SCOPES=${SCOPES} \
    HOST=${HOST}

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

# Remove CLI packages since we don't need them in production by default.
RUN npm remove @shopify/cli || true

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
