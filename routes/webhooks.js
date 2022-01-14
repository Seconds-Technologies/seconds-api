require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../models');
const moment = require('moment');
const axios = require('axios');
const crypto = require('crypto');
const { URL } = require('url');

function stringIsAValidUrl(s, protocols) {
	try {
		const url = new URL(s);
		return protocols
			? url.protocol
				? protocols.map(x => `${x.toLowerCase()}:`).includes(url.protocol)
				: false
			: true;
	} catch (err) {
		return false;
	}
}

function genUniqueId(prefix="", size=24) {
	// generate the apiKey using random byte sequences
	const rand = crypto.randomBytes(size);
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.repeat(2);
	let secret = prefix ? prefix : "";

	for (let i = 0; i < rand.length; i++) {
		let index = rand[i] % chars.length;
		secret += chars[index];
	}
	console.log('Generated Secret Key', secret);
	return secret;
}

/**
 * Endpoint for creating a new webhook
 *
 */
router.post('/', async (req, res) => {
	try {
		const { email, topics, endpointURL } = req.body;
		const user = await db.User.findOne({ email });
		if (user) {
			const webhookId = genUniqueId("we_", 16)
			const secret = genUniqueId("whsec_");
			// validate the endpoint URL is a valid format with https protocol
			let isValid = stringIsAValidUrl(endpointURL, ['https']);
			// send test message to endpoint to check it is working
			if (isValid) {
				let response = await axios.post(endpointURL, {token: secret});
				if (response.status === 200) {
					let lastUsed = moment().toISOString(true);
					// store the webhook details as a new recorded in the database
					const result = {
						id: webhookId,
						clientId: user._id,
						topics,
						endpointURL,
						lastUsed,
						apiVersion: process.env.CURRENT_API_VERSION,
						secret
					};
					const webhook = await db.Webhook.create(result)
					res.status(200).json({
						success: true,
						message: 'Webhook created successfully',
						webhook
					});
				} else {
					const error = new Error(`Endpoint URL did not respond with 200 status code`);
					error.status = 400;
					throw error;
				}
			} else {
				const error = new Error(`Please enter a valid endpoint URL prefixed with "https://"`);
				error.status = 400;
				throw error;
			}
		} else {
			const error = new Error(`No user found with email address ${email}`);
			error.status = 404;
			throw error;
		}
	} catch (err) {
		console.error(err);
		err.response && err.response.status
			? res.status(err.response.status).json({
					code: err.response.status,
					success: false,
					message: err.message
			  })
			: res.status(500).json({
					success: false,
					code: 500,
					message: err.message
			  });
	}
});

router.get('/', async (req, res) => {
	try {
	    const { email } = req.query;
		const user = await db.User.findOne({ "email": email})
		if (user){
			let webhooks = await db.Webhook.find({"clientId": user._id})
			return res.status(200).json(webhooks)
		} else {
			let error = new Error(`No user found with email ${email}`)
			error.status = 404
			throw error
		}
	} catch (err) {
		console.error(err);
		err && err.status
			? res.status(err.status).json({
				code: err.status,
				success: false,
				message: err.message
			})
			: res.status(500).json({
				success: false,
				code: 500,
				message: err.message
			});
	}
});
router.get('/:id');
router.post('/:id');
router.delete('/:id');

module.exports = router;
