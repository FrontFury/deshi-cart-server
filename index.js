import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

dotenv.config();

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "deshi-cart-e6902",
    });
const firebaseAuth = getAuth(firebaseApp);

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// MongoDB connection URI
const uri = process.env.MONGO_DB_URI || process.env.MONGO_URI;

let client;
let connectionPromise;
let db;
let userCollection;
let productCollection;
let orderCollection;
let cartCollection;
let wishlistCollection;
let sessionCollection;
let customerProfileCollection;
let sellerProfileCollection;

export async function connectToMongoDB() {
  if (!uri) {
    throw new Error(
      "Missing MongoDB connection string. Set MONGO_DB_URI or MONGO_URI.",
    );
  }

  if (!connectionPromise) {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    connectionPromise = (async () => {
      await client.connect();
      db = client.db("deshimart_db");

      // Collection Initializations for DeshiMart
      userCollection = db.collection("users");
      productCollection = db.collection("products");
      orderCollection = db.collection("orders");
      cartCollection = db.collection("cart");
      wishlistCollection = db.collection("wishlist");
      customerProfileCollection = db.collection("customer_profiles");
      sellerProfileCollection = db.collection("seller_profiles");
      sessionCollection = db.collection("sessions");

      console.log("Successfully connected to DeshiMart MongoDB database!");
      return db;
    })().catch((error) => {
      connectionPromise = undefined;
      client = undefined;
      console.error("MongoDB connection failed:", error);
      throw error;
    });
  }

  return connectionPromise;
}

export async function disconnectFromMongoDB() {
  if (client) {
    await client.close();
    client = undefined;
    connectionPromise = undefined;
    console.log("MongoDB connection closed.");
  }
}

app.use(async (_req, res, next) => {
  try {
    await connectToMongoDB();
    next();
  } catch (error) {
    console.error("Request failed because MongoDB is unavailable:", error);
    res.status(503).send({
      success: false,
      message: "Database is unavailable",
    });
  }
});

// Verification Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(403).send({ message: "forbidden access" });
  }
  let user;
  try {
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    user = await userCollection.findOne({ email: decodedToken.email });
  } catch (firebaseError) {
    const session = await sessionCollection.findOne({ token });
    if (!session) {
      return res.status(401).send({ message: "unauthorized token" });
    }
    user = await userCollection.findOne({ _id: new ObjectId(session.userId) });
  }
  if (!user) {
    return res.status(401).send({ message: "user not found" });
  }
  req.user = user;
  next();
};

const verifyAdmin = async (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).send({ message: "admin forbidden access" });
  }
  next();
};

const attachUserIfAuthenticated = async (req, _res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];
    if (!token) return next();
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    req.user = await userCollection.findOne({ email: decodedToken.email });
  } catch {
    req.user = undefined;
  }
  next();
};

// Base Route
app.get("/", (req, res) => {
  res.send("DeshiMart Server is Running Successfully with Cart! 🛍️🛒");
});

// ================= USER API ROUTES =================

app.post("/api/users", async (req, res) => {
  try {
    const user = req.body;
    const userExists = await userCollection.findOne({ email: user.email });
    if (userExists) {
      return res
        .status(409)
        .send({ success: false, message: "User already exists" });
    }

    user.role = user.role || "customer";
    user.createdAt = new Date();

    const result = await userCollection.insertOne(user);
    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
});

app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await userCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    res
      .status(500)
      .send({
        success: false,
        message: "Failed to fetch users",
        error: error.message,
      });
  }
});

app.get("/api/users/role/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const user = await userCollection.findOne({ email });
    if (user) {
      res.send({ role: user.role });
    } else {
      res.status(404).send({ role: "customer" });
    }
  } catch (error) {
    res
      .status(500)
      .send({
        success: false,
        message: "Failed to fetch role",
        error: error.message,
      });
  }
});

// ================= PRODUCT API ROUTES =================

app.get("/api/products", attachUserIfAuthenticated, async (req, res) => {
  try {
    const query = {};
    const requestedStatus = req.query.status;
    const isAdmin = req.user?.role === "admin";

    if (requestedStatus === "pending" && !isAdmin) {
      return res.status(403).send({ success: false, message: "Admin access required" });
    }

    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.sellerEmail) {
      if (!req.user || (req.user.email !== req.query.sellerEmail && !isAdmin)) {
        return res.status(403).send({ success: false, message: "You can only view your own products" });
      }
      query.sellerEmail = req.query.sellerEmail;
    } else if (requestedStatus) {
      query.status = requestedStatus;
    } else {
      query.status = "approved";
    }
    const products = await productCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.send(products);
  } catch (error) {
    res
      .status(500)
      .send({ success: false, message: "Failed to fetch products" });
  }
});

