# 🛒 DeshiCart – Server

**DeshiCart** is a full-stack e-commerce platform designed to provide a seamless online shopping experience. This repository contains the backend server responsible for handling APIs, user management, product operations, orders, and database communication.

## 🚀 Features

- 🔐 User Authentication & Authorization
- 👤 User Profile Management
- 🛍️ Product Management (Create, Read, Update & Delete)
- 📦 Order Management
- 🛒 Shopping Cart Management
- 💳 Payment Integration (if configured)
- 🔎 Product Search & Filtering
- 📊 Admin Dashboard API Support
- 🌐 RESTful API Architecture
- 🔒 Secure Environment Configuration
- ⚡ Efficient Database Operations

## 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| Node.js | JavaScript Runtime |
| Express.js | Backend Framework |
| MongoDB | NoSQL Database |
| Firebase Admin | Authentication & User Verification |
| CORS | Cross-Origin Resource Sharing |
| dotenv | Environment Variables |
| Nodemailer | Email Communication |

## 📁 Project Structure

```text
DeshiCart-Server/
│
├── index.js
├── package.json
├── package-lock.json
├── .env
├── .gitignore
│
└── node_modules/
```

## ⚙️ Installation & Setup

### 1. Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
```

### 2. Navigate to the Project Directory

```bash
cd DeshiCart-Server
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory.

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
```

Add other required Firebase or email credentials if your application uses them.

### 5. Start the Development Server

```bash
npm run dev
```

Or:

```bash
node index.js
```

The server will run at:

```text
http://localhost:5000
```

## 🔗 API Endpoints

API endpoints depend on the implemented backend routes.

Example endpoint structure:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Check server status |
| GET | `/products` | Get all products |
| GET | `/products/:id` | Get product details |
| POST | `/products` | Add a new product |
| PUT | `/products/:id` | Update product |
| DELETE | `/products/:id` | Delete product |
| GET | `/users` | Get users |
| POST | `/orders` | Create an order |

## 🔐 Environment Variables

Never expose sensitive credentials in your public repository.

Make sure `.env` is included in `.gitignore`.

```gitignore
node_modules/
.env
.env.local
```

## 🌍 Deployment

The backend can be deployed using platforms such as:

- [Vercel](https://vercel.com/)
- [Render](https://render.com/)
- [Railway](https://railway.com/)

Configure the environment variables in your deployment platform before deploying.

## 👨‍💻 Developer

**DeshiCart Development Team**

Built with ❤️ using Node.js, Express.js, and MongoDB.

---

⭐ If you find this project useful, don't forget to give it a star!
