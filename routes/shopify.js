require('dotenv').config();
const express = require('express');
const db = require('../models');
const {
	genJobReference,
	getResultantQuotes,
	chooseBestProvider,
	providerCreatesJob,
	genOrderNumber,
} = require('../helpers');
const { DELIVERY_TYPES, VEHICLE_CODES_MAP, VEHICLE_CODES, STATUS } = require('../constants');
const moment = require('moment');
const router = express.Router();

function convertWeightToVehicleCode(total_weight) {
	let vehicleName;
	let vehicleCode;
	console.log(Object.keys(VEHICLE_CODES_MAP));

	VEHICLE_CODES.forEach(code => {
		const { name, weight } = VEHICLE_CODES_MAP[code];
		if (total_weight > weight) {
			vehicleCode = code;
			vehicleName = name;
		}
	});
	return { vehicleName, vehicleCode };
}

async function createNewJob(order, user) {
	try {
		const clientRefNumber = genJobReference();
		const itemsCount = order.line_items.reduce(() => (prev, curr) => prev + curr.quantity);
		const packageDescription = order.line_items.map(order => order['variant_title']).toString();
		const vehicleType = convertWeightToVehicleCode(order['total_weight'] / 1000).vehicleCode;

		const payload = {
			pickupAddress: user.address,
			pickupFormattedAddress: {
				street: order.shipping_address['address1'],
				city: order.shipping_address['city'],
				postcode: order.shipping_address['zip'],
				countryCode: 'GB',
			},
			pickupPhoneNumber: user.phone,
			pickupEmailAddress: user.email,
			pickupBusinessName: user.company,
			pickupFirstName: user.firstname,
			pickupLastName: user.lastname,
			pickupInstructions: '',
			dropoffAddress: `${order.shipping_address['address1']} ${order.shipping_address['city']} ${order.shipping_address['zip']}`,
			dropoffFormattedAddress: {
				street: order.shipping_address['address1'],
				city: order.shipping_address['city'],
				postcode: order.shipping_address['zip'],
				countryCode: 'GB',
			},
			dropoffPhoneNumber: order.phone,
			dropoffEmailAddress: order.email,
			dropoffBusinessName: order.shipping_address.company,
			dropoffFirstName: order.customer.first_name,
			dropoffLastName: order.customer.last_name,
			dropoffInstructions: '',
			packagePickupStartTime: undefined,
			packagePickupEndTime: undefined,
			packageDropoffStartTime: undefined,
			packageDropoffEndTime: undefined,
			packageDeliveryType: DELIVERY_TYPES.ON_DEMAND,
			packageDescription,
			itemsCount,
			vehicleType,
		};
		console.log("-----------------------------------")
		console.log("Payload")
		console.log(payload)
		console.log("-----------------------------------")
		const { _id: email, clientId, selectionStrategy, subscriptionId } = user;
		const QUOTES = await getResultantQuotes(payload);
		const bestQuote = chooseBestProvider(selectionStrategy, QUOTES);
		const providerId = bestQuote.providerId;
		const winnerQuote = bestQuote.id;
		console.log('SUBSCRIPTION ID', !!subscriptionId);
		if (subscriptionId) {
			const {
				id: spec_id,
				trackingURL,
				deliveryFee
			} = await providerCreatesJob(providerId.toLowerCase(), clientRefNumber, selectionStrategy, payload);

			const jobs = await db.Job.find({});

			let job = {
				createdAt: moment().format(),
				jobSpecification: {
					id: spec_id,
					orderNumber: genOrderNumber(jobs.length),
					deliveryType: payload.packageDeliveryType,
					packages: [
						{
							description: packageDescription,
							dropoffLocation: {
								fullAddress: payload.dropoffAddress,
								street_address: payload.dropoffFormattedAddress.street,
								city: payload.dropoffFormattedAddress.city,
								postcode: payload.dropoffFormattedAddress.postcode,
								country: 'UK',
								phoneNumber: payload.dropoffPhoneNumber,
								email: payload.dropoffEmailAddress,
								firstName: payload.dropoffFirstName,
								lastName: payload.dropoffLastName,
								businessName: payload.dropoffBusinessName,
								instructions: payload.dropoffInstructions,
							},
							dropoffStartTime: payload.packageDropoffStartTime,
							dropoffEndTime: payload.packageDropoffEndTime,
							itemsCount,
							pickupStartTime: payload.packagePickupStartTime,
							pickupEndTime: payload.packagePickupEndTime,
							pickupLocation: {
								fullAddress: payload.pickupAddress,
								street_address: payload.pickupFormattedAddress.street,
								city: payload.pickupFormattedAddress.city,
								postcode: payload.pickupFormattedAddress.postcode,
								country: 'UK',
								phoneNumber: payload.pickupPhoneNumber,
								email: payload.pickupEmailAddress,
								firstName: payload.pickupFirstName,
								lastName: payload.pickupLastName,
								businessName: payload.pickupBusinessName,
								instructions: payload.pickupInstructions,
							},
							transport: VEHICLE_CODES_MAP[payload.vehicleType].name,
						},
					],
				},
				selectedConfiguration: {
					jobReference: clientRefNumber,
					createdAt: moment().format(),
					deliveryFee,
					winnerQuote,
					providerId,
					trackingURL,
					quotes: QUOTES,
				},
				status: STATUS.NEW,
			};
			// Append the selected provider job to the jobs database
			const createdJob = await db.Job.create({ ...job, clientId });
			console.log(createdJob)
			// Add the delivery to the users list of jobs
			await db.User.updateOne({ "email": email }, { $push: { jobs: createdJob._id } }, { new: true });
			return true
		}
	} catch (err) {
		console.error(err);
		throw err
	}
}

router.post('/', async (req, res) => {
	try {
		// filter the request topic and shop domain
		console.log(req.headers);
		const topic = req.headers['x-shopify-topic'];
		const shop = req.headers['x-shopify-shop-domain'];
		console.table({ topic, shop });
		if (topic === 'orders/create') {
			console.log('-----------------------------');
			console.log('ORDER ID:');
			console.log(req.body.id);
			console.log('-----------------------------');
			// check that the shop domain belongs to a user
			const user = await db.User.findOne({ 'shopify.domain': shop });
			console.log(user);
			if (user) {
				await createNewJob(req.body, user);
				res.status(200).json({
					status: 'SUCCESS',
					message: 'webhook received',
				});
			} else {
				res.status(404).json({
					status: 'USER_NOT_FOUND',
					message: `Failed to find a user with shopify domain ${shop}`,
				});
			}
		} else {
			res.status(400).json({
				status: 'UNKNOWN_TOPIC',
				message: `Webhook topic ${topic} is not recognised`,
			});
		}
	} catch (err) {
		console.error(err);
		res.status(500).json({
			error: { ...err },
		});
	}
});

module.exports = router;
