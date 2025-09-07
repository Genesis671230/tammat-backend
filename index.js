const express = require("express");
const db = require("./db/config");
const route = require("./controllers/route");
const bodyParser = require("body-parser");
const cors = require("cors");
const port = 5001;
require("dotenv").config();
const fs = require("fs");
const path = require("path");

//Setup Express App
const app = express();
// Middleware
app.use(bodyParser.json());

// Set up CORS
const allowedOrigins = ["http://localhost:5173","http://localhost:5174","https://zephrex.com"];

const corsOptions = {
	origin: function (origin, callback) {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);

		if (allowedOrigins.includes(origin)) {
			callback(null, true); // Allow the request if the origin is in the allowed list
		} else {
			callback(new Error("Not allowed by CORS")); // Reject the request if the origin is not in the allowed list
		}
	},
	credentials: true, // Optional: Set to true if you need to send cookies or auth headers with the request
};

app.use(cors(corsOptions));

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//API Routes
app.use(
	"/api",
	function hello(req, res, next) {
		console.log("Hello Api");
		return next();
	},
	route
);



// New TAMMAT Visa Service routes
const visaRoutes = require('./controllers/visa/_routes');
const authRoutes = require('./controllers/auth/_routes');
const chatRoutes = require('./controllers/chat/_routes');
const servicesRoutes = require('./controllers/services/_routes');
const notificationsRoutes = require('./controllers/notifications/_routes');
const dependentsRoutes = require('./controllers/dependents/_routes');
const paymentsRoutes = require('./controllers/payments/_routes');
const adminRoutes = require('./controllers/admin/_routes');
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/visa', visaRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/services', servicesRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/dependents', dependentsRoutes);
app.use('/api/v1/services/payments', paymentsRoutes);
app.use('/api/v1/admin', adminRoutes);

// Chat WebSocket routes
const { router: chatWebSocketRoutes, setupWebSocket } = require('./routes/chat');
app.use('/api/chat', chatWebSocketRoutes);

// WhatsApp messaging endpoint (disable in tests)
if (process.env.NODE_ENV !== 'test') {
	app.use("/api/sendWhatsappMessage", (req, res) => {
		const { sendWhatsappMessage } = require("./utills/whatsAppMessage");
		sendWhatsappMessage(req.body);
		res.send("Message is sent");
	});
}

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({
		success: true,
		message: "Mobius Securitization Platform API is healthy",
		version: "2.0.0",
		timestamp: new Date().toISOString(),
	});
});

// Routes
app.get("/", async (req, res) => {
	res.json({
		message: "Welcome to Mobius Securitization Platform",
		description: "Enterprise-grade tokenization platform powered by ERC-3643 with comprehensive compliance for UAE, Singapore, and Switzerland jurisdictions",
		version: "2.0.0"
	});
});

// Export app for testing
module.exports = app;

// Start server only when running directly
if (require.main === module) {
	const http = require('http');
	const WebSocketServer = require('./websocket-server');

	const server = http.createServer(app);

	// Initialize WebSocket server
	const wsServer = new WebSocketServer(server);

	// Setup chat WebSocket functionality
	setupWebSocket(wsServer.io);

	// Make WebSocket server available in app context
	app.set('wsServer', wsServer);

	server.listen(port, () => {
		const protocol =
			process.env.HTTPS === "true" || process.env.NODE_ENV === "production"
				? "https"
				: "http";
		const { address, port } = server.address();
		const host = address === "::" ? "127.0.0.1" : address;
		console.log(`🚀 TAMMAT Visa Services Platform listening at ${protocol}://${host}:${port}`);
		console.log(`🔌 WebSocket server available at ws://${host}:${port}`);
		console.log(`🤖 AI Features: ${require('./services/openaiService').isAvailable() ? 'Enabled' : 'Disabled'}`);
		console.log(`📋 Services Catalog: ${require('./services/catalogLoader').getStats().totalServices} services available`);
	});

	// Connect to MongoDB
	const DATABASE_URL = process.env.DB_URL || "mongodb://127.0.0.1" + ":27017";
	const DATABASE = process.env.DB || "tammat";

	db(DATABASE_URL, DATABASE);
}
