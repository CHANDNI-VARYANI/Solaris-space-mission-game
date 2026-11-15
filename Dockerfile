FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3001 5173

CMD ["npm", "run", "dev"]