app.post("/api/products", verifyToken, async (req, res) => {
  try {
    const product = {
      ...req.body,
      sellerEmail: req.user.email,
      status: "pending",
    };
    product.createdAt = new Date();
    const result = await productCollection.insertOne(product);
    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to add product" });
  }
});

app.patch("/api/products/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).send({ success: false, message: "Invalid product status" });
    }

    const result = await productCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      { $set: { status, reviewedAt: new Date(), reviewedBy: req.user.email } },
    );

    if (!result.matchedCount) {
      return res.status(404).send({ success: false, message: "Pending product not found" });
    }

    res.send({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to update product status" });
  }
});

// ================= CART API ROUTES =================

// Add item to cart (or update quantity if already exists for user)
app.post("/api/cart", verifyToken, async (req, res) => {
  try {
    const { productId, name, price, image, quantity = 1 } = req.body;
    const email = req.user.email;

    if (!productId) {
      return res
        .status(400)
        .send({ success: false, message: "Product ID is required" });
    }

    // Check if the item already exists in the user's cart
    const existingCartItem = await cartCollection.findOne({ email, productId });

    if (existingCartItem) {
      // Update quantity
      const updatedQuantity = existingCartItem.quantity + quantity;
      const result = await cartCollection.updateOne(
        { email, productId },
        { $set: { quantity: updatedQuantity } },
      );
      return res.send({
        success: true,
        message: "Cart item quantity updated",
        result,
      });

      app.patch("/api/cart/:id", verifyToken, async (req, res) => {
        try {
          const quantity = Number(req.body.quantity);
          if (!ObjectId.isValid(req.params.id) || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).send({ success: false, message: "A valid quantity is required" });
          }

          const result = await cartCollection.updateOne(
            { _id: new ObjectId(req.params.id), email: req.user.email },
            { $set: { quantity } },
          );
          if (!result.matchedCount) {
            return res.status(404).send({ success: false, message: "Cart item not found" });
          }
          res.send({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          res.status(500).send({ success: false, message: "Failed to update cart item" });
        }
      });
    } else {
      // Insert new cart item
      const newCartItem = {
        email,
        productId,
        name,
        price,
        image,
        quantity,
        createdAt: new Date(),
      };
      const result = await cartCollection.insertOne(newCartItem);
      return res
        .status(201)
        .send({
          success: true,
          message: "Added to cart successfully",
          insertedId: result.insertedId,
        });
    }
  } catch (error) {
    res
      .status(500)
      .send({
        success: false,
        message: "Failed to add to cart",
        error: error.message,
      });
  }
});

// Get cart items for the logged-in user
app.get("/api/cart", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const cartItems = await cartCollection.find({ email }).toArray();
    res.send(cartItems);
  } catch (error) {
    res
      .status(500)
      .send({
        success: false,
        message: "Failed to fetch cart items",
        error: error.message,
      });
  }
});

// Delete a single item from the cart by its ID
app.delete("/api/cart/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid Cart Item ID" });
    }

    const result = await cartCollection.deleteOne({
      _id: new ObjectId(id),
      email: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .send({ success: false, message: "Cart item not found" });
    }

    res.send({
      success: true,
      message: "Cart item removed successfully",
      result,
    });
  } catch (error) {
    res
      .status(500)
      .send({
        success: false,
        message: "Failed to delete cart item",
        error: error.message,
      });
  }
});

// Clear user's cart (useful after order checkout)
app.delete("/api/cart", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const result = await cartCollection.deleteMany({ email });
    res.send({
      success: true,
      message: "Cart cleared successfully",
      deletedCount: result.deletedCount,
    });

    app.get("/api/wishlist", verifyToken, async (req, res) => {
      try {
        const items = await wishlistCollection.find({ email: req.user.email }).sort({ createdAt: -1 }).toArray();
        res.send(items);
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to fetch wishlist" });
      }
    });

    app.post("/api/wishlist", verifyToken, async (req, res) => {
      try {
        const { productId, name, category, price, image } = req.body;
        if (!productId || !name || !image) {
          return res.status(400).send({ success: false, message: "Product details are required" });
        }

        const existing = await wishlistCollection.findOne({ email: req.user.email, productId });
        if (existing) {
          return res.status(409).send({ success: false, message: "Product is already in your wishlist" });
        }

        const result = await wishlistCollection.insertOne({
          email: req.user.email,
          productId,
          name,
          category,
          price,
          image,
          createdAt: new Date(),
        });
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to add to wishlist" });
      }
    });

    app.delete("/api/wishlist/:id", verifyToken, async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).send({ success: false, message: "Invalid wishlist item ID" });
        }
        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(req.params.id),
          email: req.user.email,
        });
        if (!result.deletedCount) {
          return res.status(404).send({ success: false, message: "Wishlist item not found" });
        }
        res.send({ success: true, deletedCount: result.deletedCount });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to remove wishlist item" });
      }
    });
  } catch (error) {
    res
      .status(500)
      .send({
        success: false,
        message: "Failed to clear cart",
        error: error.message,
      });
  }
});

