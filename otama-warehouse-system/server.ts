import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } catch (e) {
    console.warn("Firebase Admin could not initialize. Some admin features may not work.");
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      adminInitialized: !!admin.apps.length,
      projectId: firebaseConfig.projectId 
    });
  });

  // API Route to create staff account (Admin only)
  app.post("/api/create-staff", async (req, res) => {
    console.log("Received create-staff request:", req.body.username);
    const { username, password, displayName, adminToken } = req.body;

    if (!username || !password || !displayName || !adminToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Verify Admin Token
      console.log("Verifying admin token...");
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      console.log("Token decoded for:", decodedToken.email);
      
      if (decodedToken.email !== "trungg9870@gmail.com") {
        console.warn("Unauthorized attempt by:", decodedToken.email);
        return res.status(403).json({ error: "Unauthorized. Only the main admin can create accounts." });
      }

      // Create user with dummy email
      const email = `${username}@otama.local`;
      console.log("Creating user in Firebase Auth:", email);
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });

      console.log("User created successfully:", userRecord.uid);
      res.json({ uid: userRecord.uid, email: userRecord.email });
    } catch (error: any) {
      console.error("Error in create-staff API:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
