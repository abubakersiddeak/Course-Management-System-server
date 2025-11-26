import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import admin from "firebase-admin";
import serviceAccount from "./firebase-adminsdk.json" with { type: "json" };

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

// firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// --- Middleware ---
app.use(cors());
app.use(express.json());

//  Middleware for Firebase Token Verification
async function verifyFirebaseToken(req, res, next) {
  console.log("hit verifyFirebase Middleware");
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized - Missing Token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;

    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(403).json({ message: "Invalid or expired token" });
  }
}

// --- MongoDB Connection ---
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    const db = client.db("courseManagementDb");

    // Collections
    const courses = db.collection("courses");

    console.log(" MongoDB connected successfully!");
    app.get("/", (req, res) => {
      res.send(" Course Management API is running successfully!");
    });

    // Ping the server
    // await db.command({ ping: 1 });
    console.log(" Pinged MongoDB — connection verified.");
  } catch (error) {
    console.error(" Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// Start server
app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});
