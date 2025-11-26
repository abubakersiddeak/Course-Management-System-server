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
    console.log(" MongoDB connected successfully!");
    // Collections
    const coursesCullection = db.collection("courses");
    const enrollmentCollection = db.collection("enrollments");

    //APIS
    app.post("/api/addcourse", async (req, res) => {
      const {
        title,
        courses,
        instructor,
        category,
        image,
        price,
        originalPrice,
        duration,
        lessons,
        level,
        description,
        tags,
      } = req.body;
      // const firebaseEmail = req.user.email;
      // if (email !== firebaseEmail) {
      //   return res.status(403).json({ message: "Email mismatch" });
      // }
      const courseData = {
        title: title,
        courses: courses,
        instructor: instructor,
        category: category,
        image: image,
        price: price,
        originalPrice: originalPrice,
        duration: duration,
        lessons: lessons,
        level: level,
        description: description,
        tags: tags, // should be a arry
        rating: 0,
        reviews: 0,
        students: 0,
        bestseller: false,
      };
      try {
        // create new user
        await coursesCullection.insertOne({
          ...courseData,
          createdAt: new Date(),
          ubdatedAt: new Date(),
        });

        res.status(201).json({ message: "courses created successfully" });
      } catch (err) {
        console.error(err);
        console.log(err);
        res.status(500).json({ message: "Error creating courses" });
      }
    });

    app.get("/api/allcourse", async (req, res) => {
      try {
        const courses = await coursesCullection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          total: courses.length,
          data: courses,
        });
      } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({
          success: false,
          message: "Error retrieving courses",
        });
      }
    }); // data should be recived as a {  "success": true, "total": 12,"data":[]} //in use
    // API to enroll in a course
    app.post("/api/enroll", verifyFirebaseToken, async (req, res) => {
      const { courseId, courseName, coursePrice, courseImage } = req.body;
      const firebaseEmail = req.user.email;
      const firebaseUid = req.user.uid;

      try {
        // Check if already enrolled
        const existingEnrollment = await enrollmentCollection.findOne({
          userId: firebaseUid,
          courseId: courseId,
        });

        if (existingEnrollment) {
          return res.status(400).json({
            success: false,
            message: "Already enrolled in this course",
          });
        }

        // Create enrollment
        const enrollmentData = {
          userId: firebaseUid,
          userEmail: firebaseEmail,
          courseId: courseId,
          courseName: courseName,
          coursePrice: coursePrice,
          courseImage: courseImage,
          enrolledAt: new Date(),
          progress: 0,
          completed: false,
          status: "active",
        };

        await enrollmentCollection.insertOne(enrollmentData);

        // Update course student count
        await coursesCullection.updateOne(
          { _id: new ObjectId(courseId) },
          { $inc: { students: 1 } }
        );

        res.status(201).json({
          success: true,
          message: "Successfully enrolled in course",
          data: enrollmentData,
        });
      } catch (err) {
        console.error("Enrollment error:", err);
        res.status(500).json({
          success: false,
          message: "Error enrolling in course",
        });
      }
    });

    // API to get user enrollments
    app.get("/api/my-enrollments", verifyFirebaseToken, async (req, res) => {
      const firebaseUid = req.user.uid;

      try {
        const enrollments = await enrollmentCollection
          .find({ userId: firebaseUid })
          .sort({ enrolledAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          total: enrollments.length,
          data: enrollments,
        });
      } catch (error) {
        console.error("Error fetching enrollments:", error);
        res.status(500).json({
          success: false,
          message: "Error retrieving enrollments",
        });
      }
    });

    // API to get single course by ID
    app.get("/api/course/:id", async (req, res) => {
      const { id } = req.params;

      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid course ID",
          });
        }

        const course = await coursesCullection.findOne({
          _id: new ObjectId(id),
        });

        if (!course) {
          return res.status(404).json({
            success: false,
            message: "Course not found",
          });
        }

        res.status(200).json({
          success: true,
          data: course,
        });
      } catch (error) {
        console.error("Error fetching course:", error);
        res.status(500).json({
          success: false,
          message: "Error retrieving course",
        });
      }
    });

    // API to check if user is enrolled
    app.get(
      "/api/check-enrollment/:courseId",
      verifyFirebaseToken,
      async (req, res) => {
        const { courseId } = req.params;
        const firebaseUid = req.user.uid;

        try {
          const enrollment = await enrollmentCollection.findOne({
            userId: firebaseUid,
            courseId: courseId,
          });

          res.status(200).json({
            success: true,
            isEnrolled: !!enrollment,
            enrollment: enrollment || null,
          });
        } catch (error) {
          console.error("Error checking enrollment:", error);
          res.status(500).json({
            success: false,
            message: "Error checking enrollment status",
          });
        }
      }
    );
    // Update the my-enrollments endpoint to include sorting
    app.get("/api/my-enrollments", verifyFirebaseToken, async (req, res) => {
      const firebaseUid = req.user.uid;

      try {
        const enrollments = await enrollmentCollection
          .find({ userId: firebaseUid })
          .sort({ enrolledAt: -1 }) // Most recent first
          .toArray();

        res.status(200).json({
          success: true,
          total: enrollments.length,
          data: enrollments,
        });
      } catch (error) {
        console.error("Error fetching enrollments:", error);
        res.status(500).json({
          success: false,
          message: "Error retrieving enrollments",
        });
      }
    });

    // Add endpoint to update progress
    app.put(
      "/api/enrollment/progress",
      verifyFirebaseToken,
      async (req, res) => {
        const { courseId, progress, completed } = req.body;
        const firebaseUid = req.user.uid;

        try {
          const result = await enrollmentCollection.updateOne(
            { userId: firebaseUid, courseId: courseId },
            {
              $set: {
                progress: progress,
                completed: completed || false,
                lastAccessed: new Date(),
              },
            }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Enrollment not found",
            });
          }

          res.status(200).json({
            success: true,
            message: "Progress updated successfully",
          });
        } catch (error) {
          console.error("Error updating progress:", error);
          res.status(500).json({
            success: false,
            message: "Error updating progress",
          });
        }
      }
    );

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
