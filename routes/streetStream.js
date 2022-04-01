require('dotenv').config();
const express = require('express');
const { JOB_STATUS } = require('../constants/streetStream');
const db = require('../models');
const confirmCharge = require('../services/payments');
const sendSMS = require('../services/sms');
const { sendWebhookUpdate } = require('../helpers');
const { updateJob } = require('../helpers/couriers/streetStream');
const router = express.Router();

router.post('/', async (req, res) => {
	try {
		let job = await updateJob(req.body);
		sendWebhookUpdate(job, 'delivery.update')
			.then(() => 'STREET_STREAM JOB UPDATE SENT TO CLIENT')
			.catch();
		if (req.body.status === JOB_STATUS.COMPLETED_SUCCESSFULLY) {
			let {
				clientId,
				commissionCharge,
				jobSpecification: { jobReference, orderNumber, deliveryType, deliveries },
				selectedConfiguration: { deliveryFee }
			} = await db.Job.findOne({ 'jobSpecification.id': req.body.jobId }, {});
			console.log('****************************************************************');
			console.log('STREET STREAM DELIVERY COMPLETEEEEEEE!');
			console.log('****************************************************************');
			let { company, stripeCustomerId, subscriptionId, subscriptionItems } = await db.User.findOne(
				{ _id: clientId },
				{}
			);
			let settings = await db.Settings.findOne({ clientId})
			let canSend = settings ? settings.sms : false
			confirmCharge(
				{ stripeCustomerId, subscriptionId },
				subscriptionItems,
				{ commissionCharge, deliveryFee, deliveryType, description: `Order: ${orderNumber}\tRef: ${jobReference}` },
				deliveries.length
			)
				.then(res => console.log('Charge confirmed:', res))
				.catch(err => console.error(err));
			const template = `Your ${company} order has been delivered. Thanks for ordering with ${company}`;
			sendSMS(job.jobSpecification.deliveries[0].dropoffLocation.phoneNumber, template, subscriptionItems, canSend).then(() =>
				console.log('SMS sent successfully!')
			);
		}
		res.status(200).send({
			success: true,
			status: 'NEW_JOB_STATUS',
			message: `Job status is now ${req.body.status}`
		});
	} catch (err) {
		console.error(err);
		res.status(200).json({
			success: false,
			status: err.status,
			message: err.message
		});
	}
});

module.exports = router;
