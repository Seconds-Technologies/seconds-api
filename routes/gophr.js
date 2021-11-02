const express = require("express");
const {JOB_STATUS, WEBHOOK_TYPES } = require("../constants/gophr");
const {STATUS, COMMISSION } = require("../constants");
const db = require("../models");
const moment = require("moment");
const { confirmCharge } = require('../helpers');
const router = express.Router();

function translateGophrStatus(value) {
	switch (value) {
		case JOB_STATUS.NEW:
			return STATUS.NEW
		case JOB_STATUS.PENDING:
			return STATUS.PENDING
		case JOB_STATUS.ACCEPTED:
			return STATUS.DISPATCHING
		case JOB_STATUS.AT_PICKUP:
			return STATUS.DISPATCHING
		case JOB_STATUS.EN_ROUTE:
			return STATUS.EN_ROUTE
		case JOB_STATUS.AT_DELIVERY:
			return STATUS.EN_ROUTE
		case JOB_STATUS.COMPLETED:
			return STATUS.COMPLETED
		case JOB_STATUS.CANCELLED:
			return STATUS.CANCELLED
		default:
			return value
	}
}

async function updateStatus(data){
	try {
		console.log(data)
		const {status: STATUS, external_id: REFERENCE, finished, pickup_eta, delivery_eta, courier_name } = data
		console.log({STATUS, REFERENCE})
		// update the status for the current job
		await db.Job.findOneAndUpdate(
			{"selectedConfiguration.jobReference": REFERENCE},
			{"status": translateGophrStatus(STATUS)},
			{new: true}
		)
		let {_doc: { _id, ...job} } = await db.Job.findOneAndUpdate(
			{"selectedConfiguration.jobReference": REFERENCE},
			{
				'$set': {
					"jobSpecification.packages.$[].pickupStartTime": moment(pickup_eta).toISOString(true),
					"jobSpecification.packages.$[].dropoffStartTime": moment(delivery_eta).toISOString(true),
					"driverInformation.name": courier_name,
					"driverInformation.phone": "N/A",
					"driverInformation.transport": "N/A"
				},
			}, {
				new: true,
				sanitizeProjection: true,
			})
		console.log(job)
		return {jobStatus: STATUS, isFinished: Number(finished)}
	} catch (err) {
		console.error(err)
		throw err
	}
}

async function updateETA(data){
	console.log(data)
	const {external_id: REFERENCE, pickup_eta, delivery_eta } = data
	console.log({ REFERENCE })
	// update the status for the current job
	let {_doc: { _id, ...job} } = await db.Job.findOneAndUpdate(
		{"selectedConfiguration.jobReference": REFERENCE},
		{
			'$set': {
				"jobSpecification.packages.$[].pickupStartTime": moment(pickup_eta).toISOString(true),
				"jobSpecification.packages.$[].dropoffStartTime": moment(delivery_eta).toISOString(true),
			},
		}, {
			new: true,
			sanitizeProjection: true,
		})
	console.log(job)
	return {pickup_eta, delivery_eta}
}

router.post("/", async (req, res) => {
	try {
		// GOPHR
		const {api_key, webhook_type, external_id } = req.body;
		if (api_key === String(process.env.GOPHR_API_KEY)) {
			if (webhook_type === WEBHOOK_TYPES.STATUS) {
				let { jobStatus, isFinished } = await updateStatus(req.body);
				console.log('--------------------------------');
				console.log('NEW STATUS:', jobStatus);
				console.log('--------------------------------');
				if (isFinished) {
					let { clientId, paymentIntentId } = await db.Job.findOne({"selectedConfiguration.jobReference": external_id}, {})
					console.log("****************************************************************")
					console.log("GOPHR DELIVERY COMPLETEEEEEEE!")
					console.log("****************************************************************")
					let { stripeCustomerId, subscriptionPlan } = await db.User.findOne({_id: clientId}, {});
					confirmCharge(COMMISSION[subscriptionPlan.toUpperCase()].fee, stripeCustomerId, paymentIntentId)
				}
			} else if (webhook_type === WEBHOOK_TYPES.ETA) {
				let jobETA = await updateETA(req.body);
				console.log('--------------------------------');
				console.log('NEW ETA:');
				console.table(jobETA);
				console.log('--------------------------------');
			} else {
				throw new Error(`Unknown webhook type, ${webhook_type}`);
			}
			res.status(200).json({
				success: true,
				message: "DELIVERY_JOB_UPDATED"
			});
		} else {
			throw new Error('API KEY IS INVALID!');
		}
	} catch (err) {
		console.error(err)
		res.status(200).json({
			success: false,
			message: err.message
		})
	}
})

module.exports = router;