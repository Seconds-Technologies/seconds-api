require("dotenv").config();
const express = require("express");
const bodyParser = require('body-parser');
const moment = require('moment-timezone');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jobRoutes = require('./routes');
const stuartRoutes = require('./routes/stuart')
const port = process.env.PORT || 3001;
moment.tz.setDefault("Europe/London");

const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const {validateApiKey} = require("./middleware/auth");

const swaggerDefinition = {
	openapi: '3.0.0',
	info: {
		title: 'Seconds API',
		version: '1.0.0',
		description: 'Welcome to the Seconds API documentation',
		license: {
			name: 'Licensed Under MIT',
			url: 'https://spdx.org/licenses/MIT.html',
		},
		contact: {
			name: 'JSONPlaceholder',
			url: 'https://jsonplaceholder.typicode.com',
		},
	},
	servers: [
		{
			url: 'http://localhost:3001',
			description: 'Development server',
		},
	],
	components: {
		securitySchemes: {
			ApiKeyAuth: {
				type: "apiKey",
				in: "header",
				name: "X-Seconds-Api-Key"
			}
		}
	},
	security: {
		ApiKeyAuth: []
	}
};

const options = {
	swaggerDefinition,
	// Paths to files containing OpenAPI definitions
	apis: ['./routes/index.js'],
};

const swaggerSpec = swaggerJSDoc(options);

// defining the Express index
const index = express();
const db = require('./models/index');

index.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
index.set('port', process.env.PORT || port);

// adding Helmet to enhance your API's security
index.use(helmet());

// using bodyParser to parse JSON bodies into JS objects
index.use(bodyParser.json());

// enabling CORS for all requests
index.use(cors());

// adding morgan to log HTTP requests
index.use(morgan('combined'));

// add middleware
index.use(validateApiKey)

// defining an endpoint to return a welcome message
index.get('/', (req, res) => {
	res.send("WELCOME TO SECONDS API");
});

index.use('/api/v1/jobs', jobRoutes);
index.use('/api/v1/stuart', stuartRoutes);

// starting the server
index.listen(port, () => {
	console.log(`listening on port ${port}`);
});