import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

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
let cartCollection; // Cart Collection
let sessionCollection;

export async function connectToMongoDB() {
  if (!uri) {
    throw new Error(
      "Missing MongoDB connection string. Set MONGO_DB_URI or MONGO_URI."
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
      cartCollection = db.collection("cart"); // Initialize Cart Collection
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
    return res.status(401).send({ message: 'unauthorized access' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  const session = await sessionCollection.findOne({ token });
  if (!session) {
    return res.status(401).send({ message: 'unauthorized session' });
  }
  const user = await userCollection.findOne({ _id: new ObjectId(session.userId) });
  req.user = user;
  next();
};

const verifyAdmin = async (req, res, next) => { 
  if (req.user?.role !== 'admin') {
    return res.status(403).send({ message: 'admin forbidden access' });
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
    const result = await userCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch users", error: error.message });
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
    res.status(500).send({ success: false, message: "Failed to fetch role", error: error.message });
  }
});

// ================= PRODUCT API ROUTES =================

app.get("/api/products", async (req, res) => {
  try {
    const query = {};
    if (req.query.category) {
      query.category = req.query.category;
    }
    const products = await productCollection.find(query).toArray();
    res.send(products);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch products" });
  }
});

app.post("/api/products", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const product = req.body;
    product.createdAt = new Date();
    const result = await productCollection.insertOne(product);
    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to add product" });
  }
});

// ================= CART API ROUTES =================

// Add item to cart (or update quantity if already exists for user)
app.post("/api/cart", verifyToken, async (req, res) => {
  try {
    const { productId, name, price, image, quantity = 1 } = req.body;
    const email = req.user.email;

    if (!productId) {
      return res.status(400).send({ success: false, message: "Product ID is required" });
    }

    // Check if the item already exists in the user's cart
    const existingCartItem = await cartCollection.findOne({ email, productId });

    if (existingCartItem) {
      // Update quantity
      const updatedQuantity = existingCartItem.quantity + quantity;
      const result = await cartCollection.updateOne(
        { email, productId },
        { $set: { quantity: updatedQuantity } }
      );
      return res.send({ success: true, message: "Cart item quantity updated", result });
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
      return res.status(201).send({ success: true, message: "Added to cart successfully", insertedId: result.insertedId });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to add to cart", error: error.message });
  }
});

// Get cart items for the logged-in user
app.get("/api/cart", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const cartItems = await cartCollection.find({ email }).toArray();
    res.send(cartItems);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch cart items", error: error.message });
  }
});

// Delete a single item from the cart by its ID
app.delete("/api/cart/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid Cart Item ID" });
    }

    const result = await cartCollection.deleteOne({ _id: new ObjectId(id), email: req.user.email });

    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Cart item not found" });
    }

    res.send({ success: true, message: "Cart item removed successfully", result });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to delete cart item", error: error.message });
  }
});

// Clear user's cart (useful after order checkout)
app.delete("/api/cart", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const result = await cartCollection.deleteMany({ email });
    res.send({ success: true, message: "Cart cleared successfully", deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to clear cart", error: error.message });
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

    res.status(201).send({ success: true, message: "Order placed successfully", insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to place order" });
  }
});

app.get("/api/orders", verifyToken, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { email: req.user.email };
    const orders = await orderCollection.find(query).toArray();
    res.send(orders);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch orders" });
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