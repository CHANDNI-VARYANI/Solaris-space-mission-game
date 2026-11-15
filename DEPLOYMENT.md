# Deployment notes

## Local development
- Use `npm run dev` from the monorepo root.
- The client runs on http://localhost:5173.
- The server runs on http://localhost:3001.

## Production-style deployment
- Deploy the React frontend to Vercel or Netlify.
- Deploy the Express + Socket.IO server to Render or Railway.
- Set `VITE_API_URL` or equivalent environment variables if needed.

## Docker
```bash
docker build -t solaris .
docker run -p 5173:5173 -p 3001:3001 solaris
```