// ================= ORDER API ROUTES =================

app.post("/api/orders", verifyToken, async (req, res) => {
  try {
    const order = req.body;
    order.email = req.user.email; // bind order to current user
    order.status = "Pending";
    order.createdAt = new Date();

    const result = await orderCollection.insertOne(order);

    // Optional: Clear user's cart automatically after a successful order
    await cartCollection.deleteMany({ email: req.user.email });

    res
      .status(201)
      .send({
        success: true,
        message: "Order placed successfully",
        insertedId: result.insertedId,
      });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to place order" });
  }
});

app.get("/api/orders", verifyToken, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { email: req.user.email };
    const orders = await orderCollection.find(query).toArray();
    res.send(orders);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch orders" });
  }
});


app.post("/api/customer/profile", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const profileData = req.body;
    delete profileData._id; // prevent _id modification

    const updateDoc = {
      $set: {
        ...profileData,
        email,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      }
    };

    const result = await customerProfileCollection.updateOne(
      { email },
      updateDoc,
      { upsert: true }
    );

    res.send({ success: true, message: "Customer profile saved successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to save customer profile", error: error.message });
  }
});

// 2. READ (Get Customer Profile by Email)
app.get("/api/customer/profile", verifyToken, async (req, res) => {
  try {
    const email = req.query.email || req.user.email;
    const profile = await customerProfileCollection.findOne({ email });
    
    if (!profile) {
      return res.status(404).send({ success: false, message: "Customer profile not found" });
    }
    
    res.send(profile);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch customer profile", error: error.message });
  }
});

// 3. UPDATE (Modify Customer Profile fields)
app.patch("/api/customer/profile", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const updatedData = req.body;
    delete updatedData._id;
    delete updatedData.email; // email can't be changed

    const result = await customerProfileCollection.updateOne(
      { email },
      { $set: { ...updatedData, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Customer profile not found to update" });
    }

    res.send({ success: true, message: "Customer profile updated successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to update customer profile", error: error.message });
  }
});

// 4. DELETE (Remove Customer Profile)
app.delete("/api/customer/profile", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const result = await customerProfileCollection.deleteOne({ email });

    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Customer profile not found" });
    }

    res.send({ success: true, message: "Customer profile deleted successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to delete customer profile", error: error.message });
  }
});


// ================= SELLER PROFILE CRUD =================

// 1. CREATE / UPDATE (Upsert) Seller Profile
app.post("/api/seller/profile", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const profileData = req.body;
    delete profileData._id;

    const updateDoc = {
      $set: {
        ...profileData,
        email,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      }
    };

    const result = await sellerProfileCollection.updateOne(
      { email },
      updateDoc,
      { upsert: true }
    );

    res.send({ success: true, message: "Seller profile saved successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to save seller profile", error: error.message });
  }
});

// 2. READ (Get Seller Profile by Email)
app.get("/api/seller/profile", verifyToken, async (req, res) => {
  try {
    const email = req.query.email || req.user.email;
    const profile = await sellerProfileCollection.findOne({ email });
    
    if (!profile) {
      return res.status(404).send({ success: false, message: "Seller profile not found" });
    }
    
    res.send(profile);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch seller profile", error: error.message });
  }
});

// 3. UPDATE (Modify Seller Profile fields)
app.patch("/api/seller/profile", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const updatedData = req.body;
    delete updatedData._id;
    delete updatedData.email;

    const result = await sellerProfileCollection.updateOne(
      { email },
      { $set: { ...updatedData, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Seller profile not found to update" });
    }

    res.send({ success: true, message: "Seller profile updated successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to update seller profile", error: error.message });
  }
});

// 4. DELETE (Remove Seller Profile)
app.delete("/api/seller/profile", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const result = await sellerProfileCollection.deleteOne({ email });

    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Seller profile not found" });
    }

    res.send({ success: true, message: "Seller profile deleted successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to delete seller profile", error: error.message });
  }
});

// Start Server Locally
async function startServer() {
  try {
    await connectToMongoDB();
    app.listen(port, () => {
      console.log(`DeshiMart server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
