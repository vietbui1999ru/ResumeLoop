FROM node:22-alpine

# better-sqlite3 native addon needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install app dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Pre-install batch-build deps (docx package)
COPY pipeline/batch-build/package.json ./pipeline/batch-build/
RUN cd pipeline/batch-build && npm install

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000
ENV PORT=3000 NODE_ENV=production

CMD ["npm", "start"]
